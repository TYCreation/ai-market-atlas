import {
  EVENT_DRIVEN_PUBLISHED_METRIC_IDS,
  QUARTERLY_PUBLISHED_METRIC_IDS,
  REQUIRED_METRIC_IDS,
  REQUIRED_STOCK_METRIC_IDS,
} from "./catalog.ts";
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

function newYorkCalendarDate(timestamp: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function completedUsTradingWeekdays(asOf: Date, dataCutoff: Date): number {
  const firstDay = newYorkCalendarDate(asOf);
  const cutoffDay = newYorkCalendarDate(dataCutoff);
  if (cutoffDay < firstDay) return 0;

  let completedDays = 0;
  for (firstDay.setUTCDate(firstDay.getUTCDate() + 1); firstDay <= cutoffDay; firstDay.setUTCDate(firstDay.getUTCDate() + 1)) {
    const dayOfWeek = firstDay.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) completedDays += 1;
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
      state: completedUsTradingWeekdays(asOf, cutoff) <= policy.maxCompletedTradingDays ? "current" : "stale",
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
