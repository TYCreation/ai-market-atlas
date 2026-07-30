import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  assertAutoPublishReview,
  hashCandidate,
  isSafeMarketRunId,
  type AutomatedReview,
} from "./review.ts";
import { assertMarketSnapshot } from "./schema.ts";
import type { PromotionResult } from "./storage.ts";
import type { MarketSnapshot } from "./types.ts";

export type PublishDependencies = {
  deploy(directory: string, branch: string): Promise<string>;
  verify(baseUrl: string, directory: string): Promise<void>;
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
  expectedCandidateSha256?: string;
};

export type VerificationExpectation = {
  runId: string;
  dataCutoff: string;
  archiveMonths: string[];
  sourceIds: string[];
  archiveSourceIds: Record<string, string[]>;
  routeIdentities: Record<string, RouteVerificationIdentity>;
};

export type RouteVerificationIdentity =
  | {
      kind: "current";
      runId: string;
      dataCutoff: string;
      sourceIds: string[];
    }
  | {
      kind: "archive-index";
      archiveMonths: string[];
    }
  | {
      kind: "archive-detail";
      archiveMonth: string;
      runId: string;
      dataCutoff: string;
      sourceIds: string[];
    }
  | {
      kind: "market-brief";
      runId: string;
      dataCutoff: string;
      sourceIds: string[];
      payloadSha256?: string;
    };

export type DeploymentFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CandidateAuthorizationOptions = Pick<
  PublishOptions,
  "runId" | "candidatePath" | "reviewPath"
>;

export type AuthorizedCandidatePublication = {
  candidate: MarketSnapshot;
  review: AutomatedReview;
  candidateSha256: string;
};

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
  if (
    expectation.routeIdentities === null ||
    typeof expectation.routeIdentities !== "object" ||
    Array.isArray(expectation.routeIdentities)
  ) {
    throw new Error("deployment route identities are invalid");
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function assertExactValues(
  actual: string[],
  expected: string[],
  label: string,
): void {
  if (
    actual.length !== new Set(actual).size ||
    JSON.stringify(sortedUnique(actual)) !==
      JSON.stringify(sortedUnique(expected))
  ) {
    throw new Error(`${label} does not match`);
  }
}

function sourceCardIds(body: string, archive: boolean): string[] {
  const prefix = archive ? "archive-source-" : "source-";
  const expression = new RegExp(
    `id=["']${prefix}([a-z0-9][a-z0-9._-]*)["']`,
    "gi",
  );
  return [...body.matchAll(expression)].map((match) => match[1]);
}

function embeddedBrief(body: string): Record<string, unknown> {
  const match =
    /<script id=["']embedded-market-brief["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i.exec(
      body,
    );
  if (!match) throw new Error("market brief embedded identity is missing");
  try {
    const value: unknown = JSON.parse(match[1]);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error("market brief embedded identity is invalid");
  }
}

function assertVerificationContent(
  route: string,
  body: string,
  expectation: VerificationExpectation,
): void {
  const identity = expectation.routeIdentities[route];
  if (!identity) {
    throw new Error(`${route} verification identity is missing`);
  }
  if (identity.kind === "market-brief") {
    if (!body.includes("AI MARKET ATLAS")) {
      throw new Error(`${route} market brief marker is missing`);
    }
    const brief = embeddedBrief(body);
    if (
      brief.runId !== identity.runId ||
      brief.dataCutoff !== identity.dataCutoff ||
      !Array.isArray(brief.sourceIds) ||
      !brief.sourceIds.every((sourceId) => typeof sourceId === "string")
    ) {
      throw new Error(`${route} market brief identity does not match`);
    }
    assertExactValues(
      brief.sourceIds as string[],
      identity.sourceIds,
      `${route} market brief sources`,
    );
    if (
      identity.payloadSha256 !== undefined &&
      hashCandidate(brief) !== identity.payloadSha256
    ) {
      throw new Error(`${route} market brief payload hash does not match`);
    }
    return;
  }
  if (identity.kind === "archive-detail") {
    const escapedMonth = identity.archiveMonth.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      !new RegExp(`(?:^|[^0-9-])${escapedMonth}(?:[^0-9-]|$)`).test(body) ||
      !body.includes(identity.runId) ||
      !body.includes(identity.dataCutoff)
    ) {
      throw new Error(`${route} archive month/runId/cutoff identity is missing`);
    }
    assertExactValues(
      sourceCardIds(body, true),
      identity.sourceIds,
      `${route} archive sources`,
    );
    return;
  }
  if (identity.kind === "archive-index") {
    const archiveMonths = [
      ...body.matchAll(/href=["']\/archive\/(\d{4}-(?:0[1-9]|1[0-2]))["']/g),
    ].map((match) => match[1]);
    assertExactValues(
      archiveMonths,
      identity.archiveMonths,
      `${route} archive months`,
    );
    return;
  }
  if (!body.includes(identity.runId)) {
    throw new Error(`${route} runId marker is missing`);
  }
  if (
    !body.includes(identity.dataCutoff) ||
    !/(?:資料截止|Data cutoff)/i.test(body)
  ) {
    throw new Error(`${route} cutoff marker is missing`);
  }
  assertExactValues(
    sourceCardIds(body, false),
    identity.sourceIds,
    `${route} current sources`,
  );
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
  if (routes.some((route) => expectation.routeIdentities[route] === undefined)) {
    throw new Error("deployment route identity is missing");
  }

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

export async function authorizeCandidatePublication(
  options: CandidateAuthorizationOptions,
): Promise<AuthorizedCandidatePublication> {
  if (!isSafeMarketRunId(options.runId)) {
    throw new Error("publication runId is unsafe");
  }
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
  assertAutoPublishReview(review, candidate);
  return {
    candidate,
    review,
    candidateSha256: hashCandidate(candidate),
  };
}

async function authorize(options: PublishOptions): Promise<void> {
  assertSafeDirectory(options.candidateDirectory, "pages-candidate");
  assertSafeDirectory(options.lastGoodDirectory, "pages-last-good");
  assertSafeRoutes(options.routes);
  assertProductionUrl(options.productionBaseUrl);
  await Promise.all([
    rejectDirectorySymlinkIfPresent("work", "work directory"),
    rejectSymlinkIfPresent(options.candidateDirectory, "candidate directory"),
    rejectSymlinkIfPresent(options.lastGoodDirectory, "last-good directory"),
  ]);
  const authorization = await authorizeCandidatePublication(options);
  if (
    options.expectedCandidateSha256 !== undefined &&
    authorization.candidateSha256 !== options.expectedCandidateSha256
  ) {
    throw new Error("candidate does not match the exported manifest hash");
  }
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
    await dependencies.verify(previewUrl, options.candidateDirectory);
  } catch (error) {
    throw new Error(`Preview publication failed: ${errorMessage(error)}`);
  }

  const promotion = await dependencies.promote();
  try {
    await dependencies.deploy(options.candidateDirectory, "main");
    await dependencies.verify(
      options.productionBaseUrl,
      options.candidateDirectory,
    );
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
      await dependencies.verify(
        options.productionBaseUrl,
        options.lastGoodDirectory,
      );
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
