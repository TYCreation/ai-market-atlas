import { MarketDashboard } from "../components/MarketDashboard";
import { compute } from "../content";

export default function ComputePage() {
  return <MarketDashboard config={compute} />;
}
