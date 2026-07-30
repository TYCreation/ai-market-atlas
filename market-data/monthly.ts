import archiveIndexJson from "../data/market/monthly/index.json" with { type: "json" };
import { assertMarketSnapshot } from "./schema.ts";
import type {
  BilingualText,
  MarketSnapshot,
  MetricRecord,
  PageSlug,
  SourceRecord,
  ThesisStance,
} from "./types.ts";

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
  risks: BilingualText[];
  sourceIds: string[];
};

type ArchiveIndex = Record<string, MarketSnapshot>;

function isArchiveMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function archiveFromSnapshot(month: string, snapshot: MarketSnapshot): MonthlyArchive {
  const basketChange = snapshot.metrics["stocks.basket_30d"];
  if (!basketChange) throw new Error(`Archive ${month} is missing stocks.basket_30d`);

  return {
    month,
    runId: snapshot.runId,
    dataCutoff: snapshot.dataCutoff,
    summary: snapshot.pages["/"].report.summary,
    basketChange,
    equityChanges: Object.values(snapshot.metrics).filter((metric) =>
      /^stocks\.[^.]+\.monthReturn$/.test(metric.id),
    ),
    thesisChanges: (Object.entries(snapshot.pages) as Array<[PageSlug, MarketSnapshot["pages"][PageSlug]]>)
      .filter(([, page]) => page.thesisStance !== page.previousThesisStance)
      .map(([page, state]) => ({
        page,
        from: state.previousThesisStance,
        to: state.thesisStance,
        explanation: state.report.thesis.body,
        metricIds: state.thesisMetricIds,
      })),
    catalysts: Object.values(snapshot.pages).flatMap((page) => page.report.catalysts),
    risks: Object.values(snapshot.pages).flatMap((page) => page.report.risks),
    sourceIds: Object.keys(snapshot.sources).sort(),
  };
}

const snapshots = archiveIndexJson as ArchiveIndex;
for (const snapshot of Object.values(snapshots)) assertMarketSnapshot(snapshot);

const archiveIndex = Object.entries(snapshots)
  .map(([month, snapshot]) => {
    if (!isArchiveMonth(month)) throw new Error(`Invalid archive month: ${month}`);
    return archiveFromSnapshot(month, snapshot);
  })
  .sort((a, b) => b.month.localeCompare(a.month));

export function listMonthlyArchives(): MonthlyArchive[] {
  return [...archiveIndex];
}

export function getMonthlyArchive(month: string): MonthlyArchive | undefined {
  if (!isArchiveMonth(month)) throw new Error(`Invalid archive month: ${month}`);
  return archiveIndex.find((archive) => archive.month === month);
}

export function getMonthlyArchiveSources(month: string): SourceRecord[] | undefined {
  const archive = getMonthlyArchive(month);
  if (!archive) return undefined;
  const snapshot = snapshots[month];
  return archive.sourceIds.map((sourceId) => snapshot.sources[sourceId]).filter(Boolean);
}
