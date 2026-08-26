import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveReport } from "../../components/ArchiveReport";
import { ReportStructuredData } from "../../components/StructuredData";
import { buildMetadata } from "../../seo";
import {
  getMonthlyArchive,
  getMonthlyArchiveSources,
  listMonthlyArchives,
} from "../../../market-data/monthly.ts";

export function generateStaticParams() {
  return listMonthlyArchives().map(({ month }) => ({ month }));
}

function monthName(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return `${year} 年 ${monthNumber} 月`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ month: string }>;
}): Promise<Metadata> {
  const { month } = await params;
  const archive = getMonthlyArchive(month);
  if (!archive) return {};
  return buildMetadata("/archive", {
    title: `${monthName(month)} AI 市場報告`,
    description: archive.summary.zh,
    route: `/archive/${month}`,
  });
}

export default async function MonthlyArchivePage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  let archive;
  let sources;

  try {
    archive = getMonthlyArchive(month);
    sources = getMonthlyArchiveSources(month);
  } catch {
    notFound();
  }

  if (!archive || !sources) notFound();
  return (
    <>
      <ReportStructuredData
        path={`/archive/${month}`}
        headline={`${monthName(month)} AI 市場報告`}
        description={archive.summary.zh}
        dateModified={archive.dataCutoff}
      />
      <ArchiveReport archive={archive} sources={sources} />
    </>
  );
}
