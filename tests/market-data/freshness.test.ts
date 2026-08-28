import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { evaluateMetricFreshness, freshnessPolicyFor } from "../../market-data/freshness.ts";
import { REQUIRED_METRIC_IDS, REQUIRED_STOCK_METRIC_IDS } from "../../market-data/catalog.ts";
import type { MarketSnapshot, MetricRecord } from "../../market-data/types.ts";

const snapshot = candidate as unknown as MarketSnapshot;

function marketCloseMetric(
  market: string,
  marketTimezone: string,
  asOf: string,
  id = "stocks.foreign.price",
): MetricRecord {
  return {
    ...structuredClone(snapshot.metrics["stocks.nvda.price"]),
    id,
    kind: "published",
    market,
    marketTimezone,
    primaryListing: market === "Taiwan"
      ? "2330.TW"
      : market === "Korea"
        ? "005930.KS"
        : market === "Europe"
          ? "ASML.AS"
          : "NVDA",
    securityType: "primary",
    sessionState: "closed",
    asOf,
  };
}

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

test("US Labor Day does not consume a completed-session allowance", () => {
  const metric = marketCloseMetric(
    "US",
    "America/New_York",
    "2026-09-04T20:00:00.000Z",
    "stocks.nvda.price",
  );

  assert.equal(evaluateMetricFreshness(metric, "2026-09-09T20:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-09-10T20:00:00.000Z").state, "stale");
});

test("Taiwan Lunar New Year and Taipei close are exchange-local boundaries", () => {
  const metric = marketCloseMetric("Taiwan", "Asia/Taipei", "2026-02-11T05:30:00.000Z");

  assert.equal(evaluateMetricFreshness(metric, "2026-02-23T05:29:59.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-02-25T05:29:59.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-02-25T05:30:00.000Z").state, "stale");
});

test("every supported exchange counts the cutoff date only at its local close", () => {
  const cases = [
    ["US", "America/New_York", "2026-08-03T20:00:00.000Z", "2026-08-06T19:59:59.000Z", "2026-08-06T20:00:00.000Z"],
    ["Taiwan", "Asia/Taipei", "2026-08-03T05:30:00.000Z", "2026-08-06T05:29:59.000Z", "2026-08-06T05:30:00.000Z"],
    ["Korea", "Asia/Seoul", "2026-08-03T06:30:00.000Z", "2026-08-06T06:29:59.000Z", "2026-08-06T06:30:00.000Z"],
    ["Europe", "Europe/Amsterdam", "2026-08-03T15:30:00.000Z", "2026-08-06T15:29:59.000Z", "2026-08-06T15:30:00.000Z"],
  ] as const;

  for (const [market, timezone, asOf, beforeClose, atClose] of cases) {
    const metric = marketCloseMetric(market, timezone, asOf);
    assert.equal(evaluateMetricFreshness(metric, beforeClose).state, "current", market);
    assert.equal(evaluateMetricFreshness(metric, atClose).state, "stale", market);
  }
});

test("Korea and Europe holidays do not count as completed sessions", () => {
  const korea = marketCloseMetric("Korea", "Asia/Seoul", "2026-04-30T06:30:00.000Z");
  assert.equal(evaluateMetricFreshness(korea, "2026-05-05T06:30:00.000Z").state, "current");

  const europe = marketCloseMetric("Europe", "Europe/Amsterdam", "2026-04-02T15:30:00.000Z");
  assert.equal(evaluateMetricFreshness(europe, "2026-04-08T15:30:00.000Z").state, "current");
});

test("market-close freshness fails closed without a supported calendar", () => {
  const unsupportedMarket = marketCloseMetric("Japan", "Asia/Tokyo", "2026-08-03T06:00:00.000Z");
  assert.throws(
    () => evaluateMetricFreshness(unsupportedMarket, "2026-08-06T06:00:00.000Z"),
    /Unsupported exchange calendar.*Japan/,
  );
  const unsupportedYear = marketCloseMetric("US", "America/New_York", "2027-08-02T20:00:00.000Z");
  assert.throws(
    () => evaluateMetricFreshness(unsupportedYear, "2027-08-05T20:00:00.000Z"),
    /Unsupported US exchange calendar year: 2027/,
  );
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
