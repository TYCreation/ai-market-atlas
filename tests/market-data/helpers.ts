import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  assertAutoPublishReview,
  hashCandidate,
  type AutomatedReview,
} from "../../market-data/review.ts";
import { normalizeCandidate } from "../../market-data/normalize.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

export function pathsFor(root: string) {
  return {
    root,
    candidatePath: join(root, "candidate.json"),
    reviewPath: join(root, "reviews", "2026-08-01-saturday.json"),
    currentPath: join(root, "current.json"),
    runsDir: join(root, "runs"),
    monthlyIndexPath: join(root, "monthly", "index.json"),
  };
}

export async function makeFixtureWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "market-fixture-"));
  const paths = pathsFor(root);
  await Promise.all([
    mkdir(dirname(paths.candidatePath), { recursive: true }),
    mkdir(dirname(paths.reviewPath), { recursive: true }),
    mkdir(paths.runsDir, { recursive: true }),
    mkdir(dirname(paths.monthlyIndexPath), { recursive: true }),
  ]);
  const candidateFixture = new URL("../fixtures/market/valid-candidate.json", import.meta.url);
  const previousFixture = new URL("../fixtures/market/previous-full.json", import.meta.url);
  const previous = JSON.parse(await readFile(previousFixture, "utf8")) as MarketSnapshot;
  await Promise.all([
    cp(candidateFixture, paths.candidatePath),
    writeFile(paths.currentPath, `${JSON.stringify(previous)}\n`),
    writeFile(paths.monthlyIndexPath, "{}\n"),
  ]);
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  await writeFile(paths.candidatePath, `${JSON.stringify(normalizeCandidate(candidate, previous, new Date(candidate.generatedAt)))}\n`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);
  return paths;
}

export async function makeBlockedFixtureWorkspace() {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  const review = autoPublishReview(candidate);
  review.decision = "manual_review";
  review.issues = [{
    code: "SOURCE_CONFLICT",
    severity: "block",
    message: "conflicting sources",
    sourceIds: [],
  }];
  await writeFile(paths.reviewPath, `${JSON.stringify(review)}\n`);
  return paths;
}

export function autoPublishReview(snapshot: MarketSnapshot): AutomatedReview {
  const candidateSha256 = hashCandidate(snapshot);
  const review: AutomatedReview = {
    schemaVersion: 1,
    reviewId: `${snapshot.runId}:${candidateSha256}`,
    runId: snapshot.runId,
    reviewedAt: snapshot.generatedAt,
    candidateSha256,
    decision: "auto_publish",
    checks: [
      "schema",
      "completed-session",
      "required-data",
      "source-health",
      "source-conflict",
      "anomaly",
      "bilingual",
      "narrative-evidence",
      "no-change-integrity",
    ].map((id) => ({ id: id as AutomatedReview["checks"][number]["id"], status: "pass" as const, issueCodes: [] })),
    issues: [],
    reviewedMetricCount: Object.keys(snapshot.metrics).length,
    reviewedSourceCount: Object.keys(snapshot.sources).length,
  };
  assertAutoPublishReview(review, snapshot);
  return review;
}

export async function writePublishableReview(candidatePath: string, reviewPath: string): Promise<void> {
  const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as MarketSnapshot;
  await mkdir(dirname(reviewPath), { recursive: true });
  await writeFile(reviewPath, `${JSON.stringify(autoPublishReview(candidate))}\n`);
}
