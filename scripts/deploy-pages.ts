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
import { isDeepStrictEqual } from "node:util";
import {
  ARTIFACT_MANIFEST_NAME,
  hashArtifactTree,
} from "../market-data/artifact-tree.ts";
import {
  authorizeCandidatePublication,
  previewBranchForRunId,
  publishWithRestore,
  verifyDeployment,
  type VerificationExpectation,
} from "../market-data/deployment.ts";
import { hashCandidate, isSafeMarketRunId } from "../market-data/review.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "../market-data/schema.ts";
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
import {
  DISCOVERY_ARTIFACTS,
} from "../market-data/discovery-feeds.ts";

const PROJECT_NAME = "ai-market-atlas";
const PRODUCTION_BASE_URL = "https://aimarketatlas.net";

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
export const LAST_GOOD_ANCHOR_NAME = ".pages-last-good-anchor.json";
const LAST_GOOD_TRANSITION_NAME = ".pages-last-good-transition.json";

export type LastGoodAnchor = {
  schemaVersion: 1;
  runId: string;
  candidateSha256: string;
  artifactTreeSha256: string;
  manifestSha256: string;
};

type LastGoodTransition = {
  schemaVersion: 1;
  ownerToken: string;
  backupName: string;
  stagingName: string;
  previousAnchor: LastGoodAnchor;
  nextAnchor: LastGoodAnchor;
};

function assertLastGoodAnchor(value: unknown): asserts value is LastGoodAnchor {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      [
        "artifactTreeSha256",
        "candidateSha256",
        "manifestSha256",
        "runId",
        "schemaVersion",
      ]
        .sort()
        .join(",")
  ) {
    throw new Error("last-good anchor is invalid");
  }
  const anchor = value as Partial<LastGoodAnchor>;
  if (
    anchor.schemaVersion !== 1 ||
    typeof anchor.runId !== "string" ||
    !isSafeMarketRunId(anchor.runId) ||
    typeof anchor.candidateSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(anchor.candidateSha256) ||
    typeof anchor.artifactTreeSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(anchor.artifactTreeSha256) ||
    typeof anchor.manifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(anchor.manifestSha256)
  ) {
    throw new Error("last-good anchor is invalid");
  }
}

function lastGoodAnchorPath(projectRoot: string): string {
  return join(resolve(projectRoot), "work", LAST_GOOD_ANCHOR_NAME);
}

export async function readLastGoodAnchor(
  projectRoot: string,
): Promise<LastGoodAnchor> {
  const path = lastGoodAnchorPath(projectRoot);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isMissing(error)) throw new Error("last-good anchor is missing");
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("last-good anchor is unsafe");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error("last-good anchor is invalid");
  }
  assertLastGoodAnchor(value);
  return value;
}

export async function writeLastGoodAnchorAtomically(
  projectRoot: string,
  anchor: LastGoodAnchor,
): Promise<void> {
  assertLastGoodAnchor(anchor);
  const workDirectory = join(resolve(projectRoot), "work");
  await mkdir(workDirectory, { recursive: true });
  const workMetadata = await lstat(workDirectory);
  if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
    throw new Error("last-good anchor work directory is unsafe");
  }
  const destination = lastGoodAnchorPath(projectRoot);
  try {
    const destinationMetadata = await lstat(destination);
    if (
      destinationMetadata.isSymbolicLink() ||
      !destinationMetadata.isFile()
    ) {
      throw new Error("last-good anchor is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const temporary = join(
    workDirectory,
    `.${LAST_GOOD_ANCHOR_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(anchor, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function assertLastGoodTransition(
  value: unknown,
): asserts value is LastGoodTransition {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      [
        "backupName",
        "nextAnchor",
        "ownerToken",
        "previousAnchor",
        "schemaVersion",
        "stagingName",
      ]
        .sort()
        .join(",")
  ) {
    throw new Error("last-good transition is invalid");
  }
  const transition = value as Partial<LastGoodTransition>;
  if (
    transition.schemaVersion !== 1 ||
    typeof transition.ownerToken !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      transition.ownerToken,
    ) ||
    transition.backupName !==
      `.pages-last-good.${transition.ownerToken}.backup` ||
    transition.stagingName !==
      `.pages-last-good.${transition.ownerToken}.staging`
  ) {
    throw new Error("last-good transition is invalid");
  }
  assertLastGoodAnchor(transition.previousAnchor);
  assertLastGoodAnchor(transition.nextAnchor);
}

function lastGoodTransitionPath(projectRoot: string): string {
  return join(resolve(projectRoot), "work", LAST_GOOD_TRANSITION_NAME);
}

async function readLastGoodTransition(
  projectRoot: string,
): Promise<LastGoodTransition | undefined> {
  const path = lastGoodTransitionPath(projectRoot);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("last-good transition is unsafe");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new Error("last-good transition is invalid");
  }
  assertLastGoodTransition(value);
  return value;
}

async function writeLastGoodTransitionAtomically(
  projectRoot: string,
  transition: LastGoodTransition,
): Promise<void> {
  assertLastGoodTransition(transition);
  const workDirectory = join(resolve(projectRoot), "work");
  const workMetadata = await lstat(workDirectory);
  if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
    throw new Error("last-good transition work directory is unsafe");
  }
  const destination = lastGoodTransitionPath(projectRoot);
  try {
    await lstat(destination);
    throw new Error("last-good transition already exists");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const temporary = join(
    workDirectory,
    `.${LAST_GOOD_TRANSITION_NAME}.${transition.ownerToken}.tmp`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(transition, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

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
  const isTransitionDirectory =
    /^\.pages-last-good\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:backup|staging)$/.test(
      name,
    );
  if (
    basename(dirname(absolute)) !== "work" ||
    (!["pages-candidate", "pages-last-good"].includes(name) &&
      !isTransitionDirectory) ||
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
      /^market-(?:update|seed)-\d{4}-\d{2}-\d{2}-(?:wed|sat|mon)$/.test(
        branch,
      )
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
    Array.isArray((value as { routeIdentities?: unknown }).routeIdentities) ||
    ("artifacts" in (value as Record<string, unknown>) &&
      (!Array.isArray((value as { artifacts?: unknown }).artifacts) ||
        !(value as { artifacts: unknown[] }).artifacts.every(
          (artifact) =>
            typeof artifact === "string" &&
            DISCOVERY_ARTIFACTS.includes(
              artifact as (typeof DISCOVERY_ARTIFACTS)[number],
            ),
        )))
  ) {
    throw new Error("deployment manifest is invalid");
  }
  const manifest = value as DeploymentManifest;
  if (
    manifest.artifacts &&
    JSON.stringify(manifest.artifacts) !== JSON.stringify([...DISCOVERY_ARTIFACTS])
  ) {
    throw new Error("deployment manifest discovery artifacts do not match");
  }
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

export async function validateLastGoodDirectory(
  directory: string,
  anchor: LastGoodAnchor,
): Promise<DeploymentManifest> {
  assertLastGoodAnchor(anchor);
  try {
    const manifest = await readDeploymentManifest(directory, {
      expectedCandidateSha256: anchor.candidateSha256,
      expectedArtifactTreeSha256: anchor.artifactTreeSha256,
      expectedManifestSha256: anchor.manifestSha256,
    });
    if (manifest.runId !== anchor.runId) {
      throw new Error("run identity does not match");
    }
    return manifest;
  } catch (error) {
    throw new Error(
      `last-good directory does not match anchor: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function safeTransitionDirectoryExists(path: string): Promise<boolean> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`last-good transition directory is unsafe: ${path}`);
  }
  return true;
}

async function removeValidatedTransitionDirectory(
  path: string,
  anchor: LastGoodAnchor,
): Promise<void> {
  if (!(await safeTransitionDirectoryExists(path))) return;
  await validateLastGoodDirectory(path, anchor);
  await rm(path, { recursive: true });
}

export async function recoverLastGoodTransition(
  projectRoot: string,
): Promise<void> {
  projectRoot = resolve(projectRoot);
  const transition = await readLastGoodTransition(projectRoot);
  if (!transition) return;

  const workDirectory = join(projectRoot, "work");
  const workMetadata = await lstat(workDirectory);
  if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
    throw new Error("last-good transition work directory is unsafe");
  }
  const current = join(workDirectory, "pages-last-good");
  const backup = join(workDirectory, transition.backupName);
  const staging = join(workDirectory, transition.stagingName);
  const anchor = await readLastGoodAnchor(projectRoot);

  if (isDeepStrictEqual(anchor, transition.previousAnchor)) {
    const backupExists = await safeTransitionDirectoryExists(backup);
    const currentExists = await safeTransitionDirectoryExists(current);
    if (backupExists) {
      await validateLastGoodDirectory(backup, transition.previousAnchor);
      if (currentExists) {
        try {
          await validateLastGoodDirectory(current, transition.previousAnchor);
        } catch {
          await validateLastGoodDirectory(current, transition.nextAnchor);
        }
        await rm(current, { recursive: true });
      }
      await rename(backup, current);
    } else {
      if (!currentExists) {
        throw new Error("last-good transition lost the anchored directory");
      }
      await validateLastGoodDirectory(current, transition.previousAnchor);
    }
    await removeValidatedTransitionDirectory(
      staging,
      transition.nextAnchor,
    );
    await validateLastGoodDirectory(current, transition.previousAnchor);
  } else if (isDeepStrictEqual(anchor, transition.nextAnchor)) {
    await validateLastGoodDirectory(current, transition.nextAnchor);
    await removeValidatedTransitionDirectory(
      backup,
      transition.previousAnchor,
    );
    await removeValidatedTransitionDirectory(
      staging,
      transition.nextAnchor,
    );
  } else {
    throw new Error("last-good transition does not match the trusted anchor");
  }

  await rm(lastGoodTransitionPath(projectRoot));
}

export async function replaceLastGoodTransactionally(options: {
  projectRoot: string;
  sourceDirectory: string;
  previousAnchor: LastGoodAnchor;
  nextAnchor: LastGoodAnchor;
  writeAnchor?: typeof writeLastGoodAnchorAtomically;
}): Promise<void> {
  const projectRoot = resolve(options.projectRoot);
  const source = assertPagesDirectory(
    options.sourceDirectory,
    "pages-candidate",
  );
  const workDirectory = join(projectRoot, "work");
  const destination = join(workDirectory, "pages-last-good");
  if (dirname(source) !== workDirectory) {
    throw new Error("Pages directories must share the project work directory");
  }
  assertLastGoodAnchor(options.previousAnchor);
  assertLastGoodAnchor(options.nextAnchor);
  await recoverLastGoodTransition(projectRoot);
  if (
    !isDeepStrictEqual(
      await readLastGoodAnchor(projectRoot),
      options.previousAnchor,
    )
  ) {
    throw new Error("last-good anchor changed before replacement");
  }
  await validateLastGoodDirectory(destination, options.previousAnchor);
  await validateLastGoodDirectory(source, options.nextAnchor);

  const ownerToken = randomUUID();
  const transition: LastGoodTransition = {
    schemaVersion: 1,
    ownerToken,
    backupName: `.pages-last-good.${ownerToken}.backup`,
    stagingName: `.pages-last-good.${ownerToken}.staging`,
    previousAnchor: options.previousAnchor,
    nextAnchor: options.nextAnchor,
  };
  const backup = join(workDirectory, transition.backupName);
  const staging = join(workDirectory, transition.stagingName);
  let transitionWritten = false;
  try {
    await cp(source, staging, {
      recursive: true,
      dereference: false,
      force: false,
      errorOnExist: true,
    });
    await assertDirectoryTreeSafe(staging);
    await validateLastGoodDirectory(staging, options.nextAnchor);
    await writeLastGoodTransitionAtomically(projectRoot, transition);
    transitionWritten = true;
    await rename(destination, backup);
    await rename(staging, destination);
    await validateLastGoodDirectory(destination, options.nextAnchor);
    await (options.writeAnchor ?? writeLastGoodAnchorAtomically)(
      projectRoot,
      options.nextAnchor,
    );
    if (
      !isDeepStrictEqual(
        await readLastGoodAnchor(projectRoot),
        options.nextAnchor,
      )
    ) {
      throw new Error("last-good anchor commit did not persist");
    }
    await recoverLastGoodTransition(projectRoot);
  } catch (error) {
    if (transitionWritten) {
      try {
        await recoverLastGoodTransition(projectRoot);
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          "last-good replacement and recovery both failed",
        );
      }
    } else {
      await rm(staging, { recursive: true, force: true });
    }
    throw error;
  }
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function readSnapshot(path: string, label: string, kind: "candidate" | "published") {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (kind === "candidate") {
    assertMarketSnapshot(value);
  } else {
    assertPublishedMarketSnapshot(value);
  }
  return value;
}

export type DeployPagesRuntime = {
  exportPages: typeof exportPages;
  verifyDeployment: typeof verifyDeployment;
  verifyProduction?: typeof verifyDeployment;
  publishWithRestore: typeof publishWithRestore;
  bootstrapPreview?: (directory: string, branch: string) => Promise<string>;
};

async function verifyProductionAfterPropagation(
  ...args: Parameters<typeof verifyDeployment>
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await verifyDeployment(...args);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, (attempt + 1) * 2_000),
      );
    }
  }
  throw lastError;
}

const defaultRuntime: DeployPagesRuntime = {
  exportPages,
  verifyDeployment,
  verifyProduction: verifyProductionAfterPropagation,
  publishWithRestore,
  bootstrapPreview: wranglerDeploy,
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
  const candidate = await readSnapshot(candidatePath, "candidate", "candidate");
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

  await recoverLastGoodTransition(projectRoot);
  let lastGoodAnchor: LastGoodAnchor;
  try {
    lastGoodAnchor = await readLastGoodAnchor(projectRoot);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/last-good anchor is missing/i.test(error.message) ||
      (await pathExists(lastGoodDirectory))
    ) {
      throw error;
    }
    const current = await readSnapshot(currentPath, "current snapshot", "published");
    const currentExport = await runtime.exportPages({
      projectRoot,
      snapshotPath: currentPath,
      outputDirectory: lastGoodDirectory,
    });
    try {
      const bootstrapUrl = runtime.bootstrapPreview
          ? await runtime.bootstrapPreview(
              lastGoodDirectory,
              previewBranchForRunId(current.runId).replace(
                "market-update-",
                "market-seed-",
              ),
            )
        : PRODUCTION_BASE_URL;
      await runtime.verifyDeployment(
        bootstrapUrl,
        currentExport.routes,
        {
          runId: current.runId,
          dataCutoff: current.dataCutoff,
          archiveMonths: currentExport.archiveMonths,
          sourceIds: currentExport.sourceIds,
          archiveSourceIds: currentExport.archiveSourceIds,
          routeIdentities: currentExport.routeIdentities,
          artifacts: [...DISCOVERY_ARTIFACTS],
        },
      );
      const seededAnchor: LastGoodAnchor = {
        schemaVersion: 1,
        runId: currentExport.runId,
        candidateSha256: currentExport.candidateSha256,
        artifactTreeSha256: currentExport.artifactTreeSha256,
        manifestSha256: currentExport.manifestSha256,
      };
      await validateLastGoodDirectory(lastGoodDirectory, seededAnchor);
      await writeLastGoodAnchorAtomically(projectRoot, seededAnchor);
      lastGoodAnchor = seededAnchor;
    } catch (error) {
      await rm(lastGoodDirectory, { recursive: true, force: true });
      throw new Error(
        `Cannot seed last-known-good from unverified production: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  await validateLastGoodDirectory(lastGoodDirectory, lastGoodAnchor);
  const currentSnapshot = await readSnapshot(currentPath, "current snapshot", "published");

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
            currentSnapshot,
          ),
        }
      : {}),
  });
  const snapshotAlreadyCurrent =
    hashCandidate(currentSnapshot) === candidateExport.candidateSha256;
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
      const resolvedDirectory = resolve(directory);
      let manifest: DeploymentManifest;
      if (resolvedDirectory === resolve(lastGoodDirectory)) {
        manifest = await validateLastGoodDirectory(
          directory,
          lastGoodAnchor,
        );
      } else {
        manifest = await readDeploymentManifest(
          directory,
          resolvedDirectory === resolve(candidateDirectory)
            ? {
                expectedCandidateSha256: authorization.candidateSha256,
                expectedArtifactTreeSha256:
                  candidateExport.artifactTreeSha256,
                expectedManifestSha256: candidateExport.manifestSha256,
              }
            : {},
        );
      }
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
        artifacts: manifest.artifacts,
      };
      const verifier =
        baseUrl === PRODUCTION_BASE_URL && runtime.verifyProduction
          ? runtime.verifyProduction
          : runtime.verifyDeployment;
      await verifier(baseUrl, manifest.routes, expectation);
    },
    revalidate: async () => {
      await revalidatePublicationState({
        runId: candidate.runId,
        candidatePath,
        reviewPath,
        candidateDirectory,
        expectedCandidateSha256: authorization.candidateSha256,
        expectedArtifactTreeSha256: candidateExport.artifactTreeSha256,
        expectedManifestSha256: candidateExport.manifestSha256,
      });
      if (snapshotAlreadyCurrent) {
        const current = await readSnapshot(currentPath, "current snapshot", "published");
        if (hashCandidate(current) !== candidateExport.candidateSha256) {
          throw new Error("current snapshot changed during site-only redeployment");
        }
      }
    },
    copyDirectory: async (
      from: string,
      to: string,
      expectedArtifactTreeSha256: string,
      expectedManifestSha256: string,
    ) => {
      if (
        resolve(to) !== resolve(lastGoodDirectory) ||
        expectedArtifactTreeSha256 !== candidateExport.artifactTreeSha256 ||
        expectedManifestSha256 !== candidateExport.manifestSha256
      ) {
        throw new Error("last-good replacement identities changed");
      }
      const nextAnchor: LastGoodAnchor = {
        schemaVersion: 1,
        runId: candidateExport.runId,
        candidateSha256: candidateExport.candidateSha256,
        artifactTreeSha256: candidateExport.artifactTreeSha256,
        manifestSha256: candidateExport.manifestSha256,
      };
      await replaceLastGoodTransactionally({
        projectRoot,
        sourceDirectory: from,
        previousAnchor: lastGoodAnchor,
        nextAnchor,
      });
      lastGoodAnchor = nextAnchor;
    },
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
    snapshotAlreadyCurrent,
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
