import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import validCandidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { hashCandidate } from "../../market-data/review.ts";
import { getPublishedBrief, loadPublishedBriefs } from "../../market-data/briefs.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const valid = validCandidate as unknown as MarketSnapshot;

function snapshot(runId: string, dataCutoff: string): MarketSnapshot {
  const result = structuredClone(valid);
  result.runId = runId;
  result.dataCutoff = dataCutoff;
  result.generatedAt = dataCutoff;
  for (const page of Object.values(result.pages)) page.verifiedAt = dataCutoff;
  for (const metric of Object.values(result.metrics)) metric.asOf = dataCutoff;
  return result;
}

function acceptedReview(value: MarketSnapshot) {
  return {
    schemaVersion: 1,
    reviewId: `${value.runId}:${hashCandidate(value)}`,
    runId: value.runId,
    reviewedAt: value.generatedAt,
    candidateSha256: hashCandidate(value),
    decision: "auto_publish",
    checks: [
      "schema", "completed-session", "required-data", "source-health", "source-conflict",
      "anomaly", "bilingual", "narrative-evidence", "no-change-integrity",
    ].map((id) => ({ id, status: "pass", issueCodes: [] })),
    issues: [],
    reviewedMetricCount: Object.keys(value.metrics).length,
    reviewedSourceCount: Object.keys(value.sources).length,
  };
}

test("loads only published snapshots bound to a matching accepted review and indexes them by cutoff date", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-briefs-"));
  const runs = join(root, "runs");
  const reviews = join(root, "reviews");
  try {
    await Promise.all([mkdir(runs), mkdir(reviews)]);
    const older = snapshot("2026-08-01-saturday", "2026-08-01T01:00:00.000Z");
    const newer = snapshot("2026-08-05-wednesday", "2026-08-05T01:00:00.000Z");
    await Promise.all([
      writeFile(join(runs, "candidate-1.json"), JSON.stringify(older)),
      writeFile(join(runs, "candidate-2.json"), JSON.stringify(newer)),
      writeFile(join(reviews, "review-1.json"), JSON.stringify(acceptedReview(older))),
      writeFile(join(reviews, "review-2.json"), JSON.stringify(acceptedReview(newer))),
    ]);

    const briefs = await loadPublishedBriefs(runs, reviews);

    assert.deepEqual(briefs.map((brief) => brief.date), ["2026-08-05", "2026-08-01"]);
    assert.equal(getPublishedBrief(briefs, "2026-08-01")?.snapshot.runId, "2026-08-01-saturday");
    assert.equal(getPublishedBrief(briefs, "2026-08-01/"), undefined);
    assert.equal(getPublishedBrief(briefs, "2026-08-02"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed by excluding a snapshot without a review bound to its bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-briefs-unbound-"));
  const runs = join(root, "runs");
  const reviews = join(root, "reviews");
  try {
    await Promise.all([mkdir(runs), mkdir(reviews)]);
    const value = snapshot("2026-08-01-saturday", "2026-08-01T01:00:00.000Z");
    const review = acceptedReview(value);
    review.candidateSha256 = "0".repeat(64);
    await Promise.all([
      writeFile(join(runs, "candidate.json"), JSON.stringify(value)),
      writeFile(join(reviews, "review.json"), JSON.stringify(review)),
    ]);
    assert.deepEqual(await loadPublishedBriefs(runs, reviews), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinked provenance files rather than following a path outside the retained directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-briefs-symlink-"));
  const runs = join(root, "runs");
  const reviews = join(root, "reviews");
  try {
    await Promise.all([mkdir(runs), mkdir(reviews)]);
    const value = snapshot("2026-08-01-saturday", "2026-08-01T01:00:00.000Z");
    const target = join(root, "snapshot.json");
    await writeFile(target, JSON.stringify(value));
    await Promise.all([
      symlink(target, join(runs, "candidate.json")),
      writeFile(join(reviews, "review.json"), JSON.stringify(acceptedReview(value))),
    ]);
    await assert.rejects(loadPublishedBriefs(runs, reviews), /symlink/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
