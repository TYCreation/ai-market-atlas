import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import previous from "../fixtures/market/previous-snapshot.json" with { type: "json" };
import { normalizeCandidate, normalizeUnit } from "../../market-data/normalize.ts";
import { assertCompletedSession } from "../../market-data/session.ts";
import type { MarketSnapshot, MetricRecord } from "../../market-data/types.ts";

const runStart = new Date("2026-08-01T01:00:00Z");

function marketMetric(overrides: Partial<MetricRecord>): MetricRecord {
  return {
    ...candidate.metrics["stocks.nvda.price"],
    ...overrides,
  };
}

test("sorts sources and metrics and keeps the prior value", () => {
  const unordered = structuredClone(candidate);
  unordered.metrics["stocks.nvda.price"].sourceIds.reverse();
  const normalized = normalizeCandidate(unordered, previous as MarketSnapshot, runStart);

  assert.equal(normalized.metrics["stocks.nvda.price"].previousNumericValue, 181.25);
  assert.deepEqual(Object.keys(normalized.sources), Object.keys(normalized.sources).sort());
  assert.deepEqual(Object.keys(normalized.metrics), Object.keys(normalized.metrics).sort());
  assert.deepEqual(
    normalized.metrics["stocks.nvda.price"].sourceIds,
    [...unordered.metrics["stocks.nvda.price"].sourceIds].sort(),
  );
});

test("rejects a future or incomplete market session", () => {
  const future = structuredClone(candidate);
  future.metrics["stocks.nvda.price"].asOf = "2026-08-01T20:00:00Z";

  assert.throws(
    () => normalizeCandidate(future, previous as MarketSnapshot, runStart),
    /stocks\.nvda\.price is not a completed session/,
  );
});

test("normalizes comparable units but preserves local-currency prices", () => {
  assert.equal(normalizeUnit(2.8, "trillion-usd", "billion-usd"), 2800);
  assert.throws(
    () => normalizeUnit(2.8, "trillion-usd", "%"),
    /Unsupported unit conversion: trillion-usd to %/,
  );
  const local = structuredClone(candidate);
  const metric = structuredClone(local.metrics["stocks.tsm.price"]);
  metric.id = "stocks.2330.tw.price";
  metric.numericValue = 1035;
  metric.unit = "TWD";
  metric.currency = "TWD";
  metric.market = "Taiwan";
  metric.marketTimezone = "Asia/Taipei";
  metric.primaryListing = "2330.TW";
  metric.securityType = "primary";
  metric.sourceIds = ["atlas-model", "openai-pricing"];
  metric.observations = [
    { sourceId: "atlas-model", numericValue: 1035, asOf: metric.asOf },
    { sourceId: "openai-pricing", numericValue: 1035, asOf: metric.asOf },
  ];
  local.metrics[metric.id] = metric;

  const normalized = normalizeCandidate(local, previous as MarketSnapshot, runStart);
  assert.equal(normalized.metrics["stocks.2330.tw.price"].currency, "TWD");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].primaryListing, "2330.TW");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].numericValue, 1035);
});

test("accepts a prior holiday close but rejects a holiday timestamp from this run", () => {
  const holiday = marketMetric({
    asOf: "2026-07-31T20:00:00.000Z",
    sessionState: "holiday",
  });
  assert.doesNotThrow(() => assertCompletedSession(holiday, runStart));

  const stale = marketMetric({ sessionState: "holiday" });
  assert.throws(
    () => assertCompletedSession(stale, runStart),
    /stocks\.nvda\.price is not a completed session/,
  );
});

test("validates the supported market time-zone and listing metadata", () => {
  const markets: Array<Pick<MetricRecord, "market" | "marketTimezone" | "currency" | "primaryListing">> = [
    { market: "US", marketTimezone: "America/New_York", currency: "USD", primaryListing: "NVDA" },
    { market: "Taiwan", marketTimezone: "Asia/Taipei", currency: "TWD", primaryListing: "2330.TW" },
    { market: "Korea", marketTimezone: "Asia/Seoul", currency: "KRW", primaryListing: "005930.KS" },
    { market: "Europe", marketTimezone: "Europe/Amsterdam", currency: "EUR", primaryListing: "ASML.AS" },
  ];
  for (const metadata of markets) {
    assert.doesNotThrow(() => assertCompletedSession(marketMetric(metadata), runStart));
  }
  assert.throws(
    () => assertCompletedSession(marketMetric({ marketTimezone: "Asia/Taipei" }), runStart),
    /stocks\.nvda\.price has an invalid market\/time-zone label/,
  );
  assert.throws(
    () => assertCompletedSession(marketMetric({ securityType: "adr", primaryListing: "TSM" }), runStart),
    /stocks\.nvda\.price has invalid ADR metadata/,
  );
});

test("requires percentage return units for cross-market stock comparisons", () => {
  assert.doesNotThrow(() =>
    assertCompletedSession(
      marketMetric({ id: "stocks.2330.tw.weekReturn", unit: "%", currency: undefined }),
      runStart,
    ),
  );
  assert.throws(
    () => assertCompletedSession(marketMetric({ id: "stocks.2330.tw.weekReturn", unit: "TWD" }), runStart),
    /stocks\.2330\.tw\.weekReturn must use percentage returns for cross-market comparison/,
  );
});
