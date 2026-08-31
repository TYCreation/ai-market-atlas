import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import fixture from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { stocks } from "../../app/content.ts";
import { EQUITY_UNIVERSE, REQUIRED_STOCK_METRIC_IDS, stockMetricId } from "../../market-data/catalog.ts";
import { evaluateQualityGate } from "../../market-data/quality-gate.ts";
import { assertMarketSnapshot } from "../../market-data/schema.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const seedScript = fileURLToPath(new URL("../../scripts/seed-market-snapshot.ts", import.meta.url));

function runSeed(cwd: string) {
  return new Promise<void>((resolve, reject) => {
    execFile(process.execPath, ["--experimental-strip-types", seedScript], { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test("default seed uses the scheduled Saturday run at 09:00 Asia/Taipei", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "market-seed-"));
  await runSeed(workspace);
  const snapshot = JSON.parse(await readFile(join(workspace, "data/market/current.json"), "utf8"));
  assert.equal(snapshot.runId, "2026-07-25-saturday");
  assert.equal(snapshot.cadence, "saturday");
  assert.equal(snapshot.generatedAt, "2026-07-25T01:00:00.000Z");
  assert.equal(snapshot.dataCutoff, "2026-07-25T01:00:00.000Z");
  assert.equal(snapshot.metrics["stocks.nvda.price"].display.en, "$194.70");
  assert.equal(snapshot.metrics["stocks.nvda.weekReturn"].display.en, "+5.8%");
  assert.equal(snapshot.metrics["stocks.nvda.monthReturn"].display.en, "+12.4%");
});

test("seeded output is checked by the editorial quality gate before writing current data", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "market-seed-quality-"));
  await runSeed(workspace);
  const snapshot = JSON.parse(await readFile(join(workspace, "data/market/current.json"), "utf8")) as MarketSnapshot;
  assertMarketSnapshot(snapshot);
  assert.equal(evaluateQualityGate(snapshot, snapshot).publishable, true);
});

test("deterministic fixture uses the scheduled Saturday timestamp", () => {
  assert.equal(fixture.runId, "2026-08-01-saturday");
  assert.equal(fixture.cadence, "saturday");
  assert.equal(fixture.generatedAt, "2026-08-01T01:00:00.000Z");
});

test("seeded sources preserve exact dates, period boundaries, and live retrieval time", () => {
  assert.equal(fixture.sources["nvidia-q1-fy27"].publishedAt, "2026-05-20T00:00:00.000Z");
  assert.equal(fixture.sources["tsmc-q1-2026"].publishedAt, "2026-04-01T00:00:00.000Z");
  assert.equal(fixture.sources["stanford-economy"].publishedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(fixture.sources["openai-pricing"].publishedAt, "2026-08-01T01:00:00.000Z");
});

test("equity universe stays aligned with the current dashboard and required metric fields", () => {
  assert.deepEqual(EQUITY_UNIVERSE, stocks.equityDive?.equities.map((equity) => equity.ticker));
  for (const ticker of EQUITY_UNIVERSE) {
    assert.equal(REQUIRED_STOCK_METRIC_IDS.has(stockMetricId(ticker, "price")), true);
    assert.equal(REQUIRED_STOCK_METRIC_IDS.has(stockMetricId(ticker, "weekReturn")), true);
    assert.equal(REQUIRED_STOCK_METRIC_IDS.has(stockMetricId(ticker, "monthReturn")), true);
  }
});
