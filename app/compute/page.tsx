import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { compute } from "../content";
import { computeZh } from "../content-zh";
import { buildMetadata } from "../seo";

export const metadata: Metadata = buildMetadata("/compute");

export default function ComputePage() {
  return <MarketDashboardPage config={compute} chineseConfig={computeZh} />;
}
