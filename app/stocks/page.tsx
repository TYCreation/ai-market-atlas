import { MarketDashboard } from "../components/MarketDashboard";
import { stocks } from "../content";

export default function StocksPage() {
  return <MarketDashboard config={stocks} />;
}
