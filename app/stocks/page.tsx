import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { stocks } from "../content";
import { stocksZh } from "../content-zh";

export default function StocksPage() {
  return <MarketDashboardPage config={stocks} chineseConfig={stocksZh} />;
}
