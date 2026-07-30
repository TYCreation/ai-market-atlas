import type { PageSlug } from "./types.ts";

export const KPI_CATALOG = [
  ["/", 0, "pulse.infrastructure_spend", "$B"],
  ["/", 1, "pulse.accelerator_market", "$B"],
  ["/", 2, "pulse.power_queue", "GW"],
  ["/", 3, "pulse.enterprise_agents", "programs"],
  ["/stocks", 0, "stocks.basket_30d", "%"],
  ["/stocks", 1, "stocks.positive_breadth", "%"],
  ["/stocks", 2, "stocks.median_forward_pe", "x"],
  ["/stocks", 3, "stocks.catalyst_count", "events"],
  ["/compute", 0, "compute.accelerator_pool", "$B"],
  ["/compute", 1, "compute.hbm_demand", "%"],
  ["/compute", 2, "compute.packaging_lead_weeks", "weeks"],
  ["/compute", 3, "compute.inference_cost_change", "%"],
  ["/energy", 0, "energy.announced_power_gw", "GW"],
  ["/energy", 1, "energy.committed_power_gw", "GW"],
  ["/energy", 2, "energy.interconnection_years", "years"],
  ["/energy", 3, "energy.liquid_cooling_share", "%"],
  ["/models", 0, "models.production_agents", "programs"],
  ["/models", 1, "models.software_spend_growth", "%"],
  ["/models", 2, "models.managed_tokens", "T tokens"],
  ["/models", 3, "models.api_deployment_share", "%"],
  ["/sic", 0, "sic.market_2030_usd_b", "$B"],
  ["/sic", 1, "sic.wafer_frontier_mm", "mm"],
  ["/sic", 2, "sic.packaging_watts", "W"],
  ["/sic", 3, "sic.ev_penetration", "%"],
] as const satisfies ReadonlyArray<readonly [PageSlug, number, string, string]>;

export const REQUIRED_METRIC_IDS = new Set(KPI_CATALOG.map((entry) => entry[2]));

export type StockMetricField = "price" | "weekReturn" | "monthReturn";

export function stockMetricId(ticker: string, field: StockMetricField) {
  return `stocks.${ticker.toLowerCase()}.${field}`;
}

export const EQUITY_UNIVERSE = ["NVDA", "AVGO", "AMD", "TSM", "VRT", "ETN", "CEG", "WOLF", "ON", "NOW", "PLTR", "CRM"] as const;

export const REQUIRED_STOCK_METRIC_IDS = new Set(
  EQUITY_UNIVERSE.flatMap((ticker) => [
    stockMetricId(ticker, "price"),
    stockMetricId(ticker, "weekReturn"),
    stockMetricId(ticker, "monthReturn"),
  ]),
);
