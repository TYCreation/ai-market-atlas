import { readFile, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import currentSnapshotJson from "#market-snapshot" with { type: "json" };
import { KPI_CATALOG, stockMetricId, type StockMetricField } from "./catalog.ts";
import { evaluateMetricFreshness } from "./freshness.ts";
import { assertMarketSnapshot } from "./schema.ts";
import type {
  Locale,
  MarketSnapshot,
  MetricRecord,
  MetricStatus,
  PageReport,
  PageSlug,
  RunCadence,
} from "./types.ts";

export type LocalizedPageReport = {
  eyebrow: string;
  title: string;
  summary: string;
  signal: string;
  thesis: { title: string; body: string; tags: string[] };
  supportingEvidence: Array<{ text: string; metricIds: string[] }>;
  opposingEvidence: Array<{ text: string; metricIds: string[] }>;
  catalysts: string[];
  risks: string[];
  nextObservations: string[];
};

export type MetricView = {
  metricId: string;
  value: string;
  sourceIds: string[];
  kind: "published-fact" | "market-observation" | "atlas-model";
  freshness: "current" | "dated";
  asOf: string;
  direction: "up" | "down" | "flat" | "not-applicable";
};

export type KpiView = MetricView;

export type SourceReference = {
  id: string;
  kind: "official" | "company" | "research" | "pricing" | "market" | "atlas";
  publisher: string;
  title: string;
  url?: string;
  published: string;
  scope: Record<Locale, string>;
};

export type SourceBundle = {
  reviewed: string;
  sources: SourceReference[];
  kpiSources: string[][];
};

export type EditionMeta = {
  runId: string;
  cadence: RunCadence;
  cadenceLabel: string;
  dataCutoff: string;
  generatedAt: string;
};

const PAGE_SLUGS: PageSlug[] = ["/", "/stocks", "/compute", "/energy", "/models", "/sic"];
const cadenceLabels: Record<RunCadence, Record<Locale, string>> = {
  wednesday: { en: "Wednesday update", zh: "週三更新" },
  saturday: { en: "Saturday update", zh: "週六更新" },
  "month-end": { en: "Month-end update", zh: "月底更新" },
};

function validateSnapshot(value: unknown): MarketSnapshot {
  assertMarketSnapshot(value);
  return value;
}

const currentSnapshot = validateSnapshot(currentSnapshotJson);

function localizeReport(report: PageReport, locale: Locale): LocalizedPageReport {
  return {
    eyebrow: report.eyebrow[locale],
    title: report.title[locale],
    summary: report.summary[locale],
    signal: report.signal[locale],
    thesis: {
      title: report.thesis.title[locale],
      body: report.thesis.body[locale],
      tags: report.thesis.tags[locale],
    },
    supportingEvidence: report.supportingEvidence.map((evidence) => ({
      text: evidence.text[locale],
      metricIds: evidence.metricIds,
    })),
    opposingEvidence: report.opposingEvidence.map((evidence) => ({
      text: evidence.text[locale],
      metricIds: evidence.metricIds,
    })),
    catalysts: report.catalysts.map((item) => item[locale]),
    risks: report.risks.map((item) => item[locale]),
    nextObservations: report.nextObservations.map((item) => item[locale]),
  };
}

function metricKind(metricKind: MetricRecord["kind"], policyClass: string): MetricView["kind"] {
  if (policyClass === "market-close") return "market-observation";
  if (metricKind === "modeled") return "atlas-model";
  return "published-fact";
}

function metricView(snapshot: MarketSnapshot, metricId: string, locale: Locale): MetricView | undefined {
  const metric = snapshot.metrics[metricId];
  if (!metric) throw new Error(`Snapshot is missing metric ${metricId}`);

  const freshness = evaluateMetricFreshness(metric, snapshot.dataCutoff);
  if (freshness.state === "stale") {
    if (metric.required) {
      throw new Error(
        `Required metric is stale and cannot be rendered: ${metric.id} (${freshness.policy.class} policy)`,
      );
    }
    return undefined;
  }

  const direction = metric.previousNumericValue === undefined
    ? "not-applicable"
    : metric.numericValue > metric.previousNumericValue
      ? "up"
      : metric.numericValue < metric.previousNumericValue
        ? "down"
        : "flat";
  return {
    metricId: metric.id,
    value: metric.display[locale],
    sourceIds: [...metric.sourceIds],
    kind: metricKind(metric.kind, freshness.policy.class),
    freshness: freshness.state === "dated" ? "dated" : "current",
    asOf: metric.asOf,
    direction,
  };
}

function kpiFor(snapshot: MarketSnapshot, slug: PageSlug, index: number, locale: Locale): KpiView {
  const catalog = KPI_CATALOG.find(
    ([page, kpiIndex]) => page === slug && kpiIndex === index,
  );
  if (!catalog) throw new Error(`No KPI mapping for ${slug} index ${index}`);
  const view = metricView(snapshot, catalog[2], locale);
  if (!view) throw new Error(`Required KPI metric is stale: ${catalog[2]}`);
  return view;
}

export function buildSourceBundles(snapshot: MarketSnapshot): Record<PageSlug, SourceBundle> {
  return Object.fromEntries(
    PAGE_SLUGS.map((slug) => {
      const kpiSources = KPI_CATALOG
        .filter(([page]) => page === slug)
        .map(([, , metricId]) => [...snapshot.metrics[metricId].sourceIds]);
      const referencedIds = new Set(
        Object.values(snapshot.metrics)
          .filter((metric) => metric.page === slug)
          .flatMap((metric) => metric.sourceIds),
      );
      const sources = Object.values(snapshot.sources)
        .filter((source) => referencedIds.has(source.id))
        .map((source) => ({
          id: source.id,
          kind: source.kind,
          publisher: source.publisher,
          title: source.title,
          ...(source.url ? { url: source.url } : {}),
          published: source.publishedAt,
          scope: source.scope,
        }));
      const reviewed = snapshot.pages[slug].verifiedAt;
      return [slug, { reviewed, sources, kpiSources }];
    }),
  ) as Record<PageSlug, SourceBundle>;
}

export function createMarketViewModel(snapshot: MarketSnapshot) {
  const sourceBundles = buildSourceBundles(snapshot);
  return {
    snapshot,
    sourceBundles,
    getKpi(slug: PageSlug, index: number, locale: Locale) {
      return kpiFor(snapshot, slug, index, locale);
    },
    getMetric(metricId: string, locale: Locale): MetricView | undefined {
      return metricView(snapshot, metricId, locale);
    },
    getStockMetric(ticker: string, field: StockMetricField, locale: Locale): MetricView | undefined {
      const metricId = stockMetricId(ticker, field);
      return metricView(snapshot, metricId, locale);
    },
    getMetricStatus(metricId: string): MetricStatus {
      const metric = snapshot.metrics[metricId];
      if (!metric) throw new Error(`Snapshot is missing metric ${metricId}`);
      return metric.status;
    },
    getPageReport(slug: PageSlug, locale: Locale) {
      return localizeReport(snapshot.pages[slug].report, locale);
    },
    getPageMeta(slug: PageSlug, locale: Locale) {
      const page = snapshot.pages[slug];
      return {
        changed: page.changed,
        changeLabel: page.changed
          ? locale === "zh"
            ? "本期已更新"
            : "Updated this edition"
          : locale === "zh"
            ? "本期無重大變化"
            : "No material change",
        verifiedAt: page.verifiedAt,
        report: localizeReport(page.report, locale),
      };
    },
    getEditionMeta(locale: Locale): EditionMeta {
      return {
        runId: snapshot.runId,
        cadence: snapshot.cadence,
        cadenceLabel: cadenceLabels[snapshot.cadence][locale],
        dataCutoff: snapshot.dataCutoff,
        generatedAt: snapshot.generatedAt,
      };
    },
  };
}

const defaultViewModel = createMarketViewModel(currentSnapshot);

export const getKpi = defaultViewModel.getKpi;
export const getMetric = defaultViewModel.getMetric;
export const getPageMeta = defaultViewModel.getPageMeta;
export const getPageReport = defaultViewModel.getPageReport;
export const getEditionMeta = defaultViewModel.getEditionMeta;

export async function resolveMarketSnapshotPath(explicitPath?: string) {
  const requestedPath = resolve(
    explicitPath ?? new URL("../data/market/current.json", import.meta.url).pathname,
  );
  const canonicalPath = await realpath(requestedPath);
  const details = await stat(canonicalPath);
  if (!details.isFile()) throw new Error(`Market snapshot path is not a regular file: ${requestedPath}`);
  return canonicalPath;
}

export async function loadMarketSnapshot(explicitPath?: string) {
  if (!explicitPath) return currentSnapshot;
  const canonicalPath = await resolveMarketSnapshotPath(explicitPath);
  const value: unknown = JSON.parse(await readFile(canonicalPath, "utf8"));
  return validateSnapshot(value);
}

export async function loadMarketViewModel() {
  return createMarketViewModel(currentSnapshot);
}
