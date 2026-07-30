import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  publishWithRestore,
  verifyDeployment,
  type VerificationExpectation,
} from "../market-data/deployment.ts";
import { isSafeMarketRunId } from "../market-data/review.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import {
  promoteCandidate,
  restoreCurrent,
  type StoragePaths,
} from "../market-data/storage.ts";
import {
  exportPages,
  type DeploymentManifest,
} from "./export-pages.ts";

const PROJECT_NAME = "ai-market-atlas";
const PRODUCTION_BASE_URL = "https://aimarket.tycreation.online";
const MANIFEST_NAME = ".market-deployment.json";

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<void>;

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function assertPagesDirectory(path: string, expectedName?: string): string {
  const absolute = resolve(path);
  const name = basename(absolute);
  if (
    basename(dirname(absolute)) !== "work" ||
    !["pages-candidate", "pages-last-good"].includes(name) ||
    (expectedName !== undefined && name !== expectedName)
  ) {
    throw new Error("Pages directory is invalid or unsafe");
  }
  return absolute;
}

async function assertDirectoryTreeSafe(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`Pages directory is unsafe: ${path}`);
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Pages directory contains a symlink: ${child}`);
    }
    if (entry.isDirectory()) await assertDirectoryTreeSafe(child);
  }
}

const defaultCommandRunner: CommandRunner = async (command, args) => {
  await new Promise<void>((resolvePromise, reject) => {
    let timedOut = false;
    const child = spawn(command, args, {
      shell: false,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, 10 * 60 * 1_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} timed out after ten minutes`));
        return;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}`,
        ),
      );
    });
  });
};

export async function wranglerDeploy(
  directory: string,
  branch: string,
  runner: CommandRunner = defaultCommandRunner,
): Promise<string> {
  const absoluteDirectory = assertPagesDirectory(directory);
  if (dirname(absoluteDirectory) !== resolve("work")) {
    throw new Error("Cloudflare Pages directory is invalid or unsafe");
  }
  try {
    const workMetadata = await lstat(dirname(absoluteDirectory));
    if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
      throw new Error("Cloudflare Pages work directory is unsafe");
    }
    const outputMetadata = await lstat(absoluteDirectory);
    if (outputMetadata.isSymbolicLink() || !outputMetadata.isDirectory()) {
      throw new Error("Cloudflare Pages output directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (
    branch !== "main" &&
    !(
      branch.startsWith("market-update-") &&
      isSafeMarketRunId(branch.slice("market-update-".length))
    )
  ) {
    throw new Error("Cloudflare Pages branch is invalid or unsafe");
  }
  await runner("npx", [
    "wrangler",
    "pages",
    "deploy",
    directory,
    "--project-name",
    PROJECT_NAME,
    "--branch",
    branch,
  ]);
  return branch === "main"
    ? PRODUCTION_BASE_URL
    : `https://${branch}.${PROJECT_NAME}.pages.dev`;
}

export async function copyDirectoryAtomically(
  from: string,
  to: string,
): Promise<void> {
  const source = assertPagesDirectory(from, "pages-candidate");
  const destination = assertPagesDirectory(to, "pages-last-good");
  if (dirname(source) !== dirname(destination)) {
    throw new Error("Pages directories must share the same work directory");
  }
  await assertDirectoryTreeSafe(source);
  try {
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("last-good Pages directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const temporary = join(
    dirname(destination),
    `.pages-last-good.${process.pid}.${randomUUID()}.tmp`,
  );
  const backup = join(
    dirname(destination),
    `.pages-last-good.${process.pid}.${randomUUID()}.backup`,
  );
  let movedExisting = false;
  try {
    await cp(source, temporary, {
      recursive: true,
      dereference: false,
      force: false,
      errorOnExist: true,
    });
    await assertDirectoryTreeSafe(temporary);
    try {
      await rename(destination, backup);
      movedExisting = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (movedExisting) await rename(backup, destination);
      throw error;
    }
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function readManifest(directory: string): Promise<DeploymentManifest> {
  const path = join(assertPagesDirectory(directory), MANIFEST_NAME);
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("deployment manifest must be a regular file");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error("deployment manifest must contain valid JSON");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as { runId?: unknown }).runId !== "string" ||
    typeof (value as { dataCutoff?: unknown }).dataCutoff !== "string" ||
    !Array.isArray((value as { routes?: unknown }).routes) ||
    !(value as { routes: unknown[] }).routes.every(
      (route) => typeof route === "string",
    ) ||
    !Array.isArray((value as { archiveMonths?: unknown }).archiveMonths) ||
    !(value as { archiveMonths: unknown[] }).archiveMonths.every(
      (month) => typeof month === "string",
    ) ||
    !Array.isArray((value as { sourceIds?: unknown }).sourceIds) ||
    !(value as { sourceIds: unknown[] }).sourceIds.every(
      (sourceId) => typeof sourceId === "string",
    ) ||
    (value as { archiveSourceIds?: unknown }).archiveSourceIds === null ||
    typeof (value as { archiveSourceIds?: unknown }).archiveSourceIds !==
      "object" ||
    Array.isArray((value as { archiveSourceIds?: unknown }).archiveSourceIds) ||
    !Object.values(
      (value as { archiveSourceIds: Record<string, unknown> }).archiveSourceIds,
    ).every(
      (sourceIds) =>
        Array.isArray(sourceIds) &&
        sourceIds.every((sourceId) => typeof sourceId === "string"),
    )
  ) {
    throw new Error("deployment manifest is invalid");
  }
  return value as DeploymentManifest;
}

async function pathExistsAsSafeDirectory(path: string): Promise<boolean> {
  try {
    await assertDirectoryTreeSafe(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function readSnapshot(path: string, label: string) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  assertMarketSnapshot(value);
  return value;
}

async function runDeployPages(args: string[]): Promise<void> {
  if (args.length !== 0) {
    throw new Error("market:deploy does not accept command-line arguments");
  }
  const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const marketRoot = join(projectRoot, "data", "market");
  const candidatePath = join(marketRoot, "candidate.json");
  const currentPath = join(marketRoot, "current.json");
  const candidateDirectory = join(projectRoot, "work", "pages-candidate");
  const lastGoodDirectory = join(projectRoot, "work", "pages-last-good");
  const candidate = await readSnapshot(candidatePath, "candidate");
  const reviewPath = join(marketRoot, "reviews", `${candidate.runId}.json`);
  const storagePaths: StoragePaths = {
    candidatePath,
    reviewPath,
    currentPath,
    runsDir: join(marketRoot, "runs"),
    monthlyIndexPath: join(marketRoot, "monthly", "index.json"),
  };

  if (!(await pathExistsAsSafeDirectory(lastGoodDirectory))) {
    const current = await readSnapshot(currentPath, "current snapshot");
    const currentExport = await exportPages({
      projectRoot,
      snapshotPath: currentPath,
      outputDirectory: lastGoodDirectory,
    });
    try {
      await verifyDeployment(
        PRODUCTION_BASE_URL,
        currentExport.routes,
        {
          runId: current.runId,
          dataCutoff: current.dataCutoff,
          archiveMonths: currentExport.archiveMonths,
          sourceIds: currentExport.sourceIds,
          archiveSourceIds: currentExport.archiveSourceIds,
        },
      );
    } catch (error) {
      await rm(lastGoodDirectory, { recursive: true, force: true });
      throw new Error(
        `Cannot seed last-known-good from unverified production: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else {
    await readManifest(lastGoodDirectory);
  }

  const candidateExport = await exportPages({
    projectRoot,
    snapshotPath: candidatePath,
    outputDirectory: candidateDirectory,
  });
  const activeDirectoryByUrl = new Map<string, string>();
  const dependencies = {
    deploy: async (directory: string, branch: string) => {
      const url = await wranglerDeploy(directory, branch);
      activeDirectoryByUrl.set(url, directory);
      if (branch === "main") {
        activeDirectoryByUrl.set(PRODUCTION_BASE_URL, directory);
      }
      return url;
    },
    verify: async (baseUrl: string, routes: string[]) => {
      const directory = activeDirectoryByUrl.get(baseUrl);
      if (!directory) {
        throw new Error("no deployed asset directory is bound to verification URL");
      }
      const manifest = await readManifest(directory);
      const expectation: VerificationExpectation = {
        runId: manifest.runId,
        dataCutoff: manifest.dataCutoff,
        archiveMonths: manifest.archiveMonths,
        sourceIds: manifest.sourceIds,
        archiveSourceIds: manifest.archiveSourceIds,
      };
      if (
        routes.length !== manifest.routes.length ||
        routes.some((route, index) => route !== manifest.routes[index])
      ) {
        throw new Error("verification routes do not match deployed assets");
      }
      await verifyDeployment(baseUrl, routes, expectation);
    },
    copyDirectory: copyDirectoryAtomically,
    promote: () => promoteCandidate(storagePaths),
    restoreSnapshot: (promotion: Awaited<ReturnType<typeof promoteCandidate>>) =>
      restoreCurrent(storagePaths, promotion),
  };
  const promotion = await publishWithRestore(dependencies, {
    runId: candidate.runId,
    candidatePath,
    reviewPath,
    candidateDirectory,
    lastGoodDirectory,
    productionBaseUrl: PRODUCTION_BASE_URL,
    routes: candidateExport.routes,
  });
  process.stdout.write(
    `${JSON.stringify({ published: true, runId: promotion.runId })}\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runDeployPages(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
