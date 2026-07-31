import type { Metadata } from "next";
import { MarketDashboardPage } from "../../components/MarketDashboardPage";
import { sic } from "../../content";
import { sicZh } from "../../content-zh";
import { buildEnglishMetadata } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/sic");
export default function EnglishSiCPage() {
  return <MarketDashboardPage config={sic} chineseConfig={sicZh} locale="en" />;
}
