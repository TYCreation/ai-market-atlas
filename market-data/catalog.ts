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

export const QUARTERLY_PUBLISHED_METRIC_IDS = new Set([
  "pulse.broadcom_ai_revenue",
  "stocks.broadcom_revenue",
  "stocks.broadcom_gaap_eps",
  "stocks.broadcom_adjusted_eps",
  "compute.broadcom_ai_revenue_growth",
  "sic.onsemi_gaap_gross_margin",
  "pulse.nvidia_data_center_revenue",
  "stocks.nvidia_q2_revenue_growth",
  "compute.nvidia_data_center_growth",
  "compute.amd_data_center_growth",
  "compute.amd_data_center_revenue",
  "compute.cisco_ai_infrastructure_orders",
  "energy.vertiv_q2_revenue_growth",
  "pulse.amd_data_center_revenue",
  "pulse.cisco_ai_infrastructure_orders",
  "sic.onsemi_q2_revenue",
  "stocks.amd_q2_revenue_growth",
]);

export const EVENT_DRIVEN_PUBLISHED_METRIC_IDS = new Set([
  "pulse.openai_serving_cost_reduction",
  "compute.openai_inference_throughput_per_watt_lower_bound",
  "energy.openai_inference_throughput_per_watt_lower_bound",
  "models.openai_business_count",
  "pulse.humain_phase_two_capacity",
  "compute.humain_phase_two_capacity",
  "pulse.openai_frontier_output_intensity",
  "models.openai_frontier_output_intensity",
  "compute.openai_ports_capacity",
  "compute.sharon_ai_contract_value",
  "energy.openai_ports_capacity",
  "energy.vistra_helix_commitment",
  "models.openai_coding_token_efficiency",
  "models.openai_monitoring_overhead",
  "pulse.openai_coding_token_efficiency",
  "pulse.openai_ports_capacity",
  "pulse.sharon_ai_contract_value",
]);
