import type { Metadata } from "next";
import { MarketDashboardPage } from "./components/MarketDashboardPage";
import { marketPulse } from "./content";
import { marketPulseZh } from "./content-zh";
import { buildMetadata } from "./seo";

export const metadata: Metadata = buildMetadata("/");

export default function Home() {
  return <MarketDashboardPage config={marketPulse} chineseConfig={marketPulseZh} />;
}
