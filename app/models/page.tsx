import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { models } from "../content";
import { modelsZh } from "../content-zh";
import { buildMetadata } from "../seo";

export const metadata: Metadata = buildMetadata("/models");

export default function ModelsPage() {
  return <MarketDashboardPage config={models} chineseConfig={modelsZh} />;
}
