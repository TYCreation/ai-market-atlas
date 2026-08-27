import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runFixturePipeline } from "../../market-data/pipeline.ts";
import { assertAutoPublishReview } from "../../market-data/review.ts";
import validCandidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { autoPublishReview } from "./helpers.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const projectRoot = resolve(import.meta.dirname, "../..");
const valid = validCandidate as unknown as MarketSnapshot;

async function runDerivedFixture(
  mutate: (candidate: MarketSnapshot) => void,
) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "market-derived-fixture-"));
  const candidatePath = join(fixtureRoot, "candidate.json");
  const candidate = structuredClone(valid);
  mutate(candidate);
  await writeFile(candidatePath, `${JSON.stringify(candidate)}\n`);
  try {
    return await runFixturePipeline(candidatePath);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test("helper auto-publish review retains all nine passing checks", () => {
  const review = autoPublishReview(valid);
  assert.doesNotThrow(() => assertAutoPublishReview(review, valid));
  assert.deepEqual(review.checks.map((check) => check.id), [
    "schema",
    "completed-session",
    "required-data",
    "source-health",
    "source-conflict",
    "anomaly",
    "bilingual",
    "narrative-evidence",
    "no-change-integrity",
  ]);
  assert.ok(review.checks.every((check) => check.status === "pass" && check.issueCodes.length === 0));
});

test("fixture pipeline validates, promotes, builds, and exports without production mutation", async () => {
  const currentPath = resolve(projectRoot, "data/market/current.json");
  const monthlyPath = resolve(projectRoot, "data/market/monthly/index.json");
  const before = await Promise.all([
    readFile(currentPath, "utf8"),
    readFile(monthlyPath, "utf8"),
  ]);

  const result = await runFixturePipeline(
    resolve(projectRoot, "tests/fixtures/market/valid-candidate.json"),
  );

  assert.equal(result.review.decision, "auto_publish");
  assert.equal(result.promotedRunId, "2026-08-01-saturday");
  assert.equal(result.deploymentAttempted, false);
  assert.ok(result.exportedRoutes.includes("/stocks"));
  assert.ok(result.exportedRoutes.includes("/archive"));
  assert.ok(result.exportedRoutes.includes("/market-brief/"));
  assert.deepEqual(
    await Promise.all([
      readFile(currentPath, "utf8"),
      readFile(monthlyPath, "utf8"),
    ]),
    before,
  );
});

test("fixture pipeline stops before promotion when review requires approval", async () => {
  const result = await runFixturePipeline(
    resolve(projectRoot, "tests/fixtures/market/conflicting-prices.json"),
  );

  assert.equal(result.review.decision, "manual_review");
  assert.equal(result.promotedRunId, undefined);
  assert.deepEqual(result.exportedRoutes, []);
  assert.equal(result.deploymentAttempted, false);
});

test("derived stale fixture stops before promotion", async () => {
  const result = await runDerivedFixture((candidate) => {
    candidate.dataCutoff = "2026-08-20T01:00:00.000Z";
    candidate.metrics["pulse.power_queue"].asOf = "2026-08-01T01:00:00.000Z";
  });

  assert.equal(result.review.decision, "manual_review");
  assert.ok(result.review.issues.some((issue) => issue.code === "STALE_REQUIRED_METRIC"));
  assert.equal(result.promotedRunId, undefined);
  assert.deepEqual(result.exportedRoutes, []);
});

test("derived missing-opposing-evidence fixture stops before promotion", async () => {
  const result = await runDerivedFixture((candidate) => {
    candidate.pages["/compute"].report.opposingEvidence = [];
  });

  assert.equal(result.review.decision, "reject");
  assert.ok(result.review.issues.some(
    (issue) => issue.code === "MISSING_OPPOSING_EVIDENCE" && issue.page === "/compute",
  ));
  assert.equal(result.promotedRunId, undefined);
  assert.deepEqual(result.exportedRoutes, []);
});

test("derived modeled-presentation fixture stops before promotion", async () => {
  const result = await runDerivedFixture((candidate) => {
    Object.assign(candidate.metrics["stocks.nvda.price"], {
      market: "US",
      marketTimezone: "America/New_York",
      primaryListing: "NVDA",
      securityType: "primary",
      sessionState: "closed",
    });
  });

  assert.equal(result.review.decision, "manual_review");
  assert.ok(result.review.issues.some(
    (issue) => issue.code === "MODELED_MARKET_PRESENTATION" && issue.metricId === "stocks.nvda.price",
  ));
  assert.equal(result.promotedRunId, undefined);
  assert.deepEqual(result.exportedRoutes, []);
});
