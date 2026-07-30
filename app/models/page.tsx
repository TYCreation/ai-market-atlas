import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { models } from "../content";
import { modelsZh } from "../content-zh";

export default function ModelsPage() {
  return <MarketDashboardPage config={models} chineseConfig={modelsZh} />;
}
