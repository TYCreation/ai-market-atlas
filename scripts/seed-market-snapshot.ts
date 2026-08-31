import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compute, energy, marketPulse, models, sic, stocks, type DashboardConfig } from "../app/content.ts";
import { computeZh, energyZh, marketPulseZh, modelsZh, sicZh, stocksZh } from "../app/content-zh.ts";
import { sourceBundles } from "../app/sources.ts";
import { KPI_CATALOG, stockMetricId } from "../market-data/catalog.ts";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import type { MarketSnapshot, MetricRecord, PageSlug, SourceRecord } from "../market-data/types.ts";
import currentSnapshotJson from "../data/market/current.json" with { type: "json" };

const currentSnapshot = currentSnapshotJson as MarketSnapshot;

const dashboards: Record<PageSlug, DashboardConfig> = { "/": marketPulse, "/stocks": stocks, "/compute": compute, "/energy": energy, "/models": models, "/sic": sic };
const chineseDashboards: Record<PageSlug, DashboardConfig> = { "/": marketPulseZh, "/stocks": stocksZh, "/compute": computeZh, "/energy": energyZh, "/models": modelsZh, "/sic": sicZh };

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function timestampFor(runId: string): string {
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(runId)?.[1];
  if (!date) throw new Error("run ID must begin with YYYY-MM-DD");
  return `${date}T01:00:00.000Z`;
}

const MONTHS = new Map([
  ["january", "01"], ["february", "02"], ["march", "03"], ["april", "04"],
  ["may", "05"], ["june", "06"], ["july", "07"], ["august", "08"],
  ["september", "09"], ["october", "10"], ["november", "11"], ["december", "12"],
]);

// A source without a day is stored at the first instant of its stated ISO period.
function sourcePublishedAt(published: string, retrievedAt: string): string {
  if (/\b(live|continuously maintained)\b/i.test(published)) return retrievedAt;
  const exact = /^(\w+) (\d{1,2}), (\d{4})$/.exec(published);
  if (exact) {
    const month = MONTHS.get(exact[1].toLowerCase());
    if (!month) throw new Error(`Unsupported source month: ${published}`);
    return `${exact[3]}-${month}-${exact[2].padStart(2, "0")}T00:00:00.000Z`;
  }
  const monthPeriod = /(?:^|\bUpdated\s+)(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/i.exec(published);
  if (monthPeriod) return `${monthPeriod[2]}-${MONTHS.get(monthPeriod[1].toLowerCase())}-01T00:00:00.000Z`;
  if (/^\d{4}$/.test(published)) return `${published}-01-01T00:00:00.000Z`;
  throw new Error(`Unsupported source publication period: ${published}`);
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

function report(english: DashboardConfig, chinese: DashboardConfig, thesisMetricIds: string[], comparisonMetric: MetricRecord, timestamp: string) {
  const field = (name: "eyebrow" | "title" | "summary" | "signal") => ({ en: english[name], zh: chinese[name] });
  return {
    eyebrow: field("eyebrow"), title: field("title"), summary: field("summary"), signal: field("signal"),
    thesis: { title: { en: english.thesis.title, zh: chinese.thesis.title }, body: { en: english.thesis.body, zh: chinese.thesis.body }, tags: { en: english.thesis.tags, zh: chinese.thesis.tags } },
    thesisSurvivalRationale: {
      text: {
        en: "New supporting and opposing evidence leaves the thesis intact because its central mechanism still holds.",
        zh: "新的支持與反向證據仍未動搖核心機制，因此本期論點維持不變。",
      },
      metricIds: [thesisMetricIds[0]],
    },
    supportingEvidence: [], opposingEvidence: [], catalysts: [],
    analystNotes: english.watchlist.map((item, index) => ({ en: item.body, zh: chinese.watchlist[index]?.body ?? item.body })),
    risks: english.watchlist.map((item, index) => ({
      condition: {
        en: `The thesis weakens if: ${item.body}`,
        zh: `若出現以下情況，論點將被削弱：${chinese.watchlist[index]?.body ?? item.body}`,
      },
      by: timestamp,
      comparison: {
        metricId: comparisonMetric.id,
        operator: ">=" as const,
        value: comparisonMetric.numericValue,
        unit: comparisonMetric.unit,
        ...(comparisonMetric.currency ? { currency: comparisonMetric.currency } : {}),
      },
      consequence: {
        en: "The thesis weakens if this comparison fails.",
        zh: "若此比較未成立，論點將被削弱。",
      },
    })),
    nextObservations: english.watchlist.map((item, index) => ({
      what: { en: item.owner, zh: chinese.watchlist[index]?.owner ?? item.owner },
      by: timestamp,
      threshold: {
        en: "A material miss versus this reading would weaken the thesis.",
        zh: "若此讀值明顯不及預期，將削弱論點。",
      },
      comparison: {
        metricId: comparisonMetric.id,
        operator: ">=" as const,
        value: comparisonMetric.numericValue,
        unit: comparisonMetric.unit,
        ...(comparisonMetric.currency ? { currency: comparisonMetric.currency } : {}),
      },
      consequence: {
        en: "The thesis weakens if this comparison fails.",
        zh: "若此比較未成立，論點將被削弱。",
      },
    })),
  };
}

function createSnapshot(runId: string): MarketSnapshot {
  const timestamp = timestampFor(runId);
  const sources: Record<string, SourceRecord> = Object.fromEntries(Object.values(sourceBundles).flatMap((bundle) => bundle.sources).map((source) => [source.id, {
    id: source.id, kind: source.kind, publisher: source.publisher, title: source.title,
    ...(source.url ? { url: source.url } : {}), publishedAt: sourcePublishedAt(source.published, timestamp), retrievedAt: timestamp, scope: source.scope,
  }]));
  const metrics: Record<string, MetricRecord> = {};
  for (const [page, index, id, unit] of KPI_CATALOG) {
    metrics[id] = modeledMetric(id, page, dashboards[page].kpis[index].value, chineseDashboards[page].kpis[index].value, unit, sourceBundles[page].kpiSources[index], timestamp);
  }
  for (const equity of stocks.equityDive?.equities ?? []) {
    for (const [field, unit] of [["price", "USD"], ["weekReturn", "%"], ["monthReturn", "%"]] as const) {
      const id = stockMetricId(equity.ticker, field);
      const currentMetric = currentSnapshot.metrics[id];
      if (!currentMetric) throw new Error(`Current snapshot is missing seed metric ${id}`);
      metrics[id] = modeledMetric(
        id,
        "/stocks",
        currentMetric.display.en,
        currentMetric.display.zh,
        unit,
        ["atlas-model"],
        timestamp,
      );
      Object.assign(metrics[id], { market: "US", marketTimezone: "America/New_York", primaryListing: equity.ticker, securityType: "primary" });
    }
  }
  const pages = {} as MarketSnapshot["pages"];
  for (const page of Object.keys(dashboards) as PageSlug[]) {
    const thesisMetricIds = KPI_CATALOG.filter((entry) => entry[0] === page).map((entry) => entry[2]);
    pages[page] = { changed: false, changeReasons: [], verifiedAt: timestamp, thesisStance: "neutral", previousThesisStance: "neutral", thesisMetricIds, report: report(dashboards[page], chineseDashboards[page], thesisMetricIds, metrics[thesisMetricIds[0]], timestamp) };
  }
  return { schemaVersion: 1, runId, cadence: runId.endsWith("wednesday") ? "wednesday" : runId.endsWith("month-end") ? "month-end" : "saturday", generatedAt: timestamp, dataCutoff: timestamp, pages, sources, metrics, keySignalIds: KPI_CATALOG.map((entry) => entry[2]) };
}

const output = resolve(option("--output", "data/market/current.json"));
const snapshot = createSnapshot(option("--run-id", "2026-07-25-saturday"));
assertMarketSnapshot(snapshot);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log("Seeded 24 required KPIs plus equity metrics");
