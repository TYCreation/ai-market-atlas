import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import previous from "../fixtures/market/previous-snapshot.json" with { type: "json" };
import { normalizeCandidate, normalizeUnit } from "../../market-data/normalize.ts";
import { assertCompletedSession } from "../../market-data/session.ts";
import type { MarketSnapshot, MetricRecord } from "../../market-data/types.ts";

const runStart = new Date("2026-08-01T01:00:00Z");
const validCandidate = candidate as unknown as MarketSnapshot;
const previousSnapshot = previous as unknown as MarketSnapshot;

function marketMetric(overrides: Partial<MetricRecord>): MetricRecord {
  return {
    ...validCandidate.metrics["stocks.nvda.price"],
    ...overrides,
  };
}

test("sorts sources and metrics and keeps the prior value", () => {
  const unordered = structuredClone(validCandidate);
  unordered.metrics["stocks.nvda.price"].sourceIds.reverse();
  unordered.metrics["stocks.nvda.price"].asOf = "2026-08-01T01:00:00Z";
  const normalized = normalizeCandidate(unordered, previousSnapshot, runStart);

  assert.equal(normalized.metrics["stocks.nvda.price"].previousNumericValue, 181.25);
  assert.equal(normalized.metrics["stocks.nvda.price"].asOf, "2026-08-01T01:00:00.000Z");
  assert.deepEqual(Object.keys(normalized.sources), Object.keys(normalized.sources).sort());
  assert.deepEqual(Object.keys(normalized.metrics), Object.keys(normalized.metrics).sort());
  assert.deepEqual(
    normalized.metrics["stocks.nvda.price"].sourceIds,
    [...unordered.metrics["stocks.nvda.price"].sourceIds].sort(),
  );
});

test("rejects a future or incomplete market session", () => {
  const future = structuredClone(validCandidate);
  future.metrics["stocks.nvda.price"].asOf = "2026-08-01T20:00:00Z";

  assert.throws(
    () => normalizeCandidate(future, previousSnapshot, runStart),
    /stocks\.nvda\.price is not a completed session/,
  );
});

test("normalizes comparable units but preserves local-currency prices", () => {
  assert.equal(normalizeUnit(2.8, "trillion-usd", "billion-usd"), 2800);
  assert.throws(
    () => normalizeUnit(2.8, "trillion-usd", "%"),
    /Unsupported unit conversion: trillion-usd to %/,
  );
  const local = structuredClone(validCandidate);
  const metric = structuredClone(local.metrics["stocks.tsm.price"]);
  metric.id = "stocks.2330.tw.price";
  metric.numericValue = 1035;
  metric.unit = "TWD";
  metric.currency = "TWD";
  metric.market = "tw";
  metric.marketTimezone = "Asia/Taipei";
  metric.primaryListing = "2330.TW";
  metric.securityType = "primary";
  metric.sourceIds = ["atlas-model", "openai-pricing"];
  metric.observations = [
    { sourceId: "atlas-model", numericValue: 1035, asOf: metric.asOf },
    { sourceId: "openai-pricing", numericValue: 1035, asOf: metric.asOf },
  ];
  local.metrics[metric.id] = metric;

  const normalized = normalizeCandidate(local, previousSnapshot, runStart);
  assert.equal(normalized.metrics["stocks.2330.tw.price"].market, "Taiwan");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].currency, "TWD");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].primaryListing, "2330.TW");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].numericValue, 1035);
});

test("carries a holiday metric forward only from the prior verified value", () => {
  const holiday = structuredClone(validCandidate);
  Object.assign(holiday.metrics["stocks.nvda.price"], {
    numericValue: 181.25,
    asOf: "2026-07-31T20:00:00.000Z",
    sessionState: "holiday",
  });
  const normalized = normalizeCandidate(holiday, previousSnapshot, runStart);
  assert.equal(normalized.metrics["stocks.nvda.price"].numericValue, 181.25);
  assert.equal(normalized.metrics["stocks.nvda.price"].asOf, "2026-07-31T20:00:00.000Z");

  assert.throws(
    () => normalizeCandidate(holiday, { metrics: {} } as MarketSnapshot, runStart),
    /stocks\.nvda\.price holiday session must retain the prior verified metric/,
  );
  const unverifiedPrevious = structuredClone(previousSnapshot);
  unverifiedPrevious.metrics["stocks.nvda.price"].status = "waiting";
  assert.throws(
    () => normalizeCandidate(holiday, unverifiedPrevious, runStart),
    /stocks\.nvda\.price holiday session must retain the prior verified metric/,
  );
  const changedValue = structuredClone(holiday);
  changedValue.metrics["stocks.nvda.price"].numericValue = 181.26;
  assert.throws(
    () => normalizeCandidate(changedValue, previousSnapshot, runStart),
    /stocks\.nvda\.price holiday session must retain the prior verified metric/,
  );
  const changedAsOf = structuredClone(holiday);
  changedAsOf.metrics["stocks.nvda.price"].asOf = "2026-07-30T20:00:00.000Z";
  assert.throws(
    () => normalizeCandidate(changedAsOf, previousSnapshot, runStart),
    /stocks\.nvda\.price holiday session must retain the prior verified metric/,
  );
});

test("rejects intraday published closes for each supported market", () => {
  const sessions = [
    {
      market: "US",
      marketTimezone: "America/New_York",
      currency: "USD",
      primaryListing: "NVDA",
      close: "2026-07-31T20:00:00.000Z",
      intraday: "2026-07-31T19:59:00.000Z",
    },
    {
      market: "Taiwan",
      marketTimezone: "Asia/Taipei",
      currency: "TWD",
      primaryListing: "2330.TW",
      close: "2026-07-31T05:30:00.000Z",
      intraday: "2026-07-31T05:29:00.000Z",
    },
    {
      market: "Korea",
      marketTimezone: "Asia/Seoul",
      currency: "KRW",
      primaryListing: "005930.KS",
      close: "2026-07-31T06:30:00.000Z",
      intraday: "2026-07-31T06:29:00.000Z",
    },
    {
      market: "Europe",
      marketTimezone: "Europe/Amsterdam",
      currency: "EUR",
      primaryListing: "ASML.AS",
      close: "2026-07-31T15:30:00.000Z",
      intraday: "2026-07-31T15:29:00.000Z",
    },
  ];
  for (const session of sessions) {
    const closed = marketMetric({
      ...session,
      kind: "published",
      asOf: session.close,
      observations: [{ sourceId: "atlas-model", numericValue: 1, asOf: session.close }],
    });
    assert.doesNotThrow(() => assertCompletedSession(closed, runStart));
    const intraday = { ...closed, asOf: session.intraday, observations: [{ ...closed.observations[0], asOf: session.intraday }] };
    assert.throws(
      () => assertCompletedSession(intraday, runStart),
      new RegExp(`${closed.id} is not a completed session`),
    );
    const unpublishedObservation = {
      ...closed,
      observations: [{ ...closed.observations[0], asOf: runStart.toISOString() }],
    };
    assert.throws(
      () => assertCompletedSession(unpublishedObservation, runStart),
      new RegExp(`${closed.id} is not a completed session`),
    );
  }
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

test("canonicalizes catalog unit aliases and rejects currency and unit mismatches", () => {
  const alias = structuredClone(validCandidate);
  alias.metrics["pulse.infrastructure_spend"].unit = "trillion-usd";
  alias.metrics["pulse.infrastructure_spend"].numericValue = 2.8;
  for (const observation of alias.metrics["pulse.infrastructure_spend"].observations) {
    observation.numericValue = 2.8;
  }
  alias.metrics["compute.accelerator_pool"].currency = "US$";
  const normalized = normalizeCandidate(alias, previousSnapshot, runStart);
  assert.equal(normalized.metrics["pulse.infrastructure_spend"].unit, "$B");
  assert.equal(normalized.metrics["pulse.infrastructure_spend"].numericValue, 2800);
  assert.deepEqual(
    normalized.metrics["pulse.infrastructure_spend"].observations.map((observation) => observation.numericValue),
    [2800, 2800],
  );
  assert.deepEqual(
    normalized.metrics["compute.accelerator_pool"].observations,
    alias.metrics["compute.accelerator_pool"].observations,
  );
  assert.equal(normalized.metrics["compute.accelerator_pool"].currency, "USD");
  assert.equal(normalized.metrics["stocks.nvda.price"].currency, "USD");

  const wrongCurrency = structuredClone(validCandidate);
  wrongCurrency.metrics["stocks.nvda.price"].currency = "TWD";
  assert.throws(
    () => normalizeCandidate(wrongCurrency, previousSnapshot, runStart),
    /stocks\.nvda\.price has a currency mismatch/,
  );
  const wrongCatalogCurrency = structuredClone(validCandidate);
  wrongCatalogCurrency.metrics["pulse.infrastructure_spend"].currency = "TWD";
  assert.throws(
    () => normalizeCandidate(wrongCatalogCurrency, previousSnapshot, runStart),
    /pulse\.infrastructure_spend has a currency mismatch/,
  );
  const wrongUnit = structuredClone(validCandidate);
  wrongUnit.metrics["pulse.infrastructure_spend"].unit = "GW";
  assert.throws(
    () => normalizeCandidate(wrongUnit, previousSnapshot, runStart),
    /pulse\.infrastructure_spend has an incompatible unit/,
  );
});
