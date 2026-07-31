import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { marketPulse } from "../content";
import { marketPulseZh } from "../content-zh";
import { buildEnglishMetadata } from "../seo";

export const metadata: Metadata = buildEnglishMetadata("/");
export default function EnglishHome() {
  return <MarketDashboardPage config={marketPulse} chineseConfig={marketPulseZh} locale="en" />;
}
