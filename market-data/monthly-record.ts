import type { AutomatedReview } from "./review.ts";
import type {
  BilingualText,
  MetricRecord,
  PageSlug,
  SourceRecord,
  ThesisStance,
} from "./types.ts";

export type LegacyMonthlyArchiveProvenance = {
  kind: "legacy-migration";
  source: "approved-current-snapshot";
  originalRunId: string;
  recordedAt: string;
};

export type MonthlyArchiveReviewProvenance = AutomatedReview | LegacyMonthlyArchiveProvenance;

export type MonthlyArchiveRecord = {
  month: string;
  runId: string;
  dataCutoff: string;
  summary: BilingualText;
  basketChange: MetricRecord;
  equityChanges: MetricRecord[];
  thesisChanges: Array<{
    page: PageSlug;
    from: ThesisStance;
    to: ThesisStance;
    explanation: BilingualText;
    metricIds: string[];
  }>;
  catalysts: BilingualText[];
  risks: BilingualText[];
  sourceIds: string[];
  sources: SourceRecord[];
  review: MonthlyArchiveReviewProvenance;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBilingualText(value: unknown): value is BilingualText {
  return isRecord(value) && typeof value.en === "string" && typeof value.zh === "string";
}

function isSourceRecord(value: unknown): value is SourceRecord {
  return isRecord(value) && typeof value.id === "string" && typeof value.publisher === "string" && typeof value.title === "string" && isBilingualText(value.scope);
}

function isMetricRecord(value: unknown): value is MetricRecord {
  return isRecord(value) && typeof value.id === "string" && isBilingualText(value.display);
}

function isThesisChange(value: unknown): value is MonthlyArchiveRecord["thesisChanges"][number] {
  return isRecord(value) &&
    typeof value.page === "string" &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    isBilingualText(value.explanation) &&
    Array.isArray(value.metricIds) &&
    value.metricIds.every((metricId) => typeof metricId === "string");
}

function isLegacyProvenance(value: unknown): value is LegacyMonthlyArchiveProvenance {
  return isRecord(value) &&
    value.kind === "legacy-migration" &&
    value.source === "approved-current-snapshot" &&
    typeof value.originalRunId === "string" &&
    typeof value.recordedAt === "string";
}

function isAutomatedReview(value: unknown): value is AutomatedReview {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.runId === "string" &&
    value.decision === "auto_publish" &&
    Array.isArray(value.checks) &&
    Array.isArray(value.issues);
}

export function assertMonthlyArchiveRecord(value: unknown): asserts value is MonthlyArchiveRecord {
  if (!isRecord(value) ||
    typeof value.month !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.dataCutoff !== "string" ||
    !isBilingualText(value.summary) ||
    !isMetricRecord(value.basketChange) ||
    !Array.isArray(value.equityChanges) ||
    !value.equityChanges.every(isMetricRecord) ||
    !Array.isArray(value.thesisChanges) ||
    !value.thesisChanges.every(isThesisChange) ||
    !Array.isArray(value.catalysts) ||
    !value.catalysts.every(isBilingualText) ||
    !Array.isArray(value.risks) ||
    !value.risks.every(isBilingualText) ||
    !Array.isArray(value.sourceIds) ||
    !value.sourceIds.every((sourceId) => typeof sourceId === "string") ||
    !Array.isArray(value.sources) ||
    !value.sources.every(isSourceRecord) ||
    (!isAutomatedReview(value.review) && !isLegacyProvenance(value.review))) {
    throw new Error("monthly archive record is invalid");
  }

  const sourceIds = value.sources.map((source) => source.id).sort();
  if (JSON.stringify([...value.sourceIds].sort()) !== JSON.stringify(sourceIds)) {
    throw new Error("monthly archive sources do not match sourceIds");
  }
}

export function isLegacyMonthlyArchiveProvenance(
  review: MonthlyArchiveReviewProvenance,
): review is LegacyMonthlyArchiveProvenance {
  return "kind" in review && review.kind === "legacy-migration";
}
