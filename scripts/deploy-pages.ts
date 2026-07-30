import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_MANIFEST_NAME,
  hashArtifactTree,
} from "../market-data/artifact-tree.ts";
import {
  authorizeCandidatePublication,
  publishWithRestore,
  verifyDeployment,
  type VerificationExpectation,
} from "../market-data/deployment.ts";
import { hashCandidate, isSafeMarketRunId } from "../market-data/review.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import {
  promoteCandidate,
  projectMonthlyArchive,
  restoreCurrent,
  type StoragePaths,
} from "../market-data/storage.ts";
import {
  exportPages,
  type DeploymentManifest,
} from "./export-pages.ts";

const PROJECT_NAME = "ai-market-atlas";
const PRODUCTION_BASE_URL = "https://aimarket.tycreation.online";

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

type PublicationLockOwner = {
  schemaVersion: 1;
  runId: string;
  pid: number;
  createdAt: string;
  ownerToken: string;
};

const PUBLICATION_LOCK_NAME = ".market-publication.lock";
const STALE_LOCK_AGE_MS = 60 * 60 * 1_000;

function isPublicationLockOwner(value: unknown): value is PublicationLockOwner {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const owner = value as Partial<PublicationLockOwner>;
  return (
    owner.schemaVersion === 1 &&
    typeof owner.runId === "string" &&
    isSafeMarketRunId(owner.runId) &&
    Number.isSafeInteger(owner.pid) &&
    Number(owner.pid) > 0 &&
    typeof owner.createdAt === "string" &&
    !Number.isNaN(Date.parse(owner.createdAt)) &&
    new Date(owner.createdAt).toISOString() === owner.createdAt &&
    typeof owner.ownerToken === "string" &&
    /^[a-f0-9-]{36}$/.test(owner.ownerToken)
  );
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

async function existingPublicationLock(path: string): Promise<PublicationLockOwner> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("publication lock is unsafe");
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isPublicationLockOwner(value)) {
      throw new Error("publication lock is unsafe");
    }
    return value;
  } catch (error) {
    if (error instanceof Error && /publication lock is unsafe/i.test(error.message)) {
      throw error;
    }
    throw new Error("publication lock is unsafe");
  }
}

export async function withPublicationLock<T>(
  projectRoot: string,
  runId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isSafeMarketRunId(runId)) {
    throw new Error("publication lock runId is unsafe");
  }
  const workDirectory = resolve(projectRoot, "work");
  await mkdir(workDirectory, { recursive: true });
  const workMetadata = await lstat(workDirectory);
  if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
    throw new Error("publication lock work directory is unsafe");
  }
  const path = join(workDirectory, PUBLICATION_LOCK_NAME);
  const owner: PublicationLockOwner = {
    schemaVersion: 1,
    runId,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    ownerToken: randomUUID(),
  };
  try {
    await writeFile(path, `${JSON.stringify(owner)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error;
    }
    const existing = await existingPublicationLock(path);
    if (
      Date.now() - Date.parse(existing.createdAt) > STALE_LOCK_AGE_MS &&
      !processExists(existing.pid)
    ) {
      throw new Error(
        `publication lock is stale for ${existing.runId}; manual cleanup required`,
      );
    }
    throw new Error(`publication lock is active for ${existing.runId}`);
  }

  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  try {
    const current = await existingPublicationLock(path);
    if (current.ownerToken !== owner.ownerToken) {
      throw new Error("publication lock ownership changed before release");
    }
    await rm(path);
  } catch (releaseError) {
    if (operationError !== undefined) {
      throw new AggregateError(
        [operationError, releaseError],
        "publication and lock release both failed",
      );
    }
    throw releaseError;
  }
  if (operationError !== undefined) throw operationError;
  return result as T;
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
  expectedArtifactTreeSha256: string,
  expectedManifestSha256: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(expectedArtifactTreeSha256)) {
    throw new Error("expected artifact tree hash is required");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256)) {
    throw new Error("expected deployment manifest hash is required");
  }
  const source = assertPagesDirectory(from, "pages-candidate");
  const destination = assertPagesDirectory(to, "pages-last-good");
  if (dirname(source) !== dirname(destination)) {
    throw new Error("Pages directories must share the same work directory");
  }
  if ((await hashArtifactTree(source)) !== expectedArtifactTreeSha256) {
    throw new Error("source artifact tree does not match");
  }
  await readDeploymentManifest(source, {
    expectedArtifactTreeSha256,
    expectedManifestSha256,
  });
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
    if ((await hashArtifactTree(temporary)) !== expectedArtifactTreeSha256) {
      throw new Error("copied artifact tree does not match");
    }
    const copiedManifestPath = join(temporary, ARTIFACT_MANIFEST_NAME);
    const copiedManifestMetadata = await lstat(copiedManifestPath);
    if (
      copiedManifestMetadata.isSymbolicLink() ||
      !copiedManifestMetadata.isFile()
    ) {
      throw new Error("copied deployment manifest is unsafe");
    }
    let copiedManifest: unknown;
    try {
      copiedManifest = JSON.parse(
        await readFile(copiedManifestPath, "utf8"),
      ) as unknown;
    } catch {
      throw new Error("copied deployment manifest must contain valid JSON");
    }
    if (hashCandidate(copiedManifest) !== expectedManifestSha256) {
      throw new Error("copied deployment manifest hash does not match");
    }
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

export async function readDeploymentManifest(
  directory: string,
  expected: {
    expectedCandidateSha256?: string;
    expectedArtifactTreeSha256?: string;
    expectedManifestSha256?: string;
  } = {},
): Promise<DeploymentManifest> {
  directory = assertPagesDirectory(directory);
  const path = join(directory, ARTIFACT_MANIFEST_NAME);
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
    typeof (value as { candidateSha256?: unknown }).candidateSha256 !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      (value as { candidateSha256: string }).candidateSha256,
    ) ||
    typeof (value as { artifactTreeSha256?: unknown }).artifactTreeSha256 !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      (value as { artifactTreeSha256: string }).artifactTreeSha256,
    ) ||
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
    ) ||
    (value as { routeIdentities?: unknown }).routeIdentities === null ||
    typeof (value as { routeIdentities?: unknown }).routeIdentities !==
      "object" ||
    Array.isArray((value as { routeIdentities?: unknown }).routeIdentities)
  ) {
    throw new Error("deployment manifest is invalid");
  }
  const manifest = value as DeploymentManifest;
  if (
    expected.expectedCandidateSha256 !== undefined &&
    manifest.candidateSha256 !== expected.expectedCandidateSha256
  ) {
    throw new Error("deployment manifest candidate hash does not match");
  }
  if (
    expected.expectedArtifactTreeSha256 !== undefined &&
    manifest.artifactTreeSha256 !== expected.expectedArtifactTreeSha256
  ) {
    throw new Error("deployment manifest artifact tree hash does not match");
  }
  if (
    expected.expectedManifestSha256 !== undefined &&
    hashCandidate(manifest) !== expected.expectedManifestSha256
  ) {
    throw new Error("deployment manifest hash does not match");
  }
  if ((await hashArtifactTree(directory)) !== manifest.artifactTreeSha256) {
    throw new Error("deployment manifest artifact tree does not match");
  }
  return manifest;
}

export async function revalidatePublicationState(options: {
  runId: string;
  candidatePath: string;
  reviewPath: string;
  candidateDirectory: string;
  expectedCandidateSha256: string;
  expectedArtifactTreeSha256: string;
  expectedManifestSha256: string;
}): Promise<void> {
  const authorization = await authorizeCandidatePublication(options);
  if (authorization.candidateSha256 !== options.expectedCandidateSha256) {
    throw new Error("publication candidate hash does not match authorization");
  }
  await readDeploymentManifest(options.candidateDirectory, {
    expectedCandidateSha256: options.expectedCandidateSha256,
    expectedArtifactTreeSha256: options.expectedArtifactTreeSha256,
    expectedManifestSha256: options.expectedManifestSha256,
  });
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

export type DeployPagesRuntime = {
  exportPages: typeof exportPages;
  verifyDeployment: typeof verifyDeployment;
  publishWithRestore: typeof publishWithRestore;
};

const defaultRuntime: DeployPagesRuntime = {
  exportPages,
  verifyDeployment,
  publishWithRestore,
};

async function runLockedDeployPagesAtProjectRoot(
  projectRoot: string,
  runtime: DeployPagesRuntime,
  lockedRunId: string,
): Promise<void> {
  const marketRoot = join(projectRoot, "data", "market");
  const candidatePath = join(marketRoot, "candidate.json");
  const currentPath = join(marketRoot, "current.json");
  const candidateDirectory = join(projectRoot, "work", "pages-candidate");
  const lastGoodDirectory = join(projectRoot, "work", "pages-last-good");
  const candidate = await readSnapshot(candidatePath, "candidate");
  if (candidate.runId !== lockedRunId) {
    throw new Error("candidate runId changed after publication lock acquisition");
  }
  const reviewPath = join(marketRoot, "reviews", `${candidate.runId}.json`);
  const authorization = await authorizeCandidatePublication({
    runId: candidate.runId,
    candidatePath,
    reviewPath,
  });
  const storagePaths: StoragePaths = {
    candidatePath,
    reviewPath,
    currentPath,
    runsDir: join(marketRoot, "runs"),
    monthlyIndexPath: join(marketRoot, "monthly", "index.json"),
  };

  if (!(await pathExistsAsSafeDirectory(lastGoodDirectory))) {
    const current = await readSnapshot(currentPath, "current snapshot");
    const currentExport = await runtime.exportPages({
      projectRoot,
      snapshotPath: currentPath,
      outputDirectory: lastGoodDirectory,
    });
    try {
      await runtime.verifyDeployment(
        PRODUCTION_BASE_URL,
        currentExport.routes,
        {
          runId: current.runId,
          dataCutoff: current.dataCutoff,
          archiveMonths: currentExport.archiveMonths,
          sourceIds: currentExport.sourceIds,
          archiveSourceIds: currentExport.archiveSourceIds,
          routeIdentities: currentExport.routeIdentities,
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
    await readDeploymentManifest(lastGoodDirectory);
  }

  const candidateExport = await runtime.exportPages({
    projectRoot,
    snapshotPath: candidatePath,
    outputDirectory: candidateDirectory,
    authorizedCandidateSha256: authorization.candidateSha256,
    ...(authorization.candidate.cadence === "month-end"
      ? {
          prospectiveArchive: projectMonthlyArchive(
            authorization.candidate,
            authorization.review,
          ),
        }
      : {}),
  });
  const activeDirectoryByUrl = new Map<
    string,
    {
      directory: string;
      candidateSha256: string;
      artifactTreeSha256: string;
      manifestSha256: string;
    }
  >();
  const dependencies = {
    deploy: async (directory: string, branch: string) => {
      const manifest = await readDeploymentManifest(
        directory,
        resolve(directory) === resolve(candidateDirectory)
          ? {
              expectedCandidateSha256: authorization.candidateSha256,
              expectedArtifactTreeSha256:
                candidateExport.artifactTreeSha256,
              expectedManifestSha256: candidateExport.manifestSha256,
            }
          : {},
      );
      const url = await wranglerDeploy(directory, branch);
      const active = {
        directory,
        candidateSha256: manifest.candidateSha256,
        artifactTreeSha256: manifest.artifactTreeSha256,
        manifestSha256: hashCandidate(manifest),
      };
      activeDirectoryByUrl.set(url, active);
      if (branch === "main") {
        activeDirectoryByUrl.set(PRODUCTION_BASE_URL, active);
      }
      return url;
    },
    verify: async (baseUrl: string, directory: string) => {
      const active = activeDirectoryByUrl.get(baseUrl);
      if (!active) {
        throw new Error("no deployed asset directory is bound to verification URL");
      }
      if (resolve(active.directory) !== resolve(directory)) {
        throw new Error("verification directory does not match deployed assets");
      }
      const manifest = await readDeploymentManifest(directory, {
        expectedCandidateSha256: active.candidateSha256,
        expectedArtifactTreeSha256: active.artifactTreeSha256,
        expectedManifestSha256: active.manifestSha256,
      });
      const expectation: VerificationExpectation = {
        runId: manifest.runId,
        dataCutoff: manifest.dataCutoff,
        archiveMonths: manifest.archiveMonths,
        sourceIds: manifest.sourceIds,
        archiveSourceIds: manifest.archiveSourceIds,
        routeIdentities: manifest.routeIdentities,
      };
      await runtime.verifyDeployment(baseUrl, manifest.routes, expectation);
    },
    revalidate: () =>
      revalidatePublicationState({
        runId: candidate.runId,
        candidatePath,
        reviewPath,
        candidateDirectory,
        expectedCandidateSha256: authorization.candidateSha256,
        expectedArtifactTreeSha256: candidateExport.artifactTreeSha256,
        expectedManifestSha256: candidateExport.manifestSha256,
      }),
    copyDirectory: copyDirectoryAtomically,
    promote: (expectedCandidateSha256: string) =>
      promoteCandidate(storagePaths, expectedCandidateSha256),
    restoreSnapshot: (promotion: Awaited<ReturnType<typeof promoteCandidate>>) =>
      restoreCurrent(storagePaths, promotion),
  };
  const promotion = await runtime.publishWithRestore(dependencies, {
    runId: candidate.runId,
    candidatePath,
    reviewPath,
    candidateDirectory,
    lastGoodDirectory,
    productionBaseUrl: PRODUCTION_BASE_URL,
    routes: candidateExport.routes,
    expectedCandidateSha256: candidateExport.candidateSha256,
    expectedArtifactTreeSha256: candidateExport.artifactTreeSha256,
    expectedManifestSha256: candidateExport.manifestSha256,
  });
  process.stdout.write(
    `${JSON.stringify({ published: true, runId: promotion.runId })}\n`,
  );
}

export async function runDeployPagesAtProjectRoot(
  projectRoot: string,
  runtime: DeployPagesRuntime = defaultRuntime,
): Promise<void> {
  projectRoot = resolve(projectRoot);
  const candidate = await readSnapshot(
    join(projectRoot, "data", "market", "candidate.json"),
    "candidate",
  );
  await withPublicationLock(projectRoot, candidate.runId, () =>
    runLockedDeployPagesAtProjectRoot(projectRoot, runtime, candidate.runId),
  );
}

async function runDeployPages(args: string[]): Promise<void> {
  if (args.length !== 0) {
    throw new Error("market:deploy does not accept command-line arguments");
  }
  await runDeployPagesAtProjectRoot(
    resolve(fileURLToPath(new URL("../", import.meta.url))),
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
