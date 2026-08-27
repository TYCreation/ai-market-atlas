import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { evaluateMetricFreshness, freshnessPolicyFor } from "../../market-data/freshness.ts";
import { REQUIRED_METRIC_IDS, REQUIRED_STOCK_METRIC_IDS } from "../../market-data/catalog.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const snapshot = candidate as unknown as MarketSnapshot;

test("every required metric has one code-owned policy", () => {
  for (const id of [...REQUIRED_METRIC_IDS, ...REQUIRED_STOCK_METRIC_IDS]) {
    assert.ok(freshnessPolicyFor(id, snapshot.metrics[id].kind));
  }
});

test("weekly Atlas metrics expire after eight days", () => {
  const metric = { ...snapshot.metrics["pulse.power_queue"], asOf: "2026-07-24T01:00:00.000Z" };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T01:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T01:00:01.000Z").state, "stale");
});

test("a Friday US close remains current through Monday", () => {
  const metric = { ...snapshot.metrics["stocks.nvda.price"], asOf: "2026-07-31T20:00:00.000Z" };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-03T20:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-05T20:00:00.000Z").state, "stale");
});

test("a market-close cutoff counts Wednesday only after the New York close", () => {
  const metric = { ...snapshot.metrics["stocks.nvda.price"], asOf: "2026-07-31T20:00:00.000Z" };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-05T13:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-05T20:00:00.000Z").state, "stale");
});

test("stock prices use the market-close policy for dotted listing symbols", () => {
  assert.equal(freshnessPolicyFor("stocks.2330.tw.price", "published").class, "market-close");
});

test("quarterly published metrics take precedence over the general Atlas-model policy", () => {
  const metric = {
    ...snapshot.metrics["pulse.power_queue"],
    id: "compute.amd_data_center_growth",
    kind: "modeled" as const,
    asOf: "2026-04-13T00:00:00.000Z",
  };
  assert.deepEqual(freshnessPolicyFor(metric.id, metric.kind), { class: "periodic", maxAgeHours: 2640 });
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T00:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T00:00:00.001Z").state, "stale");
});

test("known optional published facts remain dated", () => {
  const metric = {
    ...snapshot.metrics["pulse.power_queue"],
    id: "energy.vistra_helix_commitment",
    kind: "published" as const,
    required: false,
    asOf: "2020-01-01T00:00:00.000Z",
  };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T00:00:00.000Z").state, "dated");
});

test("unknown metric ids fail closed", () => {
  assert.throws(() => freshnessPolicyFor("compute.unknown_required_metric", "modeled"), /Unknown metric freshness policy/);
});
