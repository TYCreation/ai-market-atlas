import type { MetricRecord } from "./types.ts";

export type MarketSession = {
  timezone: string;
  currency: string;
  closeHour: number;
  closeMinute: number;
};

const MARKET_SESSIONS: Readonly<Record<string, MarketSession>> = {
  US: { timezone: "America/New_York", currency: "USD", closeHour: 16, closeMinute: 0 },
  Taiwan: { timezone: "Asia/Taipei", currency: "TWD", closeHour: 13, closeMinute: 30 },
  Korea: { timezone: "Asia/Seoul", currency: "KRW", closeHour: 15, closeMinute: 30 },
  Europe: { timezone: "Europe/Amsterdam", currency: "EUR", closeHour: 17, closeMinute: 30 },
};

const MARKET_CODES: Readonly<Record<string, string>> = {
  us: "US",
  usa: "US",
  taiwan: "Taiwan",
  tw: "Taiwan",
  korea: "Korea",
  kr: "Korea",
  europe: "Europe",
  eu: "Europe",
};

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

export function canonicalizeMarketCode(value: string): string | undefined {
  return MARKET_CODES[value.trim().toLowerCase()];
}

export function marketSession(market: string | undefined): MarketSession | undefined {
  return market ? MARKET_SESSIONS[market] : undefined;
}

function assertMarketMetadata(metric: MetricRecord): MarketSession | undefined {
  if (!hasMarketMetadata(metric) && !isIndividualStockMetric(metric)) return undefined;
  const session = marketSession(metric.market);
  if (!session || metric.marketTimezone !== session.timezone) {
    throw new Error(`${metric.id} has an invalid market/time-zone label`);
  }
  if (!metric.primaryListing || !metric.securityType) {
    throw new Error(`${metric.id} has incomplete listing metadata`);
  }
  if (metric.securityType === "adr") {
    if (metric.market !== "US" || !/\.[A-Z0-9]{1,4}$/.test(metric.primaryListing)) {
      throw new Error(`${metric.id} has invalid ADR metadata`);
    }
    return session;
  }
  if (metric.securityType !== "primary" && metric.securityType !== "not-applicable") {
    throw new Error(`${metric.id} has invalid listing metadata`);
  }
  if (metric.securityType === "not-applicable") return session;

  const listingPatterns: Record<string, RegExp> = {
    US: /^[A-Z][A-Z0-9.-]*$/,
    Taiwan: /^\d{4}\.TW$/,
    Korea: /^\d{6}\.KS$/,
    Europe: /^[A-Z0-9-]+\.[A-Z]{1,4}$/,
  };
  if (!listingPatterns[metric.market!].test(metric.primaryListing)) {
    throw new Error(`${metric.id} has invalid primary listing metadata`);
  }
  return session;
}

function localTime(timestamp: Date, timezone: string): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return { weekday: get("weekday")!, hour: Number(get("hour")), minute: Number(get("minute")) };
}

function isAtOrAfterClose(timestamp: Date, session: MarketSession): boolean {
  const local = localTime(timestamp, session.timezone);
  if (local.weekday === "Sat" || local.weekday === "Sun") return false;
  return local.hour > session.closeHour || (local.hour === session.closeHour && local.minute >= session.closeMinute);
}

function assertPublishedMarketClose(metric: MetricRecord, session: MarketSession, runStart: Date): void {
  if (metric.kind !== "published" || metric.sessionState !== "closed") return;
  const timestamps = [metric.asOf, ...metric.observations.map((observation) => observation.asOf)];
  if (
    timestamps.some((timestamp) => {
      const observedAt = new Date(timestamp);
      return Number.isNaN(observedAt.getTime()) || observedAt.getTime() >= runStart.getTime() || !isAtOrAfterClose(observedAt, session);
    })
  ) {
    failCompletedSession(metric);
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
  const session = assertMarketMetadata(metric);
  if (session) assertPublishedMarketClose(metric, session, runStart);
  if (isIndividualStockMetric(metric) && /\.(weekReturn|monthReturn)$/.test(metric.id) && metric.unit !== "%") {
    throw new Error(`${metric.id} must use percentage returns for cross-market comparison`);
  }
}
