import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertArchivedAutoPublishReview, hashCandidate, type AutomatedReview } from "./review.ts";
import { assertPublishedMarketSnapshot } from "./schema.ts";
import type { MarketSnapshot } from "./types.ts";

export type PublishedBrief = {
  date: string;
  snapshot: MarketSnapshot;
  review: AutomatedReview;
};

const BRIEF_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function readDirectJsonFiles(directory: string, label: string): Promise<Array<{ name: string; value: unknown }>> {
  const directoryMetadata = await lstat(directory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error(`${label} directory must be a real directory`);
  }
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => {
    const path = join(directory, name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`${label} file ${name} must be a regular file; symlinks are not allowed`);
    }
    try {
      return { name, value: JSON.parse(await readFile(path, "utf8")) as unknown };
    } catch (error) {
      throw new Error(`Invalid ${label} file ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
}

/**
 * Read retained, immutable publication provenance. Every snapshot must validate with
 * the published compatibility schema and have exactly one SHA-256-bound auto-publish
 * review; unpaired or ambiguous inputs fail closed.
 */
export async function loadPublishedBriefs(
  runsDirectory: string,
  reviewsDirectory: string,
): Promise<PublishedBrief[]> {
  const [runFiles, reviewFiles] = await Promise.all([
    readDirectJsonFiles(runsDirectory, "brief runs"),
    readDirectJsonFiles(reviewsDirectory, "brief reviews"),
  ]);
  const reviews = reviewFiles.map(({ name, value }) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid brief review file ${name}`);
    }
    return { name, review: value as AutomatedReview };
  });
  const dates = new Set<string>();
  const briefs: PublishedBrief[] = [];
  for (const { name, value } of runFiles) {
    try {
      assertPublishedMarketSnapshot(value);
    } catch (error) {
      throw new Error(`Invalid brief run file ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const snapshot = value as MarketSnapshot;
    const matching = reviews.filter(({ review }) => review.candidateSha256 === hashCandidate(snapshot));
    // A retained run without an exact accepted review is not a permanent brief.
    // This permits current pipeline workspaces to retain unrelated prior runs while
    // making them unpublishable through this historical reader.
    if (matching.length === 0) continue;
    if (matching.length !== 1) {
      throw new Error(`Brief run ${snapshot.runId} must have exactly one matching accepted review`);
    }
    try {
      assertArchivedAutoPublishReview(matching[0].review, matching[0].review.runId);
    } catch (error) {
      throw new Error(`Brief review ${matching[0].name} is not bound to ${snapshot.runId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const date = snapshot.dataCutoff.slice(0, 10);
    if (!BRIEF_DATE.test(date) || dates.has(date)) {
      throw new Error(`Brief cutoff date is invalid or duplicated: ${date}`);
    }
    dates.add(date);
    briefs.push({ date, snapshot, review: matching[0].review });
  }
  return briefs.sort((left, right) => right.date.localeCompare(left.date));
}

export function getPublishedBrief(
  briefs: PublishedBrief[],
  date: string,
): PublishedBrief | undefined {
  if (!BRIEF_DATE.test(date)) return undefined;
  return briefs.find((brief) => brief.date === date);
}

// Development serves source modules while the exporter serves a dist worker. Resolve
// from this source module in dev (the worker's CWD can be `/`), then fall back to the
// project-root working directory when the module lives under dist.
const sourceRunsDirectory = new URL("../data/market/runs/", import.meta.url).pathname;
const sourceReviewsDirectory = new URL("../data/market/reviews/", import.meta.url).pathname;
const defaultRunsDirectory = sourceRunsDirectory.includes("/dist/")
  ? resolve("data/market/runs")
  : sourceRunsDirectory;
const defaultReviewsDirectory = sourceReviewsDirectory.includes("/dist/")
  ? resolve("data/market/reviews")
  : sourceReviewsDirectory;
let defaultBriefs: Promise<PublishedBrief[]> | undefined;

export function listPublishedBriefs(): Promise<PublishedBrief[]> {
  defaultBriefs ??= loadPublishedBriefs(defaultRunsDirectory, defaultReviewsDirectory)
    // Vinext's development worker cannot always expose project data directories to
    // its edge filesystem. Static export still reads and validates them explicitly.
    .catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    });
  return defaultBriefs;
}
