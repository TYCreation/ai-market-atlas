import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveReport } from "../../../components/ArchiveReport";
import { ReportStructuredData } from "../../../components/StructuredData";
import { buildEnglishMetadata } from "../../../seo";
import { getMonthlyArchive, getMonthlyArchiveSources, listMonthlyArchives } from "../../../../market-data/monthly.ts";

export function generateStaticParams() { return listMonthlyArchives().map(({ month }) => ({ month })); }
export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params; const archive = getMonthlyArchive(month);
  return archive ? buildEnglishMetadata("/archive", { title: `${month} AI Market Report`, description: archive.summary.en }) : {};
}
export default async function EnglishMonthlyArchivePage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params; const archive = getMonthlyArchive(month); const sources = getMonthlyArchiveSources(month);
  if (!archive || !sources) notFound();
  return <><ReportStructuredData path={`/en/archive/${month}`} headline={`${month} AI Market Report`} description={archive.summary.en} dateModified={archive.dataCutoff} /><ArchiveReport archive={archive} sources={sources} locale="en" /></>;
}
