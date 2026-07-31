import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { energy } from "../content";
import { energyZh } from "../content-zh";
import { buildMetadata } from "../seo";

export const metadata: Metadata = buildMetadata("/energy");

export default function EnergyPage() {
  return <MarketDashboardPage config={energy} chineseConfig={energyZh} />;
}
