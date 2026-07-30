import { MarketDashboardPage } from "../components/MarketDashboardPage";
import { sic } from "../content";
import { sicZh } from "../content-zh";

export default function SiCPage() {
  return <MarketDashboardPage config={sic} chineseConfig={sicZh} />;
}
