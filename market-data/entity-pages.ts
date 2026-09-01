import type { PublishedBrief } from "./briefs.ts";
import type { PageSlug, SourceRecord } from "./types.ts";

export const ENTITY_EVIDENCE_FLOOR = {
  datedBriefs: 2,
  sourceReferences: 2,
} as const;

// Source names are prose-like identifiers.  These tokens describe the
// document, its period, or the connective grammar around a name; they are not
// a vocabulary of disallowed entities.  Everything else is eligible evidence.
const SOURCE_BOILERPLATE_TOKENS = new Set([
  "a",
  "an",
  "and",
  "announcement",
  "announcements",
  "at",
  "earnings",
  "filing",
  "filed",
  "form",
  "for",
  "from",
  "globenewswire",
  "in",
  "investor",
  "month",
  "months",
  "news",
  "newswire",
  "of",
  "on",
  "or",
  "press",
  "pr",
  "q1",
  "q2",
  "q3",
  "q4",
  "quarter",
  "release",
  "relations",
  "report",
  "results",
  "the",
  "to",
  "update",
  "updates",
  "via",
  "week",
  "weeks",
  "year",
  "years",
]);

// These tokens are measurement fields only when they occur at the end of a
// metric field.  They remain valid source-derived names and valid interior
// metric tokens (for example, "liquid-cooling"), rather than global bans.
const METRIC_MEASUREMENT_SUFFIXES = new Set([
  "b",
  "capacity",
  "change",
  "commitment",
  "count",
  "demand",
  "efficiency",
  "growth",
  "gw",
  "mm",
  "orders",
  "overhead",
  "pe",
  "penetration",
  "pool",
  "price",
  "queue",
  "return",
  "revenue",
  "share",
  "tokens",
  "usd",
  "value",
  "watts",
  "weeks",
  "years",
]);

const SOURCE_ID_CHANNEL_SUFFIXES = new Set(["gnw", "prn", "sec"]);

const ENTITY_ALIAS_NORMALIZATION = new Map<string, string>([
  ["advanced-micro-devices", "amd"],
  ["advanced-micro-devices-inc", "amd"],
  ["sharon", "sharon-ai"],
  ["sharon-ai", "sharon-ai"],
  ["stm", "stmicroelectronics"],
  ["tsm", "tsmc"],
  ["vrt", "vertiv"],
  ["vertiv-holdings-co", "vertiv"],
]);

const ENTITY_LABEL_OVERRIDES: Record<string, { en: string; zh: string }> = {
  accelerator: { en: "AI accelerators", zh: "AI 加速器" },
  agents: { en: "AI agents", zh: "AI 代理" },
  amd: { en: "AMD", zh: "AMD" },
  "announced-power": { en: "Announced power", zh: "已公告電力" },
  api: { en: "APIs", zh: "API" },
  broadcom: { en: "Broadcom", zh: "Broadcom" },
  cisco: { en: "Cisco", zh: "Cisco" },
  "committed-power": { en: "Committed power", zh: "已承諾電力" },
  cooling: { en: "Data-center cooling", zh: "資料中心冷卻" },
  hbm: { en: "HBM", zh: "HBM" },
  inference: { en: "Inference", zh: "推論" },
  infineon: { en: "Infineon", zh: "Infineon" },
  interconnection: { en: "Grid interconnection", zh: "電網併網" },
  "managed-tokens": { en: "Managed tokens", zh: "託管權杖" },
  nvidia: { en: "NVIDIA", zh: "NVIDIA" },
  onsemi: { en: "onsemi", zh: "onsemi" },
  openai: { en: "OpenAI", zh: "OpenAI" },
  packaging: { en: "Advanced packaging", zh: "先進封裝" },
  power: { en: "Data-center power", zh: "資料中心電力" },
  "production-agents": { en: "Production agents", zh: "生產環境代理" },
  "sharon-ai": { en: "Sharon AI", zh: "Sharon AI" },
  software: { en: "AI software", zh: "AI 軟體" },
  spend: { en: "AI spending", zh: "AI 支出" },
  stmicroelectronics: { en: "STMicroelectronics", zh: "STMicroelectronics" },
  tsmc: { en: "TSMC", zh: "TSMC" },
  vertiv: { en: "Vertiv", zh: "Vertiv" },
  vistra: { en: "Vistra", zh: "Vistra" },
  wafer: { en: "SiC wafers", zh: "SiC 晶圓" },
  wolfspeed: { en: "Wolfspeed", zh: "Wolfspeed" },
};

type EntityCandidateChannel =
  | "metric-token"
  | "metric-compound"
  | "source-id"
  | "source-publisher";

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

export type EligibleEntityRecord = {
  slug: string;
  name: { en: string; zh: string };
  briefs: EntityBriefReference[];
  pillars: PageSlug[];
  metrics: EntityEvidenceMetric[];
  sources: SourceRecord[];
  lastModified: string;
  sourceReferenceCount: number;
};

export type EntityHub = Omit<EligibleEntityRecord, "sourceReferenceCount">;

type CandidateAccumulator = {
  slug: string;
  briefs: Map<string, { date: string; dataCutoff: string; pillars: Set<PageSlug> }>;
  pillars: Set<PageSlug>;
  metrics: Map<string, EntityEvidenceMetric>;
  sourceIds: Set<string>;
  sourceReferenceKeys: Set<string>;
  channels: Set<EntityCandidateChannel>;
  observedNames: Map<string, number>;
};

function reportMetricIds(brief: PublishedBrief, pillar: PageSlug): Set<string> {
  const page = brief.snapshot.pages[pillar];
  return new Set([
    ...page.thesisMetricIds,
    ...(page.report.thesisSurvivalRationale?.metricIds ?? []),
    ...page.report.supportingEvidence.flatMap((evidence) => evidence.metricIds),
    ...page.report.opposingEvidence.flatMap((evidence) => evidence.metricIds),
  ]);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isNumericBoilerplateToken(token: string): boolean {
  return /^\d/.test(token) || /^fy\d+$/.test(token);
}

function isSourceBoilerplateToken(token: string): boolean {
  return isNumericBoilerplateToken(token) || SOURCE_BOILERPLATE_TOKENS.has(token) || /^fy$/.test(token);
}

function tokenizeEntityText(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeCandidateTokens(tokens: string[]): string | undefined {
  if (tokens.length === 0 || new Set(tokens).size !== tokens.length) return undefined;
  if (tokens.some(isNumericBoilerplateToken)) return undefined;
  const phrase = tokens.join("-");
  const alias = ENTITY_ALIAS_NORMALIZATION.get(phrase);
  if (alias !== undefined) return alias;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(phrase)) return undefined;
  return phrase;
}

function formatTitleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function metricFieldTokens(metricId: string): string[] {
  const [, ...fieldSegments] = metricId.split(".");
  const tokens = fieldSegments
    .flatMap((segment) => segment.split("_"))
    .filter(Boolean)
    .filter((token) => !isNumericBoilerplateToken(token) && !/^q[1-4]$/.test(token));
  while (tokens.length > 0 && METRIC_MEASUREMENT_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens;
}

function metricEntityCandidates(metricId: string): Array<{ slug: string; channel: Extract<EntityCandidateChannel, "metric-token" | "metric-compound"> }> {
  const tokens = metricFieldTokens(metricId);
  const candidates = new Map<string, Extract<EntityCandidateChannel, "metric-token" | "metric-compound">>();
  for (const token of tokens) {
    const slug = normalizeCandidateTokens([token]);
    if (slug !== undefined && !candidates.has(slug)) candidates.set(slug, "metric-token");
  }
  if (tokens.length > 1) {
    const slug = normalizeCandidateTokens(tokens);
    if (slug !== undefined) candidates.set(slug, "metric-compound");
  }
  return [...candidates.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([slug, channel]) => ({ slug, channel }));
}

function sourceLeadingCandidate(
  rawValue: string,
  channel: Extract<EntityCandidateChannel, "source-id" | "source-publisher">,
): { slug: string; channel: typeof channel; observedName?: string } | undefined {
  const tokens = tokenizeEntityText(rawValue).filter((token) => !isSourceBoilerplateToken(token));
  if (channel === "source-id" && SOURCE_ID_CHANNEL_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }
  const slug = normalizeCandidateTokens(tokens);
  return slug === undefined ? undefined : { slug, channel, observedName: rawValue.trim() || undefined };
}

function sourceEntityCandidates(
  sourceId: string,
  source: SourceRecord,
): Array<{ slug: string; channel: Extract<EntityCandidateChannel, "source-id" | "source-publisher">; observedName?: string }> {
  return [
    sourceLeadingCandidate(sourceId, "source-id"),
    sourceLeadingCandidate(source.publisher, "source-publisher"),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined);
}

function entityName(slug: string, observedNames: Map<string, number>): { en: string; zh: string } {
  const override = ENTITY_LABEL_OVERRIDES[slug];
  if (override !== undefined) return override;
  const observed = [...observedNames.entries()]
    .sort((left, right) =>
      right[1] - left[1] ||
      left[0].length - right[0].length ||
      left[0].localeCompare(right[0]),
    )[0]?.[0];
  const en = observed ?? formatTitleCase(slug.replace(/-/g, " "));
  return { en, zh: en };
}

function accumulator(slug: string): CandidateAccumulator {
  return {
    slug,
    briefs: new Map(),
    pillars: new Set(),
    metrics: new Map(),
    sourceIds: new Set(),
    sourceReferenceKeys: new Set(),
    channels: new Set(),
    observedNames: new Map(),
  };
}

function observeName(record: CandidateAccumulator, observedName?: string): void {
  if (!observedName) return;
  record.observedNames.set(observedName, (record.observedNames.get(observedName) ?? 0) + 1);
}

function recordObservation(
  record: CandidateAccumulator,
  brief: PublishedBrief,
  pillar: PageSlug,
  metricId: string,
  relevantSourceIds: string[],
  channel: EntityCandidateChannel,
  observedName?: string,
): void {
  record.channels.add(channel);
  observeName(record, observedName);
  const briefRecord = record.briefs.get(brief.date) ?? {
    date: brief.date,
    dataCutoff: brief.snapshot.dataCutoff,
    pillars: new Set<PageSlug>(),
  };
  briefRecord.pillars.add(pillar);
  record.briefs.set(brief.date, briefRecord);
  record.pillars.add(pillar);
  const metric = brief.snapshot.metrics[metricId];
  const metricKey = `${brief.date}:${metricId}`;
  const priorMetric = record.metrics.get(metricKey);
  record.metrics.set(metricKey, {
    date: brief.date,
    id: metric.id,
    page: metric.page,
    display: metric.display,
    asOf: metric.asOf,
    sourceIds: sortedUnique([...(priorMetric?.sourceIds ?? []), ...relevantSourceIds]),
  });
  for (const sourceId of relevantSourceIds) {
    record.sourceIds.add(sourceId);
    record.sourceReferenceKeys.add(`${brief.date}:${pillar}:${metricId}:${sourceId}`);
  }
}

function keepEligible(record: CandidateAccumulator): boolean {
  if (
    record.briefs.size < ENTITY_EVIDENCE_FLOOR.datedBriefs ||
    record.sourceReferenceKeys.size < ENTITY_EVIDENCE_FLOOR.sourceReferences
  ) return false;
  const hasMetricEvidence = record.channels.has("metric-token") || record.channels.has("metric-compound");
  if (hasMetricEvidence) return true;
  return record.channels.has("source-id") || record.channels.has("source-publisher");
}

function sourceLookup(briefs: PublishedBrief[]): Map<string, SourceRecord> {
  const lookup = new Map<string, SourceRecord>();
  for (const brief of briefs) {
    for (const [sourceId, source] of Object.entries(brief.snapshot.sources)) {
      if (!lookup.has(sourceId)) lookup.set(sourceId, source);
    }
  }
  return lookup;
}

export function normalizeEntitySlug(value: string): string | undefined {
  if (value.includes("/")) return undefined;
  const tokens = tokenizeEntityText(value);
  if (tokens.some(isSourceBoilerplateToken)) return undefined;
  return normalizeCandidateTokens(tokens);
}

export function discoverEligibleEntityRecords(briefs: PublishedBrief[]): EligibleEntityRecord[] {
  const sourceRecords = sourceLookup(briefs);
  const candidates = new Map<string, CandidateAccumulator>();

  for (const brief of briefs) {
    for (const pillar of Object.keys(brief.snapshot.pages) as PageSlug[]) {
      for (const metricId of reportMetricIds(brief, pillar)) {
        const metric = brief.snapshot.metrics[metricId];
        const metricSlugs = metricEntityCandidates(metricId);
        const sourceSpecific = new Map<string, { sourceIds: Set<string>; channels: Set<EntityCandidateChannel>; observedNames: Set<string> }>();
        for (const sourceId of metric.sourceIds) {
          const source = brief.snapshot.sources[sourceId];
          for (const candidate of sourceEntityCandidates(sourceId, source)) {
            const entry = sourceSpecific.get(candidate.slug) ?? {
              sourceIds: new Set<string>(),
              channels: new Set<EntityCandidateChannel>(),
              observedNames: new Set<string>(),
            };
            entry.sourceIds.add(sourceId);
            entry.channels.add(candidate.channel);
            if (candidate.observedName !== undefined) entry.observedNames.add(candidate.observedName);
            sourceSpecific.set(candidate.slug, entry);
          }
        }
        for (const candidate of metricSlugs) {
          const record = candidates.get(candidate.slug) ?? accumulator(candidate.slug);
          const specific = sourceSpecific.get(candidate.slug);
          recordObservation(
            record,
            brief,
            pillar,
            metricId,
            sortedUnique([...(specific?.sourceIds ?? new Set(metric.sourceIds))]),
            candidate.channel,
            [...(specific?.observedNames ?? [])][0],
          );
          candidates.set(candidate.slug, record);
        }
        for (const [slug, specific] of sourceSpecific) {
          const record = candidates.get(slug) ?? accumulator(slug);
          for (const channel of specific.channels) {
            recordObservation(
              record,
              brief,
              pillar,
              metricId,
              sortedUnique([...specific.sourceIds]),
              channel,
              [...specific.observedNames][0],
            );
          }
          candidates.set(slug, record);
        }
      }
    }
  }

  return [...candidates.values()]
    .filter(keepEligible)
    .map((record) => {
      const sources = [...record.sourceIds]
        .sort()
        .map((sourceId) => sourceRecords.get(sourceId))
        .filter((source): source is SourceRecord => source !== undefined);
      const briefs = [...record.briefs.values()]
        .map((brief) => ({
          date: brief.date,
          dataCutoff: brief.dataCutoff,
          pillars: [...brief.pillars].sort(),
        }))
        .sort((left, right) => right.date.localeCompare(left.date));
      return {
        slug: record.slug,
        name: entityName(record.slug, record.observedNames),
        briefs,
        pillars: [...record.pillars].sort(),
        metrics: [...record.metrics.values()].sort(
          (left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
        ),
        sources,
        lastModified: briefs.reduce(
          (latest, brief) => latest > brief.dataCutoff ? latest : brief.dataCutoff,
          "",
        ),
        sourceReferenceCount: record.sourceReferenceKeys.size,
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function extractEntityHubs(briefs: PublishedBrief[]): EntityHub[] {
  return discoverEligibleEntityRecords(briefs).map(({ sourceReferenceCount: _sourceReferenceCount, ...entity }) => entity);
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
