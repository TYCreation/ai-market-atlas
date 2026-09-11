import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  getMonthlyArchive,
  listMonthlyArchives,
  parseMonthlyArchiveIndex,
} from "../../market-data/monthly.ts";
import { promoteCandidate } from "../../market-data/storage.ts";
import { makeFixtureWorkspace, writePublishableReview } from "./helpers.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

async function promoteReviewed(
  paths: Awaited<ReturnType<typeof makeFixtureWorkspace>>,
) {
  const review = JSON.parse(await readFile(paths.reviewPath, "utf8")) as {
    candidateSha256: string;
  };
  return promoteCandidate(paths, review.candidateSha256);
}

test("returns a permanent YYYY-MM archive", () => {
  const archive = getMonthlyArchive("2026-07");

  assert.ok(archive);
  assert.equal(archive.month, "2026-07");
  assert.ok(archive.sourceIds.length > 0);
});

test("rejects an invalid archive month path before lookup", () => {
  assert.throws(() => getMonthlyArchive("../2026-07"), /Invalid archive month/);
});

test("lists every retained permanent archive month for static route generation", async () => {
  const index = JSON.parse(await readFile(new URL("../../data/market/monthly/index.json", import.meta.url), "utf8"));
  assert.deepEqual(listMonthlyArchives().map(({ month }) => month).sort(), Object.keys(index).sort());
});

test("parses a real month-end promotion with immutable sources and review provenance", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.runId = "2026-07-25-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);

  await promoteReviewed(paths);
  const index = JSON.parse(await readFile(paths.monthlyIndexPath, "utf8"));
  const entry = parseMonthlyArchiveIndex(index).find(({ archive }) => archive.month === "2026-07");

  assert.ok(entry);
  assert.equal(entry.archive.runId, "2026-07-25-month-end");
  assert.equal(entry.sources.find((source) => source.id === "nvidia-q1-fy27")?.publisher, "NVIDIA Investor Relations");
  assert.equal(entry.review.kind, "automated-review");
  assert.equal(entry.review.review.runId, "2026-07-25-month-end");
});

test("rejects incomplete sources and forged automated review provenance", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.runId = "2026-07-25-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);
  await promoteReviewed(paths);

  const index = JSON.parse(await readFile(paths.monthlyIndexPath, "utf8"));
  const record = index["2026-07"];
  const invalidRecords = [
    (() => {
      const invalid = structuredClone(record);
      delete invalid.sources[0].publishedAt;
      return invalid;
    })(),
    (() => {
      const invalid = structuredClone(record);
      invalid.sources[0].url = "https://example.com/?api_key=leaked";
      return invalid;
    })(),
    (() => {
      const invalid = structuredClone(record);
      invalid.review.runId = "2026-08-01-saturday";
      return invalid;
    })(),
    (() => {
      const invalid = structuredClone(record);
      invalid.review.checks = [];
      return invalid;
    })(),
    (() => {
      const invalid = structuredClone(record);
      invalid.review.checks[0].status = "fail";
      return invalid;
    })(),
    (() => {
      const invalid = structuredClone(record);
      invalid.review.candidateSha256 = "not-a-sha256";
      invalid.review.reviewId = `${invalid.review.runId}:not-a-sha256`;
      return invalid;
    })(),
  ];

  for (const invalid of invalidRecords) {
    assert.throws(() => parseMonthlyArchiveIndex({ "2026-07": invalid }), /monthly archive record is invalid/);
  }
});

test("requires every archived warning code to remain with its canonical review check", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.runId = "2026-07-25-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);
  await promoteReviewed(paths);

  const index = JSON.parse(await readFile(paths.monthlyIndexPath, "utf8"));
  const record = index["2026-07"];
  const sourceHealthWarning = {
    code: "SOURCE_UNREACHABLE",
    severity: "warn",
    message: "backup source used",
    sourceIds: [],
  };
  const validWarning = structuredClone(record);
  validWarning.review.issues = [sourceHealthWarning];
  const sourceHealth = validWarning.review.checks.find((check: { id: string }) => check.id === "source-health");
  sourceHealth.status = "warn";
  sourceHealth.issueCodes = ["SOURCE_UNREACHABLE"];
  assert.doesNotThrow(() => parseMonthlyArchiveIndex({ "2026-07": validWarning }));

  const movedSourceWarning = structuredClone(validWarning);
  const movedSourceHealth = movedSourceWarning.review.checks.find((check: { id: string }) => check.id === "source-health");
  movedSourceHealth.status = "pass";
  movedSourceHealth.issueCodes = [];
  const anomaly = movedSourceWarning.review.checks.find((check: { id: string }) => check.id === "anomaly");
  anomaly.status = "warn";
  anomaly.issueCodes = ["SOURCE_UNREACHABLE"];

  const movedBilingualWarning = structuredClone(record);
  movedBilingualWarning.review.issues = [{
    code: "BILINGUAL_MISMATCH",
    severity: "warn",
    message: "localized copy needs review",
    sourceIds: [],
  }];
  const integrity = movedBilingualWarning.review.checks.find((check: { id: string }) => check.id === "no-change-integrity");
  integrity.status = "warn";
  integrity.issueCodes = ["BILINGUAL_MISMATCH"];

  for (const invalid of [movedSourceWarning, movedBilingualWarning]) {
    assert.throws(() => parseMonthlyArchiveIndex({ "2026-07": invalid }), /monthly archive record is invalid/);
  }
});
