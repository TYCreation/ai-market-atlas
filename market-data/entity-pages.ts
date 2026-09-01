import type { PublishedBrief } from "./briefs.ts";
import type { PageSlug, SourceRecord } from "./types.ts";

export const ENTITY_EVIDENCE_FLOOR = {
  datedBriefs: 2,
  sources: 2,
} as const;

type EntityTaxonomyEntry = {
  slug: string;
  metricTokens: readonly string[];
  name: { en: string; zh: string };
};

// This is a vocabulary of retained metric-ID segments, not editorial keywords. It
// makes the eligible entity set reviewable and keeps a page tied to cited data.
const ENTITY_TAXONOMY: readonly EntityTaxonomyEntry[] = [
  { slug: "accelerator", metricTokens: ["accelerator"], name: { en: "AI accelerators", zh: "AI 加速器" } },
  { slug: "agents", metricTokens: ["agents"], name: { en: "AI agents", zh: "AI 代理" } },
  { slug: "amd", metricTokens: ["amd"], name: { en: "AMD", zh: "AMD" } },
  { slug: "announced-power", metricTokens: ["announced", "power"], name: { en: "Announced power", zh: "已公告電力" } },
  { slug: "api", metricTokens: ["api"], name: { en: "APIs", zh: "API" } },
  { slug: "cisco", metricTokens: ["cisco"], name: { en: "Cisco", zh: "Cisco" } },
  { slug: "committed-power", metricTokens: ["committed", "power"], name: { en: "Committed power", zh: "已承諾電力" } },
  { slug: "cooling", metricTokens: ["cooling"], name: { en: "Data-center cooling", zh: "資料中心冷卻" } },
  { slug: "hbm", metricTokens: ["hbm"], name: { en: "HBM", zh: "HBM" } },
  { slug: "inference", metricTokens: ["inference"], name: { en: "Inference", zh: "推論" } },
  { slug: "interconnection", metricTokens: ["interconnection"], name: { en: "Grid interconnection", zh: "電網併網" } },
  { slug: "managed-tokens", metricTokens: ["managed", "tokens"], name: { en: "Managed tokens", zh: "託管權杖" } },
  { slug: "onsemi", metricTokens: ["onsemi"], name: { en: "onsemi", zh: "onsemi" } },
  { slug: "openai", metricTokens: ["openai"], name: { en: "OpenAI", zh: "OpenAI" } },
  { slug: "packaging", metricTokens: ["packaging"], name: { en: "Advanced packaging", zh: "先進封裝" } },
  { slug: "power", metricTokens: ["power"], name: { en: "Data-center power", zh: "資料中心電力" } },
  { slug: "production-agents", metricTokens: ["production", "agents"], name: { en: "Production agents", zh: "生產環境代理" } },
  { slug: "software", metricTokens: ["software"], name: { en: "AI software", zh: "AI 軟體" } },
  { slug: "spend", metricTokens: ["spend"], name: { en: "AI spending", zh: "AI 支出" } },
  { slug: "vertiv", metricTokens: ["vertiv"], name: { en: "Vertiv", zh: "Vertiv" } },
  { slug: "wafer", metricTokens: ["wafer"], name: { en: "SiC wafers", zh: "SiC 晶圓" } },
] as const;

export type EntityEvidenceMetric = {
  date: string;
  id: string;
  page: PageSlug;
  display: { en: string; zh: string };
  asOf: string;
  sourceIds: string[];
};

export type EntityBriefReference = {
  date: string;
  dataCutoff: string;
  pillars: PageSlug[];
};

export type EntityHub = {
  slug: string;
  name: { en: string; zh: string };
  briefs: EntityBriefReference[];
  pillars: PageSlug[];
  metrics: EntityEvidenceMetric[];
  sources: SourceRecord[];
  lastModified: string;
};

export function normalizeEntitySlug(value: string): string | undefined {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : undefined;
}

function reportMetricIds(brief: PublishedBrief, pillar: PageSlug): Set<string> {
  const page = brief.snapshot.pages[pillar];
  return new Set([
    ...page.thesisMetricIds,
    ...(page.report.thesisSurvivalRationale?.metricIds ?? []),
    ...page.report.supportingEvidence.flatMap((evidence) => evidence.metricIds),
    ...page.report.opposingEvidence.flatMap((evidence) => evidence.metricIds),
  ]);
}

function metricMatches(metricId: string, entry: EntityTaxonomyEntry): boolean {
  const parts = metricId.split(/[._]/);
  return entry.metricTokens.every((token) => parts.includes(token));
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function collectEntity(entry: EntityTaxonomyEntry, briefs: PublishedBrief[]): EntityHub | undefined {
  const metrics: EntityEvidenceMetric[] = [];
  const briefReferences: EntityBriefReference[] = [];
  const sourceIds = new Set<string>();
  const pillars = new Set<PageSlug>();

  for (const brief of briefs) {
    const referencedPillars = (Object.keys(brief.snapshot.pages) as PageSlug[]).filter((pillar) => {
      const references = reportMetricIds(brief, pillar);
      return [...references].some((metricId) => metricMatches(metricId, entry));
    });
    if (referencedPillars.length === 0) continue;
    const referencedIds = new Set(referencedPillars.flatMap((pillar) => [...reportMetricIds(brief, pillar)]));
    const citedMetrics = Object.values(brief.snapshot.metrics).filter((metric) =>
      referencedIds.has(metric.id) && metricMatches(metric.id, entry),
    );
    if (citedMetrics.length === 0) continue;
    for (const pillar of referencedPillars) pillars.add(pillar);
    for (const metric of citedMetrics) {
      metrics.push({
        date: brief.date,
        id: metric.id,
        page: metric.page,
        display: metric.display,
        asOf: metric.asOf,
        sourceIds: sortedUnique(metric.sourceIds),
      });
      metric.sourceIds.forEach((sourceId) => sourceIds.add(sourceId));
    }
    briefReferences.push({
      date: brief.date,
      dataCutoff: brief.snapshot.dataCutoff,
      pillars: [...referencedPillars].sort(),
    });
  }

  const sources = [...sourceIds]
    .sort()
    .map((sourceId) => briefs.flatMap((brief) => [brief.snapshot.sources[sourceId]]).find(Boolean))
    .filter((source): source is SourceRecord => source !== undefined);
  if (
    briefReferences.length < ENTITY_EVIDENCE_FLOOR.datedBriefs ||
    sources.length < ENTITY_EVIDENCE_FLOOR.sources
  ) return undefined;
  return {
    slug: entry.slug,
    name: entry.name,
    briefs: briefReferences.sort((left, right) => right.date.localeCompare(left.date)),
    pillars: [...pillars].sort(),
    metrics: metrics.sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id)),
    sources,
    lastModified: briefReferences.reduce(
      (latest, brief) => latest > brief.dataCutoff ? latest : brief.dataCutoff,
      "",
    ),
  };
}

export function extractEntityHubs(briefs: PublishedBrief[]): EntityHub[] {
  return ENTITY_TAXONOMY
    .map((entry) => collectEntity(entry, briefs))
    .filter((entity): entity is EntityHub => entity !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function getEntityHub(entities: EntityHub[], slug: string): EntityHub | undefined {
  const normalized = normalizeEntitySlug(slug);
  return normalized === undefined ? undefined : entities.find((entity) => entity.slug === normalized);
}

export function entityRoutePaths(entities: EntityHub[]): string[] {
  return [
    ...entities.map((entity) => `/entity/${entity.slug}/`),
    ...entities.map((entity) => `/en/entity/${entity.slug}/`),
  ];
}
