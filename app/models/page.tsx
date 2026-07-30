import { MarketDashboard } from "../components/MarketDashboard";
import { models } from "../content";

export default function ModelsPage() {
  return <MarketDashboard config={models} />;
}
