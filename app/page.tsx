import { MarketDashboard } from "./components/MarketDashboard";
import { marketPulse } from "./content";

export default function Home() {
  return <MarketDashboard config={marketPulse} />;
}
