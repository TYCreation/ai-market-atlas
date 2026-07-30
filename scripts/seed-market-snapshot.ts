import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compute, energy, marketPulse, models, sic, stocks, type DashboardConfig } from "../app/content.ts";
import { computeZh, energyZh, marketPulseZh, modelsZh, sicZh, stocksZh } from "../app/content-zh.ts";
import { sourceBundles } from "../app/sources.ts";
import { KPI_CATALOG, stockMetricId } from "../market-data/catalog.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import type { MarketSnapshot, MetricRecord, PageSlug, SourceRecord } from "../market-data/types.ts";

const dashboards: Record<PageSlug, DashboardConfig> = { "/": marketPulse, "/stocks": stocks, "/compute": compute, "/energy": energy, "/models": models, "/sic": sic };
const chineseDashboards: Record<PageSlug, DashboardConfig> = { "/": marketPulseZh, "/stocks": stocksZh, "/compute": computeZh, "/energy": energyZh, "/models": modelsZh, "/sic": sicZh };

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function timestampFor(runId: string): string {
  return `${/^(\d{4}-\d{2}-\d{2})/.exec(runId)?.[1] ?? "2026-07-30"}T08:00:00.000Z`;
}

function numericValue(display: string): number {
  const normalized = display.replaceAll(",", "").replace("−", "-");
  const match = /[-+]?\d+(?:\.\d+)?/.exec(normalized);
  if (!match) return 0;
  return /\dT\b/.test(normalized) ? Number(match[0]) * 1_000 : Number(match[0]);
}

function modeledMetric(id: string, page: PageSlug, value: string, valueZh: string, unit: string, sourceIds: string[], timestamp: string): MetricRecord {
  const numeric = numericValue(value);
  return {
    id, page, required: true, kind: "modeled", numericValue: numeric,
    display: { en: value, zh: valueZh }, unit,
    ...(unit.startsWith("$") ? { currency: "USD" } : {}),
    asOf: timestamp, sessionState: "closed", sourceIds,
    observations: sourceIds.map((sourceId) => ({ sourceId, numericValue: numeric, asOf: timestamp })),
    confidence: "medium", status: "verified",
  };
}

function report(english: DashboardConfig, chinese: DashboardConfig) {
  const field = (name: "eyebrow" | "title" | "summary" | "signal") => ({ en: english[name], zh: chinese[name] });
  return {
    eyebrow: field("eyebrow"), title: field("title"), summary: field("summary"), signal: field("signal"),
    thesis: { title: { en: english.thesis.title, zh: chinese.thesis.title }, body: { en: english.thesis.body, zh: chinese.thesis.body }, tags: { en: english.thesis.tags, zh: chinese.thesis.tags } },
    supportingEvidence: [], opposingEvidence: [], catalysts: [],
    risks: english.watchlist.map((item, index) => ({ en: item.body, zh: chinese.watchlist[index]?.body ?? item.body })),
    nextObservations: english.watchlist.map((item, index) => ({ en: item.owner, zh: chinese.watchlist[index]?.owner ?? item.owner })),
  };
}

function createSnapshot(runId: string): MarketSnapshot {
  const timestamp = timestampFor(runId);
  const sources: Record<string, SourceRecord> = Object.fromEntries(Object.values(sourceBundles).flatMap((bundle) => bundle.sources).map((source) => [source.id, {
    id: source.id, kind: source.kind, publisher: source.publisher, title: source.title,
    ...(source.url ? { url: source.url } : {}), publishedAt: timestamp, retrievedAt: timestamp, scope: source.scope,
  }]));
  const metrics: Record<string, MetricRecord> = {};
  for (const [page, index, id, unit] of KPI_CATALOG) {
    metrics[id] = modeledMetric(id, page, dashboards[page].kpis[index].value, chineseDashboards[page].kpis[index].value, unit, sourceBundles[page].kpiSources[index], timestamp);
  }
  for (const equity of stocks.equityDive?.equities ?? []) {
    for (const [field, value, unit] of [["price", equity.price, "USD"], ["weekReturn", equity.week, "%"], ["monthReturn", equity.month, "%"]] as const) {
      const id = stockMetricId(equity.ticker, field);
      metrics[id] = modeledMetric(id, "/stocks", value, value, unit, ["atlas-model"], timestamp);
      Object.assign(metrics[id], { market: "US", marketTimezone: "America/New_York", primaryListing: equity.ticker, securityType: "primary" });
    }
  }
  const pages = {} as MarketSnapshot["pages"];
  for (const page of Object.keys(dashboards) as PageSlug[]) {
    pages[page] = { changed: false, changeReasons: [], verifiedAt: timestamp, thesisStance: "neutral", previousThesisStance: "neutral", thesisMetricIds: KPI_CATALOG.filter((entry) => entry[0] === page).map((entry) => entry[2]), report: report(dashboards[page], chineseDashboards[page]) };
  }
  return { schemaVersion: 1, runId, cadence: runId.endsWith("wednesday") ? "wednesday" : runId.endsWith("month-end") ? "month-end" : "saturday", generatedAt: timestamp, dataCutoff: timestamp, pages, sources, metrics, keySignalIds: KPI_CATALOG.map((entry) => entry[2]) };
}

const output = resolve(option("--output", "data/market/current.json"));
const snapshot = createSnapshot(option("--run-id", "2026-07-30-seed"));
assertMarketSnapshot(snapshot);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log("Seeded 24 required KPIs plus equity metrics");
