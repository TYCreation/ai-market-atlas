import archiveIndexJson from "#market-monthly-index" with { type: "json" };
import {
  assertMonthlyArchiveRecord,
  isLegacyMonthlyArchiveProvenance,
  type MonthlyArchiveRecord,
} from "./monthly-record.ts";
import type { AutomatedReview } from "./review.ts";
import type { BilingualText, FalsifiableRisk, MetricRecord, PageSlug, SourceRecord, ThesisStance } from "./types.ts";

export type MonthlyArchive = {
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
  analystNotes?: BilingualText[];
  risks: Array<FalsifiableRisk | BilingualText>;
  sourceIds: string[];
};

export type MonthlyArchiveEntry = {
  archive: MonthlyArchive;
  sources: SourceRecord[];
  review:
    | { kind: "automated-review"; review: AutomatedReview }
    | { kind: "legacy-migration"; originalRunId: string; recordedAt: string };
};

function isArchiveMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function entryFromRecord(month: string, record: MonthlyArchiveRecord): MonthlyArchiveEntry {
  if (!isArchiveMonth(month) || record.month !== month) throw new Error(`Invalid archive month: ${month}`);
  return {
    archive: {
      month: record.month,
      runId: record.runId,
      dataCutoff: record.dataCutoff,
      summary: record.summary,
      basketChange: record.basketChange,
      equityChanges: record.equityChanges,
      thesisChanges: record.thesisChanges,
      catalysts: record.catalysts,
      ...(record.analystNotes ? { analystNotes: record.analystNotes } : {}),
      risks: record.risks,
      sourceIds: record.sourceIds,
    },
    sources: record.sources,
    review: isLegacyMonthlyArchiveProvenance(record.review)
      ? {
          kind: "legacy-migration",
          originalRunId: record.review.originalRunId,
          recordedAt: record.review.recordedAt,
        }
      : { kind: "automated-review", review: record.review },
  };
}

export function parseMonthlyArchiveIndex(value: unknown): MonthlyArchiveEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("monthly archive index must be an object");
  }
  return Object.entries(value)
    .map(([month, record]) => {
      assertMonthlyArchiveRecord(record);
      return entryFromRecord(month, record);
    })
    .sort((left, right) => right.archive.month.localeCompare(left.archive.month));
}

const archiveIndex = parseMonthlyArchiveIndex(archiveIndexJson);

export function listMonthlyArchives(): MonthlyArchive[] {
  return archiveIndex.map(({ archive }) => archive);
}

export function getMonthlyArchive(month: string): MonthlyArchive | undefined {
  if (!isArchiveMonth(month)) throw new Error(`Invalid archive month: ${month}`);
  return archiveIndex.find(({ archive }) => archive.month === month)?.archive;
}

export function getMonthlyArchiveSources(month: string): SourceRecord[] | undefined {
  if (!isArchiveMonth(month)) throw new Error(`Invalid archive month: ${month}`);
  return archiveIndex.find(({ archive }) => archive.month === month)?.sources;
}
