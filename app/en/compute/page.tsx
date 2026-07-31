import type { Metadata } from "next";
import { MarketDashboardPage } from "../../components/MarketDashboardPage";
import { compute } from "../../content";
import { computeZh } from "../../content-zh";
import { buildEnglishMetadata } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/compute");
export default function EnglishComputePage() {
  return <MarketDashboardPage config={compute} chineseConfig={computeZh} locale="en" />;
}
