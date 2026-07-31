import type { Metadata } from "next";
import { MarketDashboardPage } from "../../components/MarketDashboardPage";
import { models } from "../../content";
import { modelsZh } from "../../content-zh";
import { buildEnglishMetadata } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/models");
export default function EnglishModelsPage() {
  return <MarketDashboardPage config={models} chineseConfig={modelsZh} locale="en" />;
}
