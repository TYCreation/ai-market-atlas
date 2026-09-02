import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  assertAutoPublishReview,
  hashCandidate,
  isSafeMarketRunId,
  type AutomatedReview,
} from "./review.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "./schema.ts";
import type { PromotionResult } from "./storage.ts";
import type { MarketSnapshot } from "./types.ts";
import {
  isCanonicalUtcTimestamp,
  isMarketBriefPayload,
  marketBriefPayloadSha256,
} from "../scripts/generate-market-brief.ts";
import {
  DISCOVERY_ARTIFACT_CONTENT_TYPES,
  DISCOVERY_ARTIFACTS,
} from "./discovery-feeds.ts";

export type PublishDependencies = {
  deploy(directory: string, branch: string): Promise<string>;
  verify(baseUrl: string, directory: string): Promise<void>;
  revalidate(): Promise<void>;
  copyDirectory(
    from: string,
    to: string,
    expectedArtifactTreeSha256: string,
    expectedManifestSha256: string,
  ): Promise<void>;
  promote(expectedCandidateSha256: string): Promise<PromotionResult>;
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
  expectedArtifactTreeSha256?: string;
  expectedManifestSha256?: string;
  snapshotAlreadyCurrent?: boolean;
};

export type PublicationResult =
  | PromotionResult
  | { published: true; promoted: false; runId: string };

/**
 * A separately authorized, non-promoting deployment of the exact published
 * snapshot. This deliberately has no candidate path: callers cannot turn a
 * site repair into a data publication.
 */
export type CurrentRedeployOptions = Omit<
  PublishOptions,
  "candidatePath" | "snapshotAlreadyCurrent"
> & {
  currentPath: string;
};

export type CurrentRedeployDependencies = Pick<
  PublishDependencies,
  "deploy" | "verify" | "revalidate" | "copyDirectory"
>;

export type AuthorizedCurrentRedeployment = {
  current: MarketSnapshot;
  review: AutomatedReview;
  candidateSha256: string;
};

export type VerificationExpectation = {
  runId: string;
  dataCutoff: string;
  archiveMonths: string[];
  sourceIds: string[];
  archiveSourceIds: Record<string, string[]>;
  routeIdentities: Record<string, RouteVerificationIdentity>;
  artifacts: string[];
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
      kind: "brief-detail";
      briefDate: string;
      runId: string;
      dataCutoff: string;
      sourceIds: string[];
    }
  | {
      kind: "entity-detail";
      entitySlug: string;
      lastModified: string;
      sourceIds: string[];
    }
  | {
      kind: "market-brief";
      dataCutoff: string;
      sourceIds: string[];
      payloadSha256: string;
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

export function previewBranchForRunId(runId: string): string {
  if (!isSafeMarketRunId(runId)) {
    throw new Error("publication runId is unsafe");
  }
  const cadence = runId.endsWith("-wednesday")
    ? "wed"
    : runId.endsWith("-saturday")
      ? "sat"
      : "mon";
  return `market-update-${runId.slice(0, 10)}-${cadence}`;
}

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
    !Array.isArray(expectation.artifacts) ||
    expectation.artifacts.length !== DISCOVERY_ARTIFACTS.length ||
    expectation.artifacts.length !== new Set(expectation.artifacts).size ||
    JSON.stringify([...expectation.artifacts].sort()) !==
      JSON.stringify([...DISCOVERY_ARTIFACTS].sort())
  ) {
    throw new Error("deployment discovery artifacts are invalid");
  }
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
    !isCanonicalUtcTimestamp(expectation.dataCutoff) ||
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
  for (const identity of Object.values(expectation.routeIdentities)) {
    if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
      throw new Error("deployment route identities are invalid");
    }
    const candidate = identity as Record<string, unknown>;
    if (candidate.kind === "market-brief") {
      if (
        "runId" in candidate ||
        !isCanonicalUtcTimestamp(candidate.dataCutoff) ||
        typeof candidate.payloadSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(candidate.payloadSha256)
      ) {
        throw new Error("deployment market brief identity is invalid");
      }
    }
    if (candidate.kind === "brief-detail") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(String(candidate.briefDate)) ||
        !isSafeMarketRunId(String(candidate.runId)) ||
        !isCanonicalUtcTimestamp(candidate.dataCutoff) ||
        !Array.isArray(candidate.sourceIds) ||
        candidate.sourceIds.length === 0 ||
        candidate.sourceIds.some((sourceId) => typeof sourceId !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(sourceId)) ||
        new Set(candidate.sourceIds).size !== candidate.sourceIds.length
      ) {
        throw new Error("deployment brief detail identity is invalid");
      }
    }
    if (candidate.kind === "entity-detail") {
      if (
        typeof candidate.entitySlug !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.entitySlug) ||
        !isCanonicalUtcTimestamp(String(candidate.lastModified)) ||
        !Array.isArray(candidate.sourceIds) ||
        candidate.sourceIds.length === 0 ||
        candidate.sourceIds.some((sourceId) => typeof sourceId !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(sourceId)) ||
        new Set(candidate.sourceIds).size !== candidate.sourceIds.length
      ) {
        throw new Error("deployment entity detail identity is invalid");
      }
    }
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
): string | undefined {
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
      !isMarketBriefPayload(brief) ||
      marketBriefPayloadSha256(brief) !== identity.payloadSha256
    ) {
      throw new Error(`${route} market brief payload hash does not match`);
    }
    return marketBriefPayloadSha256(brief);
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
    return undefined;
  }
  if (identity.kind === "brief-detail") {
    if (
      !body.includes(identity.briefDate) ||
      !body.includes(identity.runId) ||
      !body.includes(identity.dataCutoff)
    ) {
      throw new Error(`${route} dated brief identity is missing`);
    }
    assertExactValues(
      sourceCardIds(body, false),
      identity.sourceIds,
      `${route} dated brief sources`,
    );
    return undefined;
  }
  if (identity.kind === "entity-detail") {
    if (
      !body.includes(route) ||
      !body.includes(identity.lastModified)
    ) {
      throw new Error(`${route} entity identity is missing`);
    }
    assertExactValues(
      sourceCardIds(body, false),
      identity.sourceIds,
      `${route} entity sources`,
    );
    return undefined;
  }
  if (identity.kind === "archive-index") {
    const archiveMonths = [
      ...body.matchAll(/href=["']\/(?:en\/)?archive\/(\d{4}-(?:0[1-9]|1[0-2]))["']/g),
    ].map((match) => match[1]);
    assertExactValues(
      archiveMonths,
      identity.archiveMonths,
      `${route} archive months`,
    );
    return undefined;
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
  return undefined;
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

  const fetchVerifiedResponse = async (
    url: URL,
    label: string,
    accept: string,
  ): Promise<Response> => {
    let response: Response | undefined;
    let networkError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetcher(url, {
          headers: { accept },
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
        networkError = undefined;
        break;
      } catch (error) {
        networkError = error;
        if (!isRetryableNetworkError(error)) {
          throw new Error(
            `${label} verification failed: ${errorMessage(error)}`,
          );
        }
      }
    }
    if (!response) {
      throw new Error(
        `${label} network verification failed after three attempts: ${errorMessage(networkError)}`,
      );
    }
    if (response.status !== 200) {
      throw new Error(`${label} verification returned HTTP ${response.status}`);
    }
    return response;
  };

  for (const route of routes) {
    const response = await fetchVerifiedResponse(
      new URL(route, base),
      route,
      "text/html",
    );
    const embeddedPayloadSha256 = assertVerificationContent(
      route,
      await response.text(),
      expectation,
    );
    const identity = expectation.routeIdentities[route];
    if (identity.kind === "market-brief") {
      if (identity.payloadSha256 === undefined) {
        throw new Error(`${route} market brief payload hash is missing`);
      }
      const dataResponse = await fetchVerifiedResponse(
        new URL("data.json", new URL(route, base)),
        `${route}data.json`,
        "application/json",
      );
      let payload: unknown;
      try {
        payload = JSON.parse(await dataResponse.text()) as unknown;
      } catch {
        throw new Error(`${route}data.json is not valid JSON`);
      }
      const dataPayloadSha256 =
        isMarketBriefPayload(payload) ? marketBriefPayloadSha256(payload) : "";
      if (
        dataPayloadSha256 !== identity.payloadSha256 ||
        dataPayloadSha256 !== embeddedPayloadSha256
      ) {
        throw new Error(
          `${route}data.json payload hash does not match manifest and embedded JSON`,
        );
      }
    }
  }

  for (const artifact of expectation.artifacts) {
    const response = await fetchVerifiedResponse(
      new URL(artifact, base),
      artifact,
      DISCOVERY_ARTIFACT_CONTENT_TYPES[
        artifact as (typeof DISCOVERY_ARTIFACTS)[number]
      ],
    );
    const expectedType =
      DISCOVERY_ARTIFACT_CONTENT_TYPES[
        artifact as (typeof DISCOVERY_ARTIFACTS)[number]
      ];
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith(expectedType)) {
      throw new Error(`${artifact} verification content type is incorrect`);
    }
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
    url.hostname !== "aimarketatlas.net" ||
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

/**
 * Authorizes the existing published snapshot only. The review is required to
 * be the persisted accepted review for the same run and semantic snapshot
 * bytes; it is never regenerated here.
 */
export async function authorizeCurrentRedeployment(
  options: Pick<CurrentRedeployOptions, "runId" | "currentPath" | "reviewPath">,
): Promise<AuthorizedCurrentRedeployment> {
  if (!isSafeMarketRunId(options.runId)) {
    throw new Error("publication runId is unsafe");
  }
  const currentPath = resolve(options.currentPath);
  const reviewPath = resolve(options.reviewPath);
  if (
    basename(currentPath) !== "current.json" ||
    dirname(reviewPath) !== join(dirname(currentPath), "reviews") ||
    basename(reviewPath) !== `${options.runId}.json`
  ) {
    throw new Error("current snapshot or review path is invalid or unsafe");
  }
  await Promise.all([
    rejectDirectorySymlinkIfPresent(dirname(currentPath), "market directory"),
    rejectDirectorySymlinkIfPresent(dirname(reviewPath), "reviews directory"),
  ]);
  const [current, review] = await Promise.all([
    readRegularJson(currentPath, "current snapshot"),
    readRegularJson(reviewPath, "persisted automated review"),
  ]);
  assertPublishedMarketSnapshot(current);
  if (current.runId !== options.runId) {
    throw new Error("current snapshot runId does not match publication runId");
  }
  assertAutoPublishReview(review, current);
  return {
    current,
    review,
    candidateSha256: hashCandidate(current),
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

async function authorizeCurrentRedeploy(options: CurrentRedeployOptions): Promise<void> {
  assertSafeDirectory(options.candidateDirectory, "pages-candidate");
  assertSafeDirectory(options.lastGoodDirectory, "pages-last-good");
  assertSafeRoutes(options.routes);
  assertProductionUrl(options.productionBaseUrl);
  await Promise.all([
    rejectDirectorySymlinkIfPresent("work", "work directory"),
    rejectSymlinkIfPresent(options.candidateDirectory, "candidate directory"),
    rejectSymlinkIfPresent(options.lastGoodDirectory, "last-good directory"),
  ]);
  const authorization = await authorizeCurrentRedeployment(options);
  if (
    options.expectedCandidateSha256 !== undefined &&
    authorization.candidateSha256 !== options.expectedCandidateSha256
  ) {
    throw new Error("current snapshot does not match the exported manifest hash");
  }
}

function assertDeploymentHashes(options: Pick<
  PublishOptions,
  "expectedCandidateSha256" | "expectedArtifactTreeSha256" | "expectedManifestSha256"
>): asserts options is Pick<
  PublishOptions,
  "expectedCandidateSha256" | "expectedArtifactTreeSha256" | "expectedManifestSha256"
> & {
  expectedCandidateSha256: string;
  expectedArtifactTreeSha256: string;
  expectedManifestSha256: string;
} {
  if (options.expectedCandidateSha256 === undefined || !/^[a-f0-9]{64}$/.test(options.expectedCandidateSha256)) {
    throw new Error("authorized candidate hash is required");
  }
  if (
    options.expectedArtifactTreeSha256 === undefined ||
    !/^[a-f0-9]{64}$/.test(options.expectedArtifactTreeSha256)
  ) {
    throw new Error("artifact tree hash is required");
  }
  if (
    options.expectedManifestSha256 === undefined ||
    !/^[a-f0-9]{64}$/.test(options.expectedManifestSha256)
  ) {
    throw new Error("deployment manifest hash is required");
  }
}

export async function publishWithRestore(
  dependencies: PublishDependencies,
  options: PublishOptions,
): Promise<PublicationResult> {
  await authorize(options);
  assertDeploymentHashes(options);
  const branch = previewBranchForRunId(options.runId);

  try {
    await dependencies.revalidate();
    const previewUrl = await dependencies.deploy(
      options.candidateDirectory,
      branch,
    );
    await dependencies.verify(previewUrl, options.candidateDirectory);
    await dependencies.revalidate();
  } catch (error) {
    throw new Error(`Preview publication failed: ${errorMessage(error)}`);
  }

  const promotion = options.snapshotAlreadyCurrent
    ? undefined
    : await dependencies.promote(options.expectedCandidateSha256);
  if (
    promotion !== undefined &&
    promotion.promotedSha256 !== options.expectedCandidateSha256
  ) {
    let snapshotOutcome = promotion
      ? "snapshot restoration succeeded"
      : "snapshot restoration not required";
    if (promotion) {
      try {
        await dependencies.restoreSnapshot(promotion);
      } catch (restoreError) {
        snapshotOutcome = `snapshot restoration failed: ${errorMessage(restoreError)}`;
      }
    }
    throw new Error(
      `Promotion result does not match the authorized candidate hash; ${snapshotOutcome}`,
    );
  }
  let mainTouched = false;
  try {
    await dependencies.revalidate();
    mainTouched = true;
    await dependencies.deploy(options.candidateDirectory, "main");
    await dependencies.verify(
      options.productionBaseUrl,
      options.candidateDirectory,
    );
    await dependencies.revalidate();
    await dependencies.revalidate();
    await dependencies.copyDirectory(
      options.candidateDirectory,
      options.lastGoodDirectory,
      options.expectedArtifactTreeSha256,
      options.expectedManifestSha256,
    );
  } catch (candidateError) {
    let snapshotOutcome = promotion
      ? "snapshot restoration succeeded"
      : "snapshot restoration not required";
    let siteOutcome = mainTouched
      ? "site restoration succeeded"
      : "site restoration not required";
    if (promotion) {
      try {
        await dependencies.restoreSnapshot(promotion);
      } catch (restoreError) {
        snapshotOutcome = `snapshot restoration failed: ${errorMessage(restoreError)}`;
      }
    }
    if (mainTouched) {
      try {
        await dependencies.deploy(options.lastGoodDirectory, "main");
        await dependencies.verify(
          options.productionBaseUrl,
          options.lastGoodDirectory,
        );
      } catch (restoreError) {
        siteOutcome = `site restoration failed: ${errorMessage(restoreError)}`;
      }
    }
    throw new Error(
      `Candidate production failed: ${errorMessage(candidateError)}; ${snapshotOutcome}; ${siteOutcome}`,
    );
  }

  return (
    promotion ?? {
      published: true,
      promoted: false,
      runId: options.runId,
    }
  );
}

/**
 * Deploys a reviewed current snapshot without any snapshot promotion or
 * restoration capability. Every network boundary is preceded by caller-owned
 * revalidation of current, review, artifact tree, and manifest identities.
 */
export async function redeployCurrentWithRestore(
  dependencies: CurrentRedeployDependencies,
  options: CurrentRedeployOptions,
): Promise<{ published: true; promoted: false; runId: string }> {
  await authorizeCurrentRedeploy(options);
  assertDeploymentHashes(options);
  const branch = previewBranchForRunId(options.runId);

  try {
    await dependencies.revalidate();
    const previewUrl = await dependencies.deploy(options.candidateDirectory, branch);
    await dependencies.revalidate();
    await dependencies.verify(previewUrl, options.candidateDirectory);
  } catch (error) {
    throw new Error(`Current site preview failed: ${errorMessage(error)}`);
  }

  let mainTouched = false;
  try {
    await dependencies.revalidate();
    mainTouched = true;
    await dependencies.deploy(options.candidateDirectory, "main");
    await dependencies.revalidate();
    await dependencies.verify(options.productionBaseUrl, options.candidateDirectory);
    await dependencies.revalidate();
    await dependencies.copyDirectory(
      options.candidateDirectory,
      options.lastGoodDirectory,
      options.expectedArtifactTreeSha256,
      options.expectedManifestSha256,
    );
  } catch (currentSiteError) {
    let siteOutcome = mainTouched
      ? "site restoration succeeded"
      : "site restoration not required";
    if (mainTouched) {
      try {
        await dependencies.revalidate();
        await dependencies.deploy(options.lastGoodDirectory, "main");
        await dependencies.revalidate();
        await dependencies.verify(options.productionBaseUrl, options.lastGoodDirectory);
      } catch (restoreError) {
        siteOutcome = `site restoration failed: ${errorMessage(restoreError)}`;
      }
    }
    throw new Error(
      `Current site production failed: ${errorMessage(currentSiteError)}; ${siteOutcome}`,
    );
  }

  return { published: true, promoted: false, runId: options.runId };
}
