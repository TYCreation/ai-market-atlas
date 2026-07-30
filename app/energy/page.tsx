import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { energy } from "../content";
import { energyZh } from "../content-zh";

export default function EnergyPage() {
  return <MarketDashboardPage config={energy} chineseConfig={energyZh} />;
}
