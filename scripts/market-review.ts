import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSafeMarketRunId,
  reviewCandidate,
  type AutomatedReview,
} from "../market-data/review.ts";
import { loadRecentSnapshots } from "../market-data/history.ts";
import { normalizeCandidate } from "../market-data/normalize.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import {
  createPinnedSourceFetcher,
  resolveHostname,
  type HostnameResolver,
  type SourceFetcher,
} from "../market-data/source-health.ts";
import type { MarketSnapshot } from "../market-data/types.ts";

type MarketReviewOptions = {
  candidatePath: string;
  previousPath: string;
  reviewsDirectory: string;
  fetcher: SourceFetcher;
  resolver?: HostnameResolver;
  stdout?: (summary: string) => void;
};

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

async function parseCandidate(path: string): Promise<unknown> {
  const source = await readFile(path, "utf8");
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function writeReviewAtomically(path: string, review: AutomatedReview): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(review, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeNormalizedCandidateAtomically(path: string, snapshot: MarketSnapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
    const written = JSON.parse(await readFile(temporary, "utf8")) as unknown;
    assertMarketSnapshot(written);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function runMarketReview(options: MarketReviewOptions): Promise<{
  exitCode: 0 | 2 | 3;
  outputPath: string;
  review: AutomatedReview;
}> {
  const rawCandidate = await parseCandidate(options.candidatePath);
  const previous = JSON.parse(await readFile(options.previousPath, "utf8")) as MarketSnapshot;
  let candidate = rawCandidate;
  try {
    assertMarketSnapshot(rawCandidate);
    candidate = normalizeCandidate(rawCandidate, previous, new Date(rawCandidate.generatedAt));
    await writeNormalizedCandidateAtomically(options.candidatePath, candidate);
  } catch {
    // reviewCandidate records the canonical rejection for malformed or unpublishable input.
  }
  let history: MarketSnapshot[] = [];
  if (typeof previous.dataCutoff === "string") {
    try {
      const loaded = await loadRecentSnapshots(
        resolve(dirname(options.previousPath), "runs"),
        previous.dataCutoff,
        3,
      );
      const candidateRunId =
        candidate !== null && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).runId === "string"
          ? (candidate as Record<string, string>).runId
          : undefined;
      history = loaded
        .filter((snapshot) => snapshot.runId !== previous.runId && snapshot.runId !== candidateRunId)
        .slice(0, 1);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
        throw error;
      }
    }
  }
  const review = await reviewCandidate(candidate, previous, options.fetcher, options.resolver, history);
  const reviewsDirectory = resolve(options.reviewsDirectory);
  const filename = isSafeMarketRunId(review.runId)
    ? `${review.runId}.json`
    : `rejected-${review.candidateSha256}.json`;
  const outputPath = resolve(reviewsDirectory, filename);
  if (dirname(outputPath) !== reviewsDirectory || basename(outputPath) !== filename) {
    throw new Error("review output must be a direct child of the review directory");
  }
  await writeReviewAtomically(outputPath, review);
  options.stdout?.(JSON.stringify(review, null, 2));
  return {
    exitCode: review.decision === "auto_publish" ? 0 : review.decision === "manual_review" ? 2 : 3,
    outputPath,
    review,
  };
}

async function main(args: string[]): Promise<void> {
  const result = await runMarketReview({
    candidatePath: resolve(option(args, "--candidate", "candidate/market.json")),
    previousPath: resolve(option(args, "--previous", "data/market/current.json")),
    reviewsDirectory: resolve(option(args, "--reviews-directory", "data/market/reviews")),
    fetcher: createPinnedSourceFetcher(),
    resolver: resolveHostname,
    stdout: console.log,
  });
  process.exitCode = result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
