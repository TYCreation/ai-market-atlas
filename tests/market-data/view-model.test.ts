import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildSourceBundles,
  createMarketViewModel,
  getPageMeta,
  loadMarketSnapshot,
} from "../../market-data/view-model.ts";
import { hydrateDashboard, stocks } from "../../app/content.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

test("returns both locales from one metric record", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("../../tests/fixtures/market/valid-candidate.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  assert.deepEqual(createMarketViewModel(snapshot).getKpi("/", 0, "en"), {
    metricId: "pulse.infrastructure_spend",
    value: "$2.8T",
    sourceIds: ["atlas-model", "stanford-economy"],
    kind: "atlas-model",
    freshness: "current",
    asOf: "2026-08-01T01:00:00.000Z",
    direction: "not-applicable",
  });
  assert.equal(createMarketViewModel(snapshot).getKpi("/", 0, "zh").metricId, "pulse.infrastructure_spend");
});

test("localizes falsifiable risks and dated threshold observations without fixed counts", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("../../tests/fixtures/market/valid-candidate.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  const report = createMarketViewModel(snapshot).getPageReport("/compute", "en");

  assert.ok(report.analystNotes.length > 0);
  assert.ok(report.risks.length > 0);
  assert.match(report.risks[0].condition, /^The thesis weakens if:/);
  assert.equal(report.nextObservations[0].by, "2026-08-15");
  assert.equal(report.nextObservations[0].legacy, false);
  assert.match(report.nextObservations[0].threshold, /weaken the thesis/i);
});

test("marks legacy published observation thresholds as unavailable without relaxing candidates", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("../../data/market/current.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  const report = createMarketViewModel(snapshot).getPageReport("/compute", "en");

  assert.equal(report.risks.length, 0);
  assert.ok(report.analystNotes.length > 0);
  assert.equal(report.nextObservations[0].legacy, true);
  assert.equal(report.nextObservations[0].by, null);
  assert.match(report.nextObservations[0].threshold, /legacy observation; threshold unavailable/i);
});

test("marks an unchanged page without replacing its thesis", () => {
  const meta = getPageMeta("/models", "zh");
  assert.equal(meta.changeLabel, "本期無重大變化");
  assert.equal(meta.changed, false);
  assert.equal(meta.report.thesis.title, "勝出的代理是重新設計的工作流程，不是聊天視窗。");
});

test("builds each page source bundle only from referenced snapshot sources", async () => {
  const snapshot = JSON.parse(
    await readFile(new URL("../../data/market/current.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  const bundles = buildSourceBundles(snapshot);

  assert.deepEqual(
    [...bundles["/energy"].kpiSources[0]].sort(),
    ["atlas-model", "iea-data-centres", "iea-energy-ai"],
  );
  assert.deepEqual(
    bundles["/energy"].sources.map((source) => source.id).sort(),
    ["atlas-model", "doe-data-centers", "iea-data-centres", "iea-energy-ai", "vistra-q2-2026"],
  );
  assert.equal(bundles["/energy"].reviewed, snapshot.dataCutoff);
});

test("loads and validates an explicitly selected preview snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-view-model-"));
  const previewPath = join(root, "preview.json");
  const snapshot = JSON.parse(
    await readFile(new URL("../../data/market/current.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  snapshot.runId = "preview-safe-path";
  await writeFile(previewPath, `${JSON.stringify(snapshot)}\n`);

  const loaded = await loadMarketSnapshot(previewPath);
  assert.equal(loaded.runId, "preview-safe-path");
  assert.equal(createMarketViewModel(loaded).getEditionMeta("en").runId, "preview-safe-path");

  await assert.rejects(
    () => loadMarketSnapshot(join(root, "..", "missing.json")),
    /snapshot path|ENOENT/i,
  );
});

test("exposes presentation-safe metric provenance", () => {
  const snapshot = structuredClone(
    JSON.parse(readFileSync(new URL("../../tests/fixtures/market/valid-candidate.json", import.meta.url), "utf8")) as MarketSnapshot,
  );
  const view = createMarketViewModel(snapshot).getKpi("/", 0, "zh");
  assert.equal(view.kind, "atlas-model");
  assert.equal(view.asOf, snapshot.metrics[view.metricId].asOf);
  assert.equal(view.freshness, "current");
  assert.deepEqual(view.sourceIds, snapshot.metrics[view.metricId].sourceIds);
});

test("omits an optional stale stock observation", () => {
  const snapshot = structuredClone(
    JSON.parse(readFileSync(new URL("../../data/market/current.json", import.meta.url), "utf8")) as MarketSnapshot,
  );
  snapshot.metrics["stocks.nvda.price"].required = false;
  snapshot.metrics["stocks.nvda.price"].asOf = "2026-07-01T20:00:00.000Z";
  const view = createMarketViewModel(snapshot);
  assert.equal(view.getStockMetric("NVDA", "price", "en"), undefined);
});

test("hydrates the stocks reader without loading stale per-ticker quotes", () => {
  const snapshot = structuredClone(
    JSON.parse(readFileSync(new URL("../../data/market/current.json", import.meta.url), "utf8")) as MarketSnapshot,
  );
  snapshot.metrics["stocks.nvda.price"].asOf = "2026-07-01T20:00:00.000Z";

  const hydrated = hydrateDashboard(stocks, "en", createMarketViewModel(snapshot));
  const equity = hydrated.equityDive?.equities[0];

  assert.ok(equity);
  assert.equal("price" in equity, false);
  assert.equal("week" in equity, false);
  assert.equal("month" in equity, false);
});
