import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import conflictingCandidate from "../fixtures/market/conflicting-prices.json" with { type: "json" };
import previous from "../fixtures/market/previous-snapshot.json" with { type: "json" };
import {
  assertAutoPublishReview,
  hashCandidate,
  reviewCandidate,
} from "../../market-data/review.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";
import { runMarketReview } from "../../scripts/market-review.ts";

const valid = candidate as unknown as MarketSnapshot;
const conflicting = conflictingCandidate as unknown as MarketSnapshot;
const previousSnapshot = previous as unknown as MarketSnapshot;
const reachableFetcher = async () => new Response("", { status: 200 });

function reviewableCandidate(): MarketSnapshot {
  const snapshot = structuredClone(valid);
  snapshot.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  snapshot.metrics["stocks.wolf.weekReturn"].display = { en: "-19.9%", zh: "-19.9%" };
  return snapshot;
}

test("hashes recursively key-sorted candidate content deterministically", () => {
  assert.equal(
    hashCandidate({ z: 1, nested: { beta: 2, alpha: [3, { y: 4, x: 5 }] }, a: true }),
    "7550167b9f35675a5fc2647d25764a71389f2e75f85cd3fe178dd2e3dcf40906",
  );
  assert.equal(hashCandidate({ b: 2, a: 1 }), hashCandidate({ a: 1, b: 2 }));
});

test("creates an auto-publish review bound to the exact candidate", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewCandidate(snapshot, previousSnapshot, reachableFetcher);

  assert.equal(review.decision, "auto_publish");
  assert.equal(review.candidateSha256, hashCandidate(snapshot));
  assert.equal(review.checks.length, 9);
  assert.doesNotThrow(() => assertAutoPublishReview(review, snapshot));
});

test("rejects a passed review after candidate content changes", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewCandidate(snapshot, previousSnapshot, reachableFetcher);
  const changed = structuredClone(snapshot);
  changed.metrics["stocks.nvda.price"].numericValue += 1;

  assert.throws(
    () => assertAutoPublishReview(review, changed),
    /review candidate hash does not match/,
  );
});

test("rejects a review whose persisted identity was altered", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewCandidate(snapshot, previousSnapshot, reachableFetcher);
  review.reviewId = "altered";

  assert.throws(
    () => assertAutoPublishReview(review, snapshot),
    /review identity does not match/,
  );
});

test("routes a source conflict to manual review", async () => {
  const snapshot = structuredClone(conflicting);
  snapshot.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  const review = await reviewCandidate(snapshot, previousSnapshot, reachableFetcher);

  assert.equal(review.decision, "manual_review");
  assert.ok(review.issues.some((issue) => issue.code === "SOURCE_CONFLICT"));
});

test("rejects incomplete sessions and unreachable sources without backups", async () => {
  const incomplete = reviewableCandidate();
  incomplete.metrics["stocks.nvda.price"].asOf = "2026-08-02T01:00:00.000Z";
  const incompleteReview = await reviewCandidate(incomplete, previousSnapshot, reachableFetcher);
  assert.equal(incompleteReview.decision, "reject");
  assert.equal(incompleteReview.checks.find((check) => check.id === "completed-session")?.status, "fail");

  const sourceUrl = valid.sources["stanford-economy"].url;
  const unreachableReview = await reviewCandidate(
    reviewableCandidate(),
    previousSnapshot,
    async (input) => new Response("", { status: String(input) === sourceUrl ? 503 : 200 }),
  );
  assert.equal(unreachableReview.decision, "reject");
  assert.equal(unreachableReview.checks.find((check) => check.id === "source-health")?.status, "fail");
});

test("auto-publishes when source-health issues are warnings only", async () => {
  const forbiddenUrl = valid.sources["broadcom-q2-fy26"].url;
  const review = await reviewCandidate(
    reviewableCandidate(),
    previousSnapshot,
    async (input) => new Response("", { status: String(input) === forbiddenUrl ? 403 : 200 }),
  );

  assert.equal(review.decision, "auto_publish");
  assert.equal(review.checks.find((check) => check.id === "source-health")?.status, "warn");
});

test("rejects an unmatched numeric narrative claim", async () => {
  const snapshot = reviewableCandidate();
  snapshot.pages["/compute"].report.supportingEvidence.push({
    text: {
      en: "Accelerator supply rose to 999.",
      zh: "加速器供應升至 999。",
    },
    metricIds: ["compute.accelerator_pool"],
  });

  const review = await reviewCandidate(snapshot, previousSnapshot, reachableFetcher);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.find((check) => check.id === "narrative-evidence")?.status, "fail");
});

test("rejects a no-change integrity failure", async () => {
  const prior = reviewableCandidate();
  const rewritten = structuredClone(prior);
  rewritten.pages["/models"].report.thesis.body.en += " Rewritten without a declared change.";

  const review = await reviewCandidate(rewritten, prior, reachableFetcher);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.find((check) => check.id === "no-change-integrity")?.status, "fail");
});

test("rejects schema-invalid content but still emits every review check", async () => {
  const invalid = structuredClone(reviewableCandidate()) as unknown as Record<string, unknown>;
  delete (invalid.metrics as Record<string, unknown>)["pulse.infrastructure_spend"];

  const review = await reviewCandidate(invalid, previousSnapshot, reachableFetcher);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.length, 9);
  assert.equal(review.checks.find((check) => check.id === "schema")?.status, "fail");
});

test("persists the full review atomically and maps all CLI decision exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-review-"));
  const candidatePath = join(root, "candidate.json");
  const previousPath = join(root, "previous.json");
  const reviewsDirectory = join(root, "reviews");
  await writeFile(previousPath, JSON.stringify(previousSnapshot));

  await writeFile(candidatePath, JSON.stringify(reviewableCandidate()));
  const accepted = await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
  });
  assert.equal(accepted.exitCode, 0);
  assert.deepEqual(JSON.parse(await readFile(accepted.outputPath, "utf8")), accepted.review);

  const manual = structuredClone(conflicting);
  manual.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  await writeFile(candidatePath, JSON.stringify(manual));
  assert.equal((await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
  })).exitCode, 2);

  await writeFile(candidatePath, "{not-json");
  assert.equal((await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
  })).exitCode, 3);
});
