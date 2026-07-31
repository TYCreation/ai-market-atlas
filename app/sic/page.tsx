import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { sic } from "../content";
import { sicZh } from "../content-zh";
import { buildMetadata } from "../seo";

export const metadata: Metadata = buildMetadata("/sic");

export default function SiCPage() {
  return <MarketDashboardPage config={sic} chineseConfig={sicZh} />;
}
