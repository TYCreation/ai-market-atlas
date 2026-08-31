import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedBrief, listPublishedBriefs } from "../../../../market-data/briefs";
import { isBriefDate } from "../../../../market-data/brief-routes";
import { marketPulse } from "../../../content";
import { marketPulseZh } from "../../../content-zh";
import { MarketDashboardPage } from "../../../components/MarketDashboardPage";
import { buildEnglishMetadata } from "../../../seo";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await listPublishedBriefs()).map(({ date }) => ({ date }));
}

async function briefForDate(date: string) {
  if (!isBriefDate(date)) return undefined;
  return getPublishedBrief(await listPublishedBriefs(), date);
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  const brief = await briefForDate(date);
  return brief ? buildEnglishMetadata("/", {
    title: `${date} AI Market Brief`,
    description: brief.snapshot.pages["/"].report.summary.en,
    route: `/brief/${date}`,
  }) : {};
}

export default async function EnglishBriefDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const brief = await briefForDate(date);
  if (!brief) notFound();
  return <MarketDashboardPage config={marketPulse} chineseConfig={marketPulseZh} locale="en" snapshot={brief.snapshot} routePath={`/en/brief/${date}`} alternateRoutePath={`/brief/${date}`} showPillarIndex={false} />;
}
