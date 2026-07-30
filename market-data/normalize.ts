import { KPI_CATALOG } from "./catalog.ts";
import { assertMarketSnapshot } from "./schema.ts";
import { assertCompletedSession, canonicalizeMarketCode, marketSession } from "./session.ts";
import type { MarketSnapshot, MetricRecord, PageState, SourceRecord } from "./types.ts";

const UNIT_CONVERSIONS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "billion-usd": { "billion-usd": 1, "$B": 1, "trillion-usd": 0.001, "$T": 0.001 },
  "$B": { "billion-usd": 1, "$B": 1, "trillion-usd": 0.001, "$T": 0.001 },
  "trillion-usd": { "billion-usd": 1000, "$B": 1000, "trillion-usd": 1, "$T": 1 },
  "$T": { "billion-usd": 1000, "$B": 1000, "trillion-usd": 1, "$T": 1 },
  percent: { percent: 1, "%": 1 },
  "%": { percent: 1, "%": 1 },
  decimal: { decimal: 1, fraction: 1, percent: 100, "%": 100 },
  fraction: { decimal: 1, fraction: 1, percent: 100, "%": 100 },
  gigawatt: { gigawatt: 1, GW: 1, megawatt: 1000, MW: 1000, terawatt: 0.001, TW: 0.001 },
  GW: { gigawatt: 1, GW: 1, megawatt: 1000, MW: 1000, terawatt: 0.001, TW: 0.001 },
  megawatt: { gigawatt: 0.001, GW: 0.001, megawatt: 1, MW: 1, terawatt: 0.000001, TW: 0.000001 },
  MW: { gigawatt: 0.001, GW: 0.001, megawatt: 1, MW: 1, terawatt: 0.000001, TW: 0.000001 },
  terawatt: { gigawatt: 1000, GW: 1000, megawatt: 1_000_000, MW: 1_000_000, terawatt: 1, TW: 1 },
  TW: { gigawatt: 1000, GW: 1000, megawatt: 1_000_000, MW: 1_000_000, terawatt: 1, TW: 1 },
  "trillion-tokens": { "trillion-tokens": 1, "T tokens": 1, "billion-tokens": 1000, "B tokens": 1000 },
  "T tokens": { "trillion-tokens": 1, "T tokens": 1, "billion-tokens": 1000, "B tokens": 1000 },
  "billion-tokens": { "trillion-tokens": 0.001, "T tokens": 0.001, "billion-tokens": 1, "B tokens": 1 },
  "B tokens": { "trillion-tokens": 0.001, "T tokens": 0.001, "billion-tokens": 1, "B tokens": 1 },
  USD: { USD: 1, "US$": 1 },
  "US$": { USD: 1, "US$": 1 },
  TWD: { TWD: 1, "NT$": 1 },
  "NT$": { TWD: 1, "NT$": 1 },
  KRW: { KRW: 1 },
  EUR: { EUR: 1, "€": 1 },
  "€": { EUR: 1, "€": 1 },
};

const CATALOG_UNITS = new Map<string, string>(KPI_CATALOG.map(([, , id, unit]) => [id, unit]));
const CURRENCY_ALIASES: Readonly<Record<string, string>> = {
  usd: "USD",
  "us$": "USD",
  twd: "TWD",
  "nt$": "TWD",
  krw: "KRW",
  eur: "EUR",
  "€": "EUR",
};
const UNIT_CURRENCIES: Readonly<Record<string, string>> = {
  "$B": "USD",
  USD: "USD",
  TWD: "TWD",
  KRW: "KRW",
  EUR: "EUR",
};

function canonicalIso(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

function isIndividualStockMetric(metric: MetricRecord): boolean {
  return /^stocks\..+\.(price|weekReturn|monthReturn)$/.test(metric.id);
}

function canonicalCurrency(currency: string): string | undefined {
  return CURRENCY_ALIASES[currency.trim().toLowerCase()];
}

function canonicalTargetUnit(metric: MetricRecord, market: string | undefined): string | undefined {
  const catalogUnit = CATALOG_UNITS.get(metric.id);
  if (catalogUnit) return catalogUnit;
  if (/\.(weekReturn|monthReturn)$/.test(metric.id)) return "%";
  if (/\.price$/.test(metric.id)) return marketSession(market)?.currency;
  return undefined;
}

function normalizeMetric(metric: MetricRecord): MetricRecord {
  const market = metric.market === undefined ? undefined : canonicalizeMarketCode(metric.market);
  if (metric.market !== undefined && !market) {
    throw new Error(`${metric.id} has an invalid market/time-zone label`);
  }
  const targetUnit = canonicalTargetUnit(metric, market);
  let numericValue = metric.numericValue;
  if (targetUnit && metric.unit !== targetUnit) {
    try {
      numericValue = normalizeUnit(metric.numericValue, metric.unit, targetUnit);
    } catch {
      throw new Error(`${metric.id} has an incompatible unit ${metric.unit}; expected ${targetUnit}`);
    }
  }
  const session = marketSession(market);
  const isPrice = isIndividualStockMetric(metric) && metric.id.endsWith(".price");
  let currency = metric.currency === undefined ? undefined : canonicalCurrency(metric.currency);
  if (metric.currency !== undefined && !currency) {
    throw new Error(`${metric.id} has a currency mismatch`);
  }
  if (isPrice && session) {
    if (currency !== undefined && currency !== session.currency) {
      throw new Error(`${metric.id} has a currency mismatch`);
    }
    currency = session.currency;
  }
  const unitCurrency = UNIT_CURRENCIES[targetUnit ?? metric.unit];
  if (unitCurrency && currency !== undefined && currency !== unitCurrency) {
    throw new Error(`${metric.id} has a currency mismatch`);
  }
  if (isIndividualStockMetric(metric) && !isPrice && currency !== undefined) {
    throw new Error(`${metric.id} has a currency mismatch`);
  }
  return {
    ...metric,
    numericValue,
    unit: targetUnit ?? metric.unit,
    currency,
    market,
    asOf: canonicalIso(metric.asOf),
    sourceIds: [...metric.sourceIds].sort(),
    observations: metric.observations.map((observation) => ({ ...observation, asOf: canonicalIso(observation.asOf) })),
  };
}

function normalizeSource(source: SourceRecord): SourceRecord {
  return { ...source, publishedAt: canonicalIso(source.publishedAt), retrievedAt: canonicalIso(source.retrievedAt) };
}

function normalizePage(page: PageState): PageState {
  return { ...page, verifiedAt: canonicalIso(page.verifiedAt) };
}

function assertHolidayCarryForward(metric: MetricRecord, previous: MarketSnapshot): void {
  if (metric.sessionState !== "holiday") return;
  const prior = previous.metrics[metric.id];
  if (
    !prior ||
    prior.status !== "verified" ||
    canonicalIso(prior.asOf) !== metric.asOf ||
    prior.numericValue !== metric.numericValue
  ) {
    throw new Error(`${metric.id} holiday session must retain the prior verified metric`);
  }
}

/** Converts between explicitly-supported report units without guessing a dimension. */
export function normalizeUnit(value: number, from: string, to: string): number {
  const factor = UNIT_CONVERSIONS[from]?.[to];
  if (factor === undefined) {
    throw new Error(`Unsupported unit conversion: ${from} to ${to}`);
  }
  return value * factor;
}

export function normalizeCandidate(
  candidate: MarketSnapshot,
  previous: MarketSnapshot,
  now: Date,
): MarketSnapshot {
  assertMarketSnapshot(candidate);
  const metrics = Object.fromEntries(
    Object.entries(candidate.metrics)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, metric]) => {
        const normalized = normalizeMetric(metric);
        assertHolidayCarryForward(normalized, previous);
        assertCompletedSession(normalized, now);
        return [id, { ...normalized, previousNumericValue: previous.metrics[id]?.numericValue }];
      }),
  );
  return {
    ...candidate,
    generatedAt: canonicalIso(candidate.generatedAt),
    dataCutoff: canonicalIso(candidate.dataCutoff),
    pages: Object.fromEntries(Object.entries(candidate.pages).map(([slug, page]) => [slug, normalizePage(page)])) as MarketSnapshot["pages"],
    sources: Object.fromEntries(
      Object.entries(candidate.sources)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, source]) => [id, normalizeSource(source)]),
    ),
    metrics,
  };
}
