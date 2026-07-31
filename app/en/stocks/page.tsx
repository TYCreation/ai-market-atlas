import type { Metadata } from "next";
import { MarketDashboardPage } from "../../components/MarketDashboardPage";
import { stocks } from "../../content";
import { stocksZh } from "../../content-zh";
import { buildEnglishMetadata } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/stocks");
export default function EnglishStocksPage() {
  return <MarketDashboardPage config={stocks} chineseConfig={stocksZh} locale="en" />;
}
