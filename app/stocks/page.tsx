import type { Metadata } from "next";
import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { stocks } from "../content";
import { stocksZh } from "../content-zh";
import { buildMetadata } from "../seo";

export const metadata: Metadata = buildMetadata("/stocks");

export default function StocksPage() {
  return <MarketDashboardPage config={stocks} chineseConfig={stocksZh} />;
}
