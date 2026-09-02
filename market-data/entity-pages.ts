import type { PublishedBrief } from "./briefs.ts";
import type { PageSlug, SourceRecord } from "./types.ts";

export const ENTITY_EVIDENCE_FLOOR = {
  datedBriefs: 2,
  canonicalSources: 1,
  distinctMetrics: 1,
} as const;

export const ENTITY_SELECTION_LIMIT = 24;

// This incomplete forecast fragment is not a useful standalone hub. Keep the
// evidence-ranked corpus deterministic by excluding it before ranking, rather
// than relabeling it into a misleading entity page.
const EXCLUDED_ENTITY_SLUGS = new Set(["market-2030"]);

// A source ID is an entity prefix followed by document/event/date grammar.
// These are suffix boundaries, never a denylist of valid entity names.
const SOURCE_DOCUMENT_SUFFIXES = [
  ["deployment", "acceptance"],
  ["investor", "relations"],
  ["data", "centers"],
  ["data", "centres"],
  ["energy", "ai"],
  ["form"],
  ["pricing"],
  ["results"],
  ["earnings"],
  ["filing"],
  ["filed"],
  ["press"],
  ["release"],
  ["announcement"],
  ["acceptance"],
  ["investor"],
  ["month"],
  ["news"],
  ["quarter"],
  ["relations"],
  ["report"],
  ["update"],
  ["week"],
  ["year"],
] as const;

const IDENTITY_CONNECTORS = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "via"]);

const PUBLISHER_SUFFIXES = [
  ["investor", "relations"],
  ["holdings", "co"],
  ["incorporated"],
  ["corporation"],
  ["corp"],
  ["company"],
  ["inc"],
  ["llc"],
  ["ltd"],
] as const;

const METRIC_SUFFIX_PHRASES = [
  ["month", "return"],
  ["week", "return"],
] as const;

// Measurement descriptors are removed only from the end of a metric field.
// Domain words remain intact everywhere else (for example liquid-cooling).
const METRIC_MEASUREMENT_SUFFIXES = new Set([
  "b",
  "capacity",
  "change",
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
  "return",
  "revenue",
  "share",
  "usd",
  "value",
  "watts",
  "weeks",
  "years",
]);

const ENTITY_ALIAS_NORMALIZATION = new Map<string, string>([
  ["advanced-micro-devices", "amd"],
  ["advanced-micro-devices-inc", "amd"],
  ["avgo", "broadcom"],
  ["international-energy-agency", "iea"],
  ["nvda", "nvidia"],
  ["on", "onsemi"],
  ["open-ai", "openai"],
  ["sharon", "sharon-ai"],
  ["sharon-ai", "sharon-ai"],
  ["stanford", "stanford-hai"],
  ["stm", "stmicroelectronics"],
  ["tsm", "tsmc"],
  ["vrt", "vertiv"],
  ["vertiv-holdings-co", "vertiv"],
  ["wolf", "wolfspeed"],
]);

const ENTITY_LABEL_OVERRIDES: Record<string, { en: string; zh: string }> = {
  accelerator: { en: "AI accelerators", zh: "AI 加速器" },
  agents: { en: "AI agents", zh: "AI 代理" },
  amd: { en: "AMD", zh: "AMD" },
  "amd-data-center": { en: "AMD data center", zh: "AMD 資料中心" },
  "announced-power": { en: "Announced power", zh: "已公告電力" },
  api: { en: "APIs", zh: "API" },
  broadcom: { en: "Broadcom", zh: "Broadcom" },
  cisco: { en: "Cisco", zh: "Cisco" },
  "cisco-ai-infrastructure": { en: "Cisco AI infrastructure", zh: "Cisco AI 基礎設施" },
  "committed-power": { en: "Committed power", zh: "已承諾電力" },
  cooling: { en: "Data-center cooling", zh: "資料中心冷卻" },
  doe: { en: "DOE", zh: "美國能源部" },
  gemini: { en: "Gemini", zh: "Gemini" },
  hbm: { en: "HBM", zh: "HBM" },
  iea: { en: "IEA", zh: "國際能源總署" },
  inference: { en: "Inference", zh: "推論" },
  infineon: { en: "Infineon", zh: "Infineon" },
  interconnection: { en: "Grid interconnection", zh: "電網併網" },
  "managed-tokens": { en: "Managed tokens", zh: "託管權杖" },
  "market-2030": { en: "2030 SiC market", zh: "2030 年 SiC 市場" },
  nvidia: { en: "NVIDIA", zh: "NVIDIA" },
  onsemi: { en: "onsemi", zh: "onsemi" },
  openai: { en: "OpenAI", zh: "OpenAI" },
  "openai-ports": { en: "OpenAI PORTS", zh: "OpenAI PORTS" },
  packaging: { en: "Advanced packaging", zh: "先進封裝" },
  power: { en: "Data-center power", zh: "資料中心電力" },
  "production-agents": { en: "Production agents", zh: "生產環境代理" },
  "sharon-ai": { en: "Sharon AI", zh: "Sharon AI" },
  software: { en: "AI software", zh: "AI 軟體" },
  spend: { en: "AI spending", zh: "AI 支出" },
  "stanford-hai": { en: "Stanford HAI", zh: "Stanford HAI" },
  stmicroelectronics: { en: "STMicroelectronics", zh: "STMicroelectronics" },
  tsmc: { en: "TSMC", zh: "TSMC" },
  vertiv: { en: "Vertiv", zh: "Vertiv" },
  vistra: { en: "Vistra", zh: "Vistra" },
  wafer: { en: "SiC wafers", zh: "SiC 晶圓" },
  wolfspeed: { en: "Wolfspeed", zh: "Wolfspeed" },
};

type EntityCandidateChannel =
  | "metric-concept"
  | "source-identity";

export type EntityEvidenceDiversity = {
  datedBriefs: number;
  canonicalSources: number;
  distinctMetrics: number;
  narrativeDates: number;
};

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
  evidence: EntityEvidenceDiversity;
};

export type EntityHub = Omit<EligibleEntityRecord, "evidence">;

type CandidateAccumulator = {
  slug: string;
  briefs: Map<string, { date: string; dataCutoff: string; pillars: Set<PageSlug> }>;
  pillars: Set<PageSlug>;
  metrics: Map<string, EntityEvidenceMetric>;
  metricIds: Set<string>;
  sourceIds: Set<string>;
  narrativeDates: Set<string>;
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
  if (IDENTITY_CONNECTORS.has(tokens[0]) || IDENTITY_CONNECTORS.has(tokens[tokens.length - 1])) return undefined;
  const phrase = tokens.join("-");
  const alias = ENTITY_ALIAS_NORMALIZATION.get(phrase);
  if (alias !== undefined) return alias;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(phrase)) return undefined;
  return phrase;
}

function startsWithTokens(tokens: string[], prefix: string[]): boolean {
  return prefix.length <= tokens.length && prefix.every((token, index) => tokens[index] === token);
}

function matchesPhraseAt(tokens: string[], phrase: readonly string[], index: number): boolean {
  return phrase.every((token, offset) => tokens[index + offset] === token);
}

function sourceSuffixStartsAt(tokens: string[], index: number): boolean {
  const token = tokens[index] ?? "";
  return (
    /^\d/.test(token) ||
    /^q[1-4]$/.test(token) ||
    /^fy(?:\d+)?$/.test(token) ||
    ["gnw", "prn", "sec"].includes(token) ||
    SOURCE_DOCUMENT_SUFFIXES.some((phrase) => matchesPhraseAt(tokens, phrase, index))
  );
}

function leadingSourceTokens(tokens: string[]): string[] {
  const boundary = tokens.findIndex((_token, index) => sourceSuffixStartsAt(tokens, index));
  return boundary < 0 ? tokens : tokens.slice(0, boundary);
}

function publisherIdentityTokens(value: string): string[] {
  let tokens = tokenizeEntityText(value);
  const via = tokens.indexOf("via");
  if (via >= 0) tokens = tokens.slice(0, via);
  tokens = leadingSourceTokens(tokens);
  let removed = true;
  while (removed && tokens.length > 0) {
    removed = false;
    for (const suffix of PUBLISHER_SUFFIXES) {
      const index = tokens.length - suffix.length;
      if (index >= 0 && matchesPhraseAt(tokens, suffix, index)) {
        tokens = tokens.slice(0, index);
        removed = true;
        break;
      }
    }
  }
  return tokens;
}

function formatTitleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function metricFieldTokens(metricId: string): string[] {
  const [, ...fieldSegments] = metricId.split(".");
  const tokens = fieldSegments
    .flatMap((segment) => tokenizeEntityText(
      segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " "),
    ))
    .filter(Boolean);
  let stripped = true;
  while (stripped && tokens.length > 0) {
    stripped = false;
    for (const suffix of METRIC_SUFFIX_PHRASES) {
      const index = tokens.length - suffix.length;
      if (index >= 0 && matchesPhraseAt(tokens, suffix, index)) {
        tokens.splice(index);
        stripped = true;
        break;
      }
    }
    if (stripped) continue;
    const last = tokens[tokens.length - 1];
    if (METRIC_MEASUREMENT_SUFFIXES.has(last) || /^q[1-4]$/.test(last) || /^fy\d+$/.test(last)) {
      tokens.pop();
      stripped = true;
    }
  }
  return tokens;
}

function metricEntityCandidate(metricId: string): { slug: string; channel: "metric-concept" } | undefined {
  const tokens = metricFieldTokens(metricId);
  const slug = normalizeCandidateTokens(tokens);
  return slug === undefined ? undefined : { slug, channel: "metric-concept" };
}

function sourceEntityCandidate(
  sourceId: string,
  source: SourceRecord,
): { slug: string; channel: "source-identity"; observedName: string } | undefined {
  if (source.kind === "atlas") return undefined;
  const idTokens = leadingSourceTokens(tokenizeEntityText(sourceId));
  const publisherTokens = publisherIdentityTokens(source.publisher);
  const idSlug = normalizeCandidateTokens(idTokens);
  const publisherSlug = normalizeCandidateTokens(publisherTokens);
  const publisherSlugTokens = publisherSlug?.split("-") ?? [];
  const aliasesAgree = idSlug !== undefined && publisherSlug !== undefined && idSlug === publisherSlug;
  const publisherMatchesId = publisherSlug !== undefined && startsWithTokens(tokenizeEntityText(sourceId), publisherSlugTokens);
  const leadingPublisherTokenMatches = publisherTokens.length > 1 && publisherTokens[0] === idTokens[0];
  const slug = aliasesAgree || publisherMatchesId || leadingPublisherTokenMatches ? publisherSlug : idSlug;
  if (slug === undefined) return undefined;
  const observedName = slug === publisherSlug
    ? publisherIdentityTokens(source.publisher).join(" ")
    : idTokens.join(" ");
  return { slug, channel: "source-identity", observedName: observedName || slug.replace(/-/g, " ") };
}

function reportEvidenceText(brief: PublishedBrief, pillar: PageSlug, metricId: string): string {
  const report = brief.snapshot.pages[pillar].report;
  return [
    ...report.thesis.tags.en,
    ...report.thesis.tags.zh,
    ...(report.thesisSurvivalRationale?.metricIds.includes(metricId)
      ? Object.values(report.thesisSurvivalRationale.text)
      : []),
    ...report.supportingEvidence
      .filter((evidence) => evidence.metricIds.includes(metricId))
      .flatMap((evidence) => Object.values(evidence.text)),
    ...report.opposingEvidence
      .filter((evidence) => evidence.metricIds.includes(metricId))
      .flatMap((evidence) => Object.values(evidence.text)),
  ].join(" ");
}

function narrativeReferences(slug: string, text: string): boolean {
  const needle = slug.split("-");
  const haystack = tokenizeEntityText(text);
  return haystack.some((_token, index) => matchesPhraseAt(haystack, needle, index));
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
  const en = formatTitleCase(observed ?? slug.replace(/-/g, " "));
  return { en, zh: en };
}

function accumulator(slug: string): CandidateAccumulator {
  return {
    slug,
    briefs: new Map(),
    pillars: new Set(),
    metrics: new Map(),
    metricIds: new Set(),
    sourceIds: new Set(),
    narrativeDates: new Set(),
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
  narrativeReferenced: boolean,
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
  record.metricIds.add(metricId);
  if (narrativeReferenced) record.narrativeDates.add(brief.date);
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
  }
}

function keepEligible(record: CandidateAccumulator): boolean {
  return (
    record.briefs.size >= ENTITY_EVIDENCE_FLOOR.datedBriefs &&
    record.sourceIds.size >= ENTITY_EVIDENCE_FLOOR.canonicalSources &&
    record.metricIds.size >= ENTITY_EVIDENCE_FLOOR.distinctMetrics
  );
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
  if (sourceSuffixStartsAt(tokens, 0)) return undefined;
  return normalizeCandidateTokens(tokens);
}

function accumulateEntityCandidates(briefs: PublishedBrief[]): {
  records: CandidateAccumulator[];
  sourceRecords: Map<string, SourceRecord>;
} {
  const sourceRecords = sourceLookup(briefs);
  const candidates = new Map<string, CandidateAccumulator>();

  for (const brief of briefs) {
    for (const pillar of Object.keys(brief.snapshot.pages) as PageSlug[]) {
      for (const metricId of reportMetricIds(brief, pillar)) {
        const metric = brief.snapshot.metrics[metricId];
        const evidenceText = reportEvidenceText(brief, pillar, metricId);
        const relevantSourceIds = metric.sourceIds.filter(
          (sourceId) => brief.snapshot.sources[sourceId]?.kind !== "atlas",
        );
        const metricCandidate = metricEntityCandidate(metricId);
        if (metricCandidate !== undefined) {
          const narrativeReferenced = narrativeReferences(metricCandidate.slug, evidenceText);
          if (narrativeReferenced || relevantSourceIds.length > 0) {
            const record = candidates.get(metricCandidate.slug) ?? accumulator(metricCandidate.slug);
            recordObservation(
              record,
              brief,
              pillar,
              metricId,
              relevantSourceIds,
              metricCandidate.channel,
              narrativeReferenced,
            );
            candidates.set(metricCandidate.slug, record);
          }
        }
        for (const sourceId of metric.sourceIds) {
          const source = brief.snapshot.sources[sourceId];
          if (source === undefined) continue;
          const candidate = sourceEntityCandidate(sourceId, source);
          if (candidate === undefined) continue;
          const record = candidates.get(candidate.slug) ?? accumulator(candidate.slug);
          recordObservation(
            record,
            brief,
            pillar,
            metricId,
            [sourceId],
            candidate.channel,
            narrativeReferences(candidate.slug, evidenceText),
            candidate.observedName,
          );
          candidates.set(candidate.slug, record);
        }
      }
    }
  }
  return { records: [...candidates.values()], sourceRecords };
}

function materializeEntityRecord(
  record: CandidateAccumulator,
  sourceRecords: Map<string, SourceRecord>,
): EligibleEntityRecord {
      const sources = [...record.sourceIds]
        .sort()
        .map((sourceId) => sourceRecords.get(sourceId))
        .filter((source): source is SourceRecord => source !== undefined && source.kind !== "atlas");
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
        evidence: {
          datedBriefs: record.briefs.size,
          canonicalSources: record.sourceIds.size,
          distinctMetrics: record.metricIds.size,
          narrativeDates: record.narrativeDates.size,
        },
      };
}

export function discoverEntityCandidateRecords(briefs: PublishedBrief[]): EligibleEntityRecord[] {
  const { records, sourceRecords } = accumulateEntityCandidates(briefs);
  return records
    .map((record) => materializeEntityRecord(record, sourceRecords))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

// The useful-corpus contract deliberately caps recurrence: after the floor,
// ranking rewards dated narrative references, authoritative source identity,
// and diversity across metrics/sources/pillars, with a stable slug tie-break.
function entitySelectionScore(record: CandidateAccumulator): number {
  const cap = (value: number) => Math.min(value, 3);
  return (
    cap(record.narrativeDates.size) * 24 +
    (record.channels.has("source-identity") ? 32 : 0) +
    cap(record.metricIds.size) * 8 +
    cap(record.sourceIds.size) * 6 +
    cap(record.pillars.size) * 4 +
    cap(record.briefs.size) * 4 +
    (record.slug.includes("-") ? 2 : 0)
  );
}

export function discoverEligibleEntityRecords(briefs: PublishedBrief[]): EligibleEntityRecord[] {
  const { records, sourceRecords } = accumulateEntityCandidates(briefs);
  return records
    .filter((record) => !EXCLUDED_ENTITY_SLUGS.has(record.slug) && keepEligible(record))
    .sort((left, right) =>
      entitySelectionScore(right) - entitySelectionScore(left) || left.slug.localeCompare(right.slug),
    )
    .slice(0, ENTITY_SELECTION_LIMIT)
    .map((record) => materializeEntityRecord(record, sourceRecords))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function extractEntityHubs(briefs: PublishedBrief[]): EntityHub[] {
  return discoverEligibleEntityRecords(briefs).map(({ evidence, ...entity }) => {
    void evidence;
    return entity;
  });
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
