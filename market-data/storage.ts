import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { jsonCandidateAdapter } from "./adapters/json-candidate.ts";
import type { SourceAdapter } from "./adapters/types.ts";
import { normalizeCandidate } from "./normalize.ts";
import { assertMonthlyArchiveRecord, type MonthlyArchiveRecord } from "./monthly-record.ts";
import { assertAutoPublishReview, hashCandidate, isSafeMarketRunId, type AutomatedReview } from "./review.ts";
import { assertMarketSnapshot } from "./schema.ts";
import type { MarketSnapshot, SourceRecord } from "./types.ts";

export type { MonthlyArchiveRecord } from "./monthly-record.ts";

export type PromotionResult = {
  promoted: true;
  runId: string;
  archivedPath: string;
  previousRunId: string;
  archivedSha256: string;
  promotedSha256: string;
  monthlyArchiveMonth?: string;
};

export type StoragePaths = {
  candidatePath: string;
  reviewPath: string;
  currentPath: string;
  runsDir: string;
  monthlyIndexPath: string;
  reviewsDir?: string;
  adapter?: SourceAdapter;
  sourceAdapter?: SourceAdapter;
  now?: Date;
};

const ARCHIVE_FILE = /^(\d{4}-\d{2}-\d{2}-(wednesday|saturday|month-end))\.json$/;

function parseSnapshot(text: string, label: string): MarketSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is malformed JSON`);
  }
  assertMarketSnapshot(value);
  return value;
}

async function readCurrent(path: string): Promise<MarketSnapshot> {
  return parseSnapshot(await readFile(path, "utf8"), "current snapshot");
}

async function loadCandidate(paths: StoragePaths, previous: MarketSnapshot): Promise<MarketSnapshot> {
  const adapter = paths.sourceAdapter ?? paths.adapter ?? jsonCandidateAdapter(paths.candidatePath);
  return adapter.collect({
    runId: previous.runId,
    cadence: previous.cadence,
    runStartedAt: previous.generatedAt,
    previous,
  });
}

function candidateNow(candidate: MarketSnapshot, paths: StoragePaths): Date {
  return paths.now ?? new Date(candidate.generatedAt);
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readReview(paths: StoragePaths, candidate: MarketSnapshot): Promise<AutomatedReview> {
  const reviewsDirectory = resolve(paths.reviewsDir ?? join(dirname(resolve(paths.runsDir)), "reviews"));
  const filename = `${candidate.runId}.json`;
  const expectedPath = resolve(reviewsDirectory, filename);
  const reviewPath = resolve(paths.reviewPath);
  if (reviewPath !== expectedPath || dirname(reviewPath) !== reviewsDirectory || basename(reviewPath) !== filename) {
    throw new Error("review path must be the direct named child of the reviews directory");
  }
  try {
    const metadata = await lstat(reviewPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("review file must be a regular file");
    return JSON.parse(await readFile(reviewPath, "utf8")) as AutomatedReview;
  } catch (error) {
    if (error instanceof Error && error.message === "review file must be a regular file") throw error;
    if (!isMissingFile(error)) throw new Error("matching auto_publish review required");
    throw new Error("matching auto_publish review required");
  }
}

async function writeAtomically(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeSnapshotAtomically(path: string, snapshot: MarketSnapshot, replace = true): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
    const written = parseSnapshot(await readFile(temporary, "utf8"), "written snapshot");
    if (written.runId !== snapshot.runId) throw new Error("written snapshot identity does not match");
    if (replace) {
      await rename(temporary, path);
    } else {
      await link(temporary, path);
      await rm(temporary);
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readRegularSnapshot(path: string, label: string): Promise<MarketSnapshot> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} must be a regular file`);
  return parseSnapshot(await readFile(path, "utf8"), label);
}

function sameArchiveIdentity(snapshot: MarketSnapshot, runId: string, sha256: string): boolean {
  return snapshot.runId === runId && hashCandidate(snapshot) === sha256;
}

async function ensureArchive(path: string, previous: MarketSnapshot): Promise<boolean> {
  const expectedSha256 = hashCandidate(previous);
  try {
    const existing = await readRegularSnapshot(path, "existing archive");
    if (!sameArchiveIdentity(existing, previous.runId, expectedSha256)) {
      throw new Error("existing archive does not match expected prior snapshot");
    }
    return false;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  try {
    await writeSnapshotAtomically(path, previous, false);
    return true;
  } catch (error) {
    if (!isMissingFile(error) && !(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) {
      throw error;
    }
    return ensureArchive(path, previous);
  }
}

function safeRunPath(runsDir: string, runId: string): string {
  if (!isSafeMarketRunId(runId)) throw new Error("snapshot runId is unsafe");
  const filename = `${runId}.json`;
  const directory = resolve(runsDir);
  const path = resolve(directory, filename);
  if (dirname(path) !== directory || basename(path) !== filename) {
    throw new Error("archive path must be a direct child of runs directory");
  }
  return path;
}

function monthFor(snapshot: MarketSnapshot): string {
  const match = /^(\d{4}-\d{2})-\d{2}-month-end$/.exec(snapshot.runId);
  if (!match) throw new Error("month-end snapshot has an invalid runId");
  return match[1];
}

export function projectMonthlyArchive(
  snapshot: MarketSnapshot,
  review: AutomatedReview,
): MonthlyArchiveRecord {
  const root = snapshot.pages["/"];
  const sources: SourceRecord[] = Object.values(snapshot.sources)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((source) => structuredClone(source));
  const record: MonthlyArchiveRecord = {
    month: monthFor(snapshot),
    runId: snapshot.runId,
    dataCutoff: snapshot.dataCutoff,
    summary: root.report.summary,
    basketChange: snapshot.metrics["stocks.basket_30d"],
    equityChanges: Object.values(snapshot.metrics)
      .filter((metric) => metric.id.startsWith("stocks.") && metric.id.endsWith(".monthReturn"))
      .sort((left, right) => left.id.localeCompare(right.id)),
    thesisChanges: (Object.entries(snapshot.pages) as Array<[keyof MarketSnapshot["pages"], MarketSnapshot["pages"]["/"]]>)
      .filter(([, page]) => page.thesisStance !== page.previousThesisStance)
      .map(([page, state]) => ({
        page,
        from: state.previousThesisStance,
        to: state.thesisStance,
        explanation: state.report.thesis.body,
        metricIds: [...state.thesisMetricIds],
      })),
    catalysts: root.report.catalysts,
    risks: root.report.risks,
    sourceIds: sources.map((source) => source.id),
    sources,
    review,
  };
  assertMonthlyArchiveRecord(record);
  return record;
}

async function readMonthlyIndex(path: string): Promise<Record<string, MonthlyArchiveRecord>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("monthly archive index must be an object");
    }
    return value as Record<string, MonthlyArchiveRecord>;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeMonthlyIndex(path: string, index: Record<string, MonthlyArchiveRecord>): Promise<void> {
  await writeAtomically(path, `${JSON.stringify(index, null, 2)}\n`);
}

/** Loads and normalizes an untrusted candidate without authorizing publication. */
export async function validateCandidate(paths: StoragePaths): Promise<MarketSnapshot> {
  const previous = await readCurrent(paths.currentPath);
  const candidate = await loadCandidate(paths, previous);
  return validateSnapshot(candidate, previous, paths);
}

function validateSnapshot(candidate: MarketSnapshot, previous: MarketSnapshot, paths: StoragePaths): MarketSnapshot {
  if (!isSafeMarketRunId(candidate.runId, candidate.cadence)) {
    throw new Error("candidate runId is not a scheduled market run");
  }
  return normalizeCandidate(candidate, previous, candidateNow(candidate, paths));
}

/** Promotes only a candidate whose persisted automated review is bound to its exact content. */
export async function promoteCandidate(
  paths: StoragePaths,
  expectedCandidateSha256: string,
): Promise<PromotionResult> {
  if (!/^[a-f0-9]{64}$/.test(expectedCandidateSha256)) {
    throw new Error("authorized candidate hash is required");
  }
  const previous = await readCurrent(paths.currentPath);
  const candidate = await loadCandidate(paths, previous);
  const normalized = validateSnapshot(candidate, previous, paths);
  if (hashCandidate(normalized) !== expectedCandidateSha256) {
    throw new Error("candidate no longer matches the authorized candidate hash");
  }
  const review = await readReview(paths, normalized);
  assertAutoPublishReview(review, normalized);

  const archivedPath = safeRunPath(paths.runsDir, normalized.runId);
  const monthlyArchiveMonth = normalized.cadence === "month-end" ? monthFor(normalized) : undefined;
  const monthlyIndex = monthlyArchiveMonth === undefined ? undefined : await readMonthlyIndex(paths.monthlyIndexPath);
  if (monthlyArchiveMonth !== undefined && monthlyIndex![monthlyArchiveMonth] !== undefined) {
    throw new Error(`monthly archive already exists for ${monthlyArchiveMonth}`);
  }

  // Persist the old snapshot before switching current so a rename failure cannot discard the last good state.
  const archiveCreated = await ensureArchive(archivedPath, previous);
  try {
    await writeSnapshotAtomically(paths.currentPath, normalized);
    if (monthlyArchiveMonth !== undefined) {
      await writeMonthlyIndex(paths.monthlyIndexPath, {
        ...monthlyIndex,
        [monthlyArchiveMonth]: projectMonthlyArchive(normalized, review),
      });
    }
  } catch (error) {
    await writeSnapshotAtomically(paths.currentPath, previous);
    if (archiveCreated) await rm(archivedPath, { force: true });
    throw error;
  }

  return {
    promoted: true,
    runId: normalized.runId,
    archivedPath,
    previousRunId: previous.runId,
    archivedSha256: hashCandidate(previous),
    promotedSha256: hashCandidate(normalized),
    ...(monthlyArchiveMonth === undefined ? {} : { monthlyArchiveMonth }),
  };
}

/** Restores only the archived file recorded by a promotion result. */
export async function restoreCurrent(paths: StoragePaths, promotion: PromotionResult): Promise<void> {
  const runsDir = resolve(paths.runsDir);
  const archivedPath = resolve(promotion.archivedPath);
  const filename = basename(archivedPath);
  if (dirname(archivedPath) !== runsDir || !ARCHIVE_FILE.test(filename)) {
    throw new Error("promotion archive path is invalid");
  }
  let archived: MarketSnapshot;
  try {
    archived = await readRegularSnapshot(archivedPath, "promotion archive");
  } catch (error) {
    if (error instanceof Error && error.message === "promotion archive must be a regular file") throw error;
    throw error;
  }
  if (
    !isSafeMarketRunId(archived.runId, archived.cadence) ||
    `${promotion.runId}.json` !== filename
    || !sameArchiveIdentity(archived, promotion.previousRunId, promotion.archivedSha256)
  ) {
    throw new Error("promotion archive identity does not match");
  }
  const current = await readCurrent(paths.currentPath);
  if (current.runId !== promotion.runId || hashCandidate(current) !== promotion.promotedSha256) {
    throw new Error("current snapshot identity does not match the promotion");
  }
  await writeSnapshotAtomically(paths.currentPath, archived);

  const index = await readMonthlyIndex(paths.monthlyIndexPath);
  const retained = Object.fromEntries(
    Object.entries(index).filter(([, record]) => record?.runId !== promotion.runId),
  ) as Record<string, MonthlyArchiveRecord>;
  if (Object.keys(retained).length !== Object.keys(index).length) {
    await writeMonthlyIndex(paths.monthlyIndexPath, retained);
  }
}

/**
 * Legacy CLI compatibility only. Weekly run and review provenance is permanent
 * because dated routes depend on it, so this command deliberately removes nothing.
 */
export async function pruneRuns(_root: string, _now: Date = new Date()): Promise<string[]> {
  void _root;
  void _now;
  return [];
}
