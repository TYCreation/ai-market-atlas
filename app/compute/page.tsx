import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { compute } from "../content";
import { computeZh } from "../content-zh";

export default function ComputePage() {
  return <MarketDashboardPage config={compute} chineseConfig={computeZh} />;
}
