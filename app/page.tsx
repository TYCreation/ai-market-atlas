import { MarketDashboardPage } from "./components/MarketDashboardPage";
import { marketPulse } from "./content";
import { marketPulseZh } from "./content-zh";

export default function Home() {
  return <MarketDashboardPage config={marketPulse} chineseConfig={marketPulseZh} />;
}
