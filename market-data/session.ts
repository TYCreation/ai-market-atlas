import type { MetricRecord } from "./types.ts";

export type MarketSession = {
  timezone: string;
  currency: string;
  closeHour: number;
  closeMinute: number;
};

export type ExchangeCalendar = {
  holidays: ReadonlySet<string>;
  earlyCloses: Readonly<Record<string, Pick<MarketSession, "closeHour" | "closeMinute">>>;
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

// The publication pipeline intentionally supports only calendars that have been
// reviewed and checked into code. Adding a market or year requires adding its
// exchange holidays and early closes here; unknown coverage fails closed below.
// Verified 2026-08-28 against primary calendars: NYSE
// (https://www.nyse.com/trade/hours-calendars), TWSE
// (https://www.twse.com.tw/holidaySchedule/holidaySchedule?queryYear=112&response=html),
// KRX (https://global.krx.co.kr/contents/GLB/06/0602/0602020204/GLB0602020204T1.jsp),
// and Euronext Amsterdam (https://www.euronext.com/en/trading/trading-hours-holidays).
export const EXCHANGE_SESSION_CALENDARS: Readonly<Record<string, Readonly<Record<number, ExchangeCalendar>>>> = {
  US: {
    2026: {
      holidays: new Set([
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
        "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
      ]),
      earlyCloses: {
        "2026-11-27": { closeHour: 13, closeMinute: 0 },
        "2026-12-24": { closeHour: 13, closeMinute: 0 },
      },
    },
  },
  Taiwan: {
    2026: {
      holidays: new Set([
        "2026-01-01", "2026-02-12", "2026-02-13", "2026-02-16", "2026-02-17",
        "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-27", "2026-04-03",
        "2026-04-06", "2026-05-01", "2026-06-19", "2026-09-25", "2026-09-28",
        "2026-10-09", "2026-10-26", "2026-12-25",
      ]),
      earlyCloses: {},
    },
  },
  Korea: {
    2026: {
      holidays: new Set([
        "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-02",
        "2026-05-01", "2026-05-05", "2026-05-25", "2026-06-03", "2026-08-17",
        "2026-07-17", "2026-09-24", "2026-09-25", "2026-10-05", "2026-10-09",
        "2026-12-25", "2026-12-31",
      ]),
      earlyCloses: {},
    },
  },
  Europe: {
    2026: {
      holidays: new Set([
        "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-25",
      ]),
      earlyCloses: {
        "2026-12-24": { closeHour: 14, closeMinute: 5 },
        "2026-12-31": { closeHour: 14, closeMinute: 5 },
      },
    },
  },
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

export function exchangeCalendarFor(market: string | undefined, year: number): ExchangeCalendar {
  const calendars = market === undefined ? undefined : EXCHANGE_SESSION_CALENDARS[market];
  const calendar = calendars?.[year];
  if (!calendar) {
    if (!calendars) throw new Error(`Unsupported exchange calendar: ${market ?? "missing market"}`);
    throw new Error(`Unsupported ${market} exchange calendar year: ${year}`);
  }
  return calendar;
}

export function exchangeCloseFor(market: string, localDate: string): Pick<MarketSession, "closeHour" | "closeMinute"> {
  const calendar = exchangeCalendarFor(market, Number(localDate.slice(0, 4)));
  const session = marketSession(market);
  if (!session) throw new Error(`Unsupported exchange calendar: ${market}`);
  return calendar.earlyCloses[localDate] ?? session;
}

export function isExchangeClosed(market: string, localDate: string): boolean {
  const calendar = exchangeCalendarFor(market, Number(localDate.slice(0, 4)));
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6 || calendar.holidays.has(localDate);
}

function localDate(timestamp: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assertMarketMetadata(metric: MetricRecord): MarketSession | undefined {
  if (!hasMarketMetadata(metric) && metric.kind === "modeled") return undefined;
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

function isAtOrAfterClose(timestamp: Date, market: string, session: MarketSession): boolean {
  const local = localTime(timestamp, session.timezone);
  if (local.weekday === "Sat" || local.weekday === "Sun") return false;
  const date = localDate(timestamp, session.timezone);
  if (isExchangeClosed(market, date)) return false;
  const close = exchangeCloseFor(market, date);
  return local.hour > close.closeHour || (local.hour === close.closeHour && local.minute >= close.closeMinute);
}

function assertPublishedMarketClose(metric: MetricRecord, session: MarketSession, runStart: Date): void {
  if (metric.kind !== "published") return;
  const timestamps = [metric.asOf, ...metric.observations.map((observation) => observation.asOf)];
  if (
    timestamps.some((timestamp) => {
      const observedAt = new Date(timestamp);
      if (Number.isNaN(observedAt.getTime())) return true;
      const date = localDate(observedAt, session.timezone);
      // Resolve the calendar even for holiday carry-forward records so an
      // unsupported market year can never pass through normalization silently.
      exchangeCalendarFor(metric.market!, Number(date.slice(0, 4)));
      if (metric.sessionState !== "closed") return false;
      return observedAt.getTime() >= runStart.getTime() || !isAtOrAfterClose(observedAt, metric.market!, session);
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
  if (metric.kind === "published" && hasMarketMetadata(metric) && metric.sessionState === undefined) {
    failCompletedSession(metric);
  }
  const session = assertMarketMetadata(metric);
  if (session) assertPublishedMarketClose(metric, session, runStart);
  if (isIndividualStockMetric(metric) && /\.(weekReturn|monthReturn)$/.test(metric.id) && metric.unit !== "%") {
    throw new Error(`${metric.id} must use percentage returns for cross-market comparison`);
  }
}
