import type { MetricRecord } from "./types.ts";

const MARKET_TIMEZONES = new Map([
  ["US", "America/New_York"],
  ["Taiwan", "Asia/Taipei"],
  ["Korea", "Asia/Seoul"],
  ["Europe", "Europe/Amsterdam"],
]);

function failCompletedSession(metric: MetricRecord): never {
  throw new Error(`${metric.id} is not a completed session`);
}

function isIndividualStockMetric(metric: MetricRecord): boolean {
  return /^stocks\..+\.(price|weekReturn|monthReturn)$/.test(metric.id);
}

function hasMarketMetadata(metric: MetricRecord): boolean {
  return [metric.market, metric.marketTimezone, metric.primaryListing, metric.securityType].some(
    (value) => value !== undefined,
  );
}

function assertMarketMetadata(metric: MetricRecord): void {
  if (!hasMarketMetadata(metric) && !isIndividualStockMetric(metric)) return;
  const expectedTimezone = metric.market ? MARKET_TIMEZONES.get(metric.market) : undefined;
  if (!expectedTimezone || metric.marketTimezone !== expectedTimezone) {
    throw new Error(`${metric.id} has an invalid market/time-zone label`);
  }
  if (!metric.primaryListing || !metric.securityType) {
    throw new Error(`${metric.id} has incomplete listing metadata`);
  }
  if (metric.securityType === "adr") {
    if (metric.market !== "US" || !/\.[A-Z0-9]{1,4}$/.test(metric.primaryListing)) {
      throw new Error(`${metric.id} has invalid ADR metadata`);
    }
    return;
  }
  if (metric.securityType !== "primary" && metric.securityType !== "not-applicable") {
    throw new Error(`${metric.id} has invalid listing metadata`);
  }
  if (metric.securityType === "not-applicable") return;

  const listingPatterns: Record<string, RegExp> = {
    US: /^[A-Z][A-Z0-9.-]*$/,
    Taiwan: /^\d{4}\.TW$/,
    Korea: /^\d{6}\.KS$/,
    Europe: /^[A-Z0-9-]+\.[A-Z]{1,4}$/,
  };
  if (!listingPatterns[metric.market!].test(metric.primaryListing)) {
    throw new Error(`${metric.id} has invalid primary listing metadata`);
  }
}

/** Ensures a market observation is publishable at the time this run starts. */
export function assertCompletedSession(metric: MetricRecord, runStart: Date): void {
  const asOf = new Date(metric.asOf);
  if (Number.isNaN(runStart.getTime()) || Number.isNaN(asOf.getTime()) || asOf.getTime() > runStart.getTime()) {
    failCompletedSession(metric);
  }
  if (metric.sessionState === "holiday" && asOf.getTime() >= runStart.getTime()) {
    failCompletedSession(metric);
  }
  assertMarketMetadata(metric);
  if (isIndividualStockMetric(metric) && /\.(weekReturn|monthReturn)$/.test(metric.id) && metric.unit !== "%") {
    throw new Error(`${metric.id} must use percentage returns for cross-market comparison`);
  }
}
