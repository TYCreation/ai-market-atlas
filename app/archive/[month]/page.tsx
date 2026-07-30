import { notFound } from "next/navigation";
import { ArchiveReport } from "../../components/ArchiveReport";
import {
  getMonthlyArchive,
  getMonthlyArchiveSources,
  listMonthlyArchives,
} from "../../../market-data/monthly.ts";

export function generateStaticParams() {
  return listMonthlyArchives().map(({ month }) => ({ month }));
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
  return <ArchiveReport archive={archive} sources={sources} />;
}
