import assert from "node:assert/strict";
import test from "node:test";
import { citedEditionFixture } from "../fixtures/market/cited-edition.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "../../market-data/schema.ts";
import { createMarketViewModel } from "../../market-data/view-model.ts";
import { hydrateDashboard, marketPulse } from "../../app/content.ts";
import legacy from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPublishedBriefs } from "../../market-data/briefs.ts";
import { autoPublishReview } from "./helpers.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

test("cited editions replace legacy modeled KPI and quote requirements without changing legacy validation", () => {
  assert.doesNotThrow(() => assertMarketSnapshot(citedEditionFixture()));
  assert.doesNotThrow(() => assertPublishedMarketSnapshot(legacy));
  const broken = structuredClone(legacy) as unknown as MarketSnapshot;
  delete broken.metrics["stocks.nvda.price"];
  assert.throws(() => assertMarketSnapshot(broken), /required equity metric/);
});

test("cited editions reject missing, cross-page, optional, modeled and unregistered KPIs", () => {
  const cases: Array<(s: MarketSnapshot) => void> = [
    (s) => { s.pages["/"].kpis = []; },
    (s) => { s.pages["/"].kpis![0].metricId = "sic.onsemi_q2_revenue"; },
    (s) => { s.metrics["pulse.nvidia_data_center_revenue"].required = false; },
    (s) => { s.metrics["pulse.nvidia_data_center_revenue"].kind = "modeled"; },
    (s) => { const id = "pulse.unregistered"; s.metrics[id] = { ...s.metrics["pulse.nvidia_data_center_revenue"], id }; s.pages["/"].kpis![0].metricId = id; },
    (s) => { s.metrics["stocks.nvda.price"] = structuredClone(legacy.metrics["stocks.nvda.price"]); },
  ];
  for (const mutate of cases) {
    const snapshot = citedEditionFixture();
    mutate(snapshot);
    assert.throws(() => assertMarketSnapshot(snapshot));
  }
});

test("cited editions render only snapshot labels and facts without static model panels", () => {
  const snapshot = citedEditionFixture();
  const vm = createMarketViewModel(snapshot);
  for (const historical of [false, true]) {
    const config = hydrateDashboard(marketPulse, "en", vm, { historical });
    assert.equal(config.kpis.length, 1);
    assert.equal(config.kpis[0].label, "Cited quarterly fact");
    assert.equal(config.kpis[0].metricId, "pulse.nvidia_data_center_revenue");
    assert.deepEqual(config.chart.values, []);
    assert.deepEqual(config.table.rows, []);
    assert.deepEqual(config.clusters, []);
    assert.equal(config.deepDive, undefined);
  }
  snapshot.metrics["pulse.nvidia_data_center_revenue"].asOf = "2025-01-01T00:00:00.000Z";
  assert.throws(() => hydrateDashboard(marketPulse, "en", createMarketViewModel(snapshot)), /stale/);
});

test("a reviewed current edition gets a dated route without publishing orphaned reviews", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-current-brief-"));
  const runs = join(root, "runs");
  const reviews = join(root, "reviews");
  await Promise.all([mkdir(runs), mkdir(reviews)]);
  const snapshot = citedEditionFixture();
  await writeFile(join(reviews, `${snapshot.runId}.json`), JSON.stringify(autoPublishReview(snapshot)));
  const briefs = await loadPublishedBriefs(runs, reviews, snapshot);
  assert.deepEqual(briefs.map((brief) => brief.snapshot.runId), [snapshot.runId]);
  assert.deepEqual(await loadPublishedBriefs(runs, reviews), []);
  snapshot.pages["/"].report.title.en = "Unreviewed change";
  await assert.rejects(loadPublishedBriefs(runs, reviews, snapshot), /matching accepted review/);
});
