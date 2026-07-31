import type { Metadata } from "next";
import { MarketDashboardPage } from "../../components/MarketDashboardPage";
import { energy } from "../../content";
import { energyZh } from "../../content-zh";
import { buildEnglishMetadata } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/energy");
export default function EnglishEnergyPage() {
  return <MarketDashboardPage config={energy} chineseConfig={energyZh} locale="en" />;
}
