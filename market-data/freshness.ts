import {
  EVENT_DRIVEN_PUBLISHED_METRIC_IDS,
  QUARTERLY_PUBLISHED_METRIC_IDS,
  REQUIRED_METRIC_IDS,
  REQUIRED_STOCK_METRIC_IDS,
} from "./catalog.ts";
import { marketSession } from "./session.ts";
import type { MetricKind, MetricRecord } from "./types.ts";

export type FreshnessPolicy =
  | { class: "market-close"; maxCompletedTradingDays: 2; stagnationEditions: 3 }
  | { class: "weekly"; maxAgeHours: 192; stagnationEditions: 3 }
  | { class: "periodic"; maxAgeHours: number }
  | { class: "event-driven" }
  | { class: "atlas-model"; maxAgeHours: 192; stagnationEditions: 3 };

export type FreshnessState = {
  state: "current" | "stale" | "dated";
  ageHours: number;
  policy: FreshnessPolicy;
};

const MARKET_CLOSE_POLICY = { class: "market-close", maxCompletedTradingDays: 2, stagnationEditions: 3 } as const;
const ATLAS_MODEL_POLICY = { class: "atlas-model", maxAgeHours: 192, stagnationEditions: 3 } as const;
const PERIODIC_POLICY = { class: "periodic", maxAgeHours: 24 * 110 } as const;
const EVENT_DRIVEN_POLICY = { class: "event-driven" } as const;

type ExchangeCalendar = {
  holidays: ReadonlySet<string>;
  earlyCloses: Readonly<Record<string, { closeHour: number; closeMinute: number }>>;
};

// The publication pipeline intentionally supports only calendars that have been
// reviewed and checked into code. Adding a market or year requires adding its
// exchange holidays and early closes here; unknown coverage fails closed below.
// Verified 2026-08-28 against primary calendars: NYSE
// (https://www.nyse.com/trade/hours-calendars), TWSE
// (https://www.twse.com.tw/holidaySchedule/holidaySchedule?queryYear=112&response=html),
// KRX (https://global.krx.co.kr/contents/GLB/06/0602/0602020204/GLB0602020204T1.jsp),
// and Euronext Amsterdam (https://www.euronext.com/en/trading/trading-hours-holidays).
const EXCHANGE_CALENDARS: Readonly<Record<string, Readonly<Record<number, ExchangeCalendar>>>> = {
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
        "2026-10-09",
        "2026-10-26", "2026-12-25",
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

function isStockPriceOrReturn(metricId: string): boolean {
  return /^stocks\..+\.(?:price|weekReturn|monthReturn)$/.test(metricId);
}

export function freshnessPolicyFor(metricId: string, _metricKind: MetricKind): FreshnessPolicy {
  if (QUARTERLY_PUBLISHED_METRIC_IDS.has(metricId)) return PERIODIC_POLICY;
  if (REQUIRED_STOCK_METRIC_IDS.has(metricId) || isStockPriceOrReturn(metricId)) return MARKET_CLOSE_POLICY;
  if (REQUIRED_METRIC_IDS.has(metricId)) return ATLAS_MODEL_POLICY;
  if (EVENT_DRIVEN_PUBLISHED_METRIC_IDS.has(metricId)) return EVENT_DRIVEN_POLICY;
  throw new Error(`Unknown metric freshness policy: ${metricId}`);
}

function calendarDate(timestamp: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function localTime(timestamp: Date, timeZone: string): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return { weekday: get("weekday")!, hour: Number(get("hour")), minute: Number(get("minute")) };
}

function isAtOrAfterClose(timestamp: Date, timeZone: string, closeHour: number, closeMinute: number): boolean {
  const local = localTime(timestamp, timeZone);
  return local.hour > closeHour || (local.hour === closeHour && local.minute >= closeMinute);
}

function exchangeCalendarFor(market: string | undefined, year: number): ExchangeCalendar {
  const calendars = market === undefined ? undefined : EXCHANGE_CALENDARS[market];
  const calendar = calendars?.[year];
  if (!calendar) {
    if (!calendars) throw new Error(`Unsupported exchange calendar: ${market ?? "missing market"}`);
    throw new Error(`Unsupported ${market} exchange calendar year: ${year}`);
  }
  return calendar;
}

function dateKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function closeTimeFor(market: string, day: Date, session: { closeHour: number; closeMinute: number }): {
  closeHour: number;
  closeMinute: number;
} {
  const calendar = exchangeCalendarFor(market, day.getUTCFullYear());
  return calendar.earlyCloses[dateKey(day)] ?? session;
}

function completedTradingDays(metric: MetricRecord, asOf: Date, dataCutoff: Date): number {
  // Historical modeled stock estimates intentionally omit quote furniture. They
  // retain the stock metric's US session cadence, while published observations
  // must declare an exchange and matching local time zone explicitly.
  const market = metric.market ?? (metric.kind === "modeled" ? "US" : undefined);
  const session = marketSession(market);
  const timeZone = metric.marketTimezone ?? session?.timezone;
  if (!session || timeZone === undefined || (metric.marketTimezone !== undefined && metric.marketTimezone !== session.timezone)) {
    throw new Error(`Unsupported exchange calendar or time-zone for ${market ?? "missing market"}`);
  }

  const firstDay = calendarDate(asOf, timeZone);
  const cutoffDay = calendarDate(dataCutoff, timeZone);
  // A publication cutoff before the local close cannot consume that day's
  // session. The session close is exchange-local and DST-safe via Intl.
  const cutoffClose = closeTimeFor(market, cutoffDay, session);
  if (!isAtOrAfterClose(dataCutoff, timeZone, cutoffClose.closeHour, cutoffClose.closeMinute)) {
    cutoffDay.setUTCDate(cutoffDay.getUTCDate() - 1);
  }
  for (const year of new Set([firstDay.getUTCFullYear(), cutoffDay.getUTCFullYear()])) {
    exchangeCalendarFor(market, year);
  }
  if (cutoffDay < firstDay) return 0;

  let completedDays = 0;
  for (firstDay.setUTCDate(firstDay.getUTCDate() + 1); firstDay <= cutoffDay; firstDay.setUTCDate(firstDay.getUTCDate() + 1)) {
    const dayOfWeek = firstDay.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (!exchangeCalendarFor(market, firstDay.getUTCFullYear()).holidays.has(dateKey(firstDay))) {
      completedDays += 1;
    }
  }
  return completedDays;
}

export function evaluateMetricFreshness(metric: MetricRecord, dataCutoff: string): FreshnessState {
  const asOf = new Date(metric.asOf);
  const cutoff = new Date(dataCutoff);
  const ageHours = (cutoff.getTime() - asOf.getTime()) / (60 * 60 * 1000);
  const policy = freshnessPolicyFor(metric.id, metric.kind);

  if (policy.class === "event-driven") return { state: "dated", ageHours, policy };
  if (policy.class === "market-close") {
    return {
      state: completedTradingDays(metric, asOf, cutoff) <= policy.maxCompletedTradingDays ? "current" : "stale",
      ageHours,
      policy,
    };
  }
  return {
    state: ageHours <= policy.maxAgeHours ? "current" : "stale",
    ageHours,
    policy,
  };
}
