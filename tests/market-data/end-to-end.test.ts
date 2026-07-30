import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { runFixturePipeline } from "../../market-data/pipeline.ts";

const projectRoot = resolve(import.meta.dirname, "../..");

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
  assert.ok(result.exportedRoutes.includes("/archive/2026-07"));
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
