import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  assertAutoPublishReview,
  isSafeMarketRunId,
  type AutomatedReview,
} from "./review.ts";
import { assertMarketSnapshot } from "./schema.ts";
import type { PromotionResult } from "./storage.ts";

export type PublishDependencies = {
  deploy(directory: string, branch: string): Promise<string>;
  verify(baseUrl: string, routes: string[]): Promise<void>;
  copyDirectory(from: string, to: string): Promise<void>;
  promote(): Promise<PromotionResult>;
  restoreSnapshot(promotion: PromotionResult): Promise<void>;
};

export type PublishOptions = {
  runId: string;
  candidatePath: string;
  reviewPath: string;
  candidateDirectory: string;
  lastGoodDirectory: string;
  productionBaseUrl: string;
  routes: string[];
};

export type VerificationExpectation = {
  runId: string;
  dataCutoff: string;
  archiveMonths: string[];
  sourceIds: string[];
  archiveSourceIds: Record<string, string[]>;
};

export type DeploymentFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof DOMException) return true;
  if (error === null || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETDOWN",
    "ENETUNREACH",
    "ETIMEDOUT",
  ]).has(String(error.code));
}

function assertSafeDirectory(path: string, expectedName: string): void {
  const absolute = resolve(path);
  if (
    basename(absolute) !== expectedName ||
    dirname(absolute) !== resolve("work")
  ) {
    throw new Error(`${expectedName} directory is invalid or unsafe`);
  }
}

async function rejectDirectorySymlinkIfPresent(
  path: string,
  label: string,
): Promise<void> {
  try {
    const metadata = await lstat(resolve(path));
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`${label} must be a real directory`);
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

async function rejectSymlinkIfPresent(path: string, label: string): Promise<void> {
  try {
    const metadata = await lstat(resolve(path));
    if (metadata.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

async function readRegularJson(path: string, label: string): Promise<unknown> {
  const absolute = resolve(path);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
  try {
    return JSON.parse(await readFile(absolute, "utf8")) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function assertReviewShape(value: unknown): asserts value is AutomatedReview {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as { checks?: unknown }).checks) ||
    !Array.isArray((value as { issues?: unknown }).issues)
  ) {
    throw new Error("persisted automated review is invalid");
  }
}

function assertSafeRoutes(routes: string[]): void {
  if (
    routes.length === 0 ||
    new Set(routes).size !== routes.length ||
    routes.some(
      (route) =>
        !route.startsWith("/") ||
        route.includes("..") ||
        route.includes("\\") ||
        route.includes("?") ||
        route.includes("#") ||
        route.startsWith("//"),
    )
  ) {
    throw new Error("deployment routes are invalid or unsafe");
  }
}

function assertVerificationExpectation(
  expectation: VerificationExpectation,
): void {
  if (
    expectation.archiveSourceIds === null ||
    typeof expectation.archiveSourceIds !== "object" ||
    Array.isArray(expectation.archiveSourceIds)
  ) {
    throw new Error("deployment verification expectation is invalid");
  }
  const archiveSourceEntries = Object.entries(expectation.archiveSourceIds);
  if (
    !isSafeMarketRunId(expectation.runId) ||
    Number.isNaN(Date.parse(expectation.dataCutoff)) ||
    expectation.archiveMonths.some(
      (month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    ) ||
    new Set(expectation.archiveMonths).size !== expectation.archiveMonths.length ||
    expectation.sourceIds.length === 0 ||
    expectation.sourceIds.some(
      (sourceId) => !/^[a-z0-9][a-z0-9._-]*$/.test(sourceId),
    ) ||
    new Set(expectation.sourceIds).size !== expectation.sourceIds.length ||
    archiveSourceEntries.length !== expectation.archiveMonths.length ||
    archiveSourceEntries.some(
      ([month, sourceIds]) =>
        !expectation.archiveMonths.includes(month) ||
        sourceIds.length === 0 ||
        sourceIds.some(
          (sourceId) => !/^[a-z0-9][a-z0-9._-]*$/.test(sourceId),
        ) ||
        new Set(sourceIds).size !== sourceIds.length,
    )
  ) {
    throw new Error("deployment verification expectation is invalid");
  }
}

function assertVerificationContent(
  route: string,
  body: string,
  expectation: VerificationExpectation,
): void {
  if (route === "/market-brief/" || route === "/market-brief") {
    if (!body.includes("AI MARKET ATLAS")) {
      throw new Error(`${route} market brief marker is missing`);
    }
    return;
  }
  const archiveDetail = /^\/archive\/(\d{4}-(?:0[1-9]|1[0-2]))\/?$/.exec(
    route,
  );
  if (archiveDetail) {
    const expectedSourceIds =
      expectation.archiveSourceIds[archiveDetail[1]] ?? [];
    if (
      !expectation.archiveMonths.includes(archiveDetail[1]) ||
      !body.includes(archiveDetail[1])
    ) {
      throw new Error(`${route} archive month marker is missing`);
    }
    if (
      !expectedSourceIds.some((sourceId) =>
        body.includes(`source-${sourceId}`),
      )
    ) {
      throw new Error(`${route} source marker is missing`);
    }
    return;
  }
  if (route === "/archive" || route === "/archive/") {
    if (expectation.archiveMonths.some((month) => !body.includes(month))) {
      throw new Error(`${route} archive month marker is missing`);
    }
    return;
  }
  if (!body.includes(expectation.runId)) {
    throw new Error(`${route} runId marker is missing`);
  }
  if (
    !body.includes(expectation.dataCutoff) ||
    !/(?:資料截止|Data cutoff)/i.test(body)
  ) {
    throw new Error(`${route} cutoff marker is missing`);
  }
  if (
    !expectation.sourceIds.some((sourceId) =>
      body.includes(`source-${sourceId}`),
    )
  ) {
    throw new Error(`${route} source marker is missing`);
  }
}

function assertVerificationBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("deployment verification base URL is invalid");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("deployment verification base URL is invalid");
  }
  return url;
}

export async function verifyDeployment(
  baseUrl: string,
  routes: string[],
  expectation: VerificationExpectation,
  fetcher: DeploymentFetcher = fetch,
): Promise<void> {
  const base = assertVerificationBaseUrl(baseUrl);
  assertSafeRoutes(routes);
  assertVerificationExpectation(expectation);

  for (const route of routes) {
    let response: Response | undefined;
    let networkError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetcher(new URL(route, base), {
          headers: { accept: "text/html" },
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
        networkError = undefined;
        break;
      } catch (error) {
        networkError = error;
        if (!isRetryableNetworkError(error)) {
          throw new Error(
            `${route} verification failed: ${errorMessage(error)}`,
          );
        }
      }
    }
    if (!response) {
      throw new Error(
        `${route} network verification failed after three attempts: ${errorMessage(networkError)}`,
      );
    }
    if (response.status !== 200) {
      throw new Error(`${route} verification returned HTTP ${response.status}`);
    }
    assertVerificationContent(route, await response.text(), expectation);
  }
}

function assertProductionUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("production base URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "aimarket.tycreation.online" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("production base URL is invalid");
  }
}

async function authorize(options: PublishOptions): Promise<void> {
  if (!isSafeMarketRunId(options.runId)) {
    throw new Error("publication runId is unsafe");
  }
  assertSafeDirectory(options.candidateDirectory, "pages-candidate");
  assertSafeDirectory(options.lastGoodDirectory, "pages-last-good");
  assertSafeRoutes(options.routes);
  assertProductionUrl(options.productionBaseUrl);
  const candidatePath = resolve(options.candidatePath);
  const reviewPath = resolve(options.reviewPath);
  if (
    basename(candidatePath) !== "candidate.json" ||
    dirname(reviewPath) !== join(dirname(candidatePath), "reviews") ||
    basename(reviewPath) !== `${options.runId}.json`
  ) {
    throw new Error("candidate or review path is invalid or unsafe");
  }
  await Promise.all([
    rejectDirectorySymlinkIfPresent("work", "work directory"),
    rejectSymlinkIfPresent(options.candidateDirectory, "candidate directory"),
    rejectSymlinkIfPresent(options.lastGoodDirectory, "last-good directory"),
    rejectDirectorySymlinkIfPresent(dirname(candidatePath), "market directory"),
    rejectDirectorySymlinkIfPresent(dirname(reviewPath), "reviews directory"),
  ]);

  const [candidate, review] = await Promise.all([
    readRegularJson(options.candidatePath, "candidate"),
    readRegularJson(options.reviewPath, "persisted automated review"),
  ]);
  assertMarketSnapshot(candidate);
  if (candidate.runId !== options.runId) {
    throw new Error("candidate runId does not match publication runId");
  }
  assertReviewShape(review);
  assertAutoPublishReview(review, candidate);
}

export async function publishWithRestore(
  dependencies: PublishDependencies,
  options: PublishOptions,
): Promise<PromotionResult> {
  await authorize(options);
  const branch = `market-update-${options.runId}`;

  try {
    const previewUrl = await dependencies.deploy(
      options.candidateDirectory,
      branch,
    );
    await dependencies.verify(previewUrl, options.routes);
  } catch (error) {
    throw new Error(`Preview publication failed: ${errorMessage(error)}`);
  }

  const promotion = await dependencies.promote();
  try {
    await dependencies.deploy(options.candidateDirectory, "main");
    await dependencies.verify(options.productionBaseUrl, options.routes);
  } catch (candidateError) {
    let snapshotOutcome = "snapshot restoration succeeded";
    let siteOutcome = "site restoration succeeded";
    try {
      await dependencies.restoreSnapshot(promotion);
    } catch (restoreError) {
      snapshotOutcome = `snapshot restoration failed: ${errorMessage(restoreError)}`;
    }
    try {
      await dependencies.deploy(options.lastGoodDirectory, "main");
      await dependencies.verify(options.productionBaseUrl, options.routes);
    } catch (restoreError) {
      siteOutcome = `site restoration failed: ${errorMessage(restoreError)}`;
    }
    throw new Error(
      `Candidate production failed: ${errorMessage(candidateError)}; ${snapshotOutcome}; ${siteOutcome}`,
    );
  }

  await dependencies.copyDirectory(
    options.candidateDirectory,
    options.lastGoodDirectory,
  );
  return promotion;
}
