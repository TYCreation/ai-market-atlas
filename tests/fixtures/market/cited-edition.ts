import legacy from "./valid-candidate.json" with { type: "json" };
import { KPI_CATALOG } from "../../../market-data/catalog.ts";
import type { MarketSnapshot, PageSlug } from "../../../market-data/types.ts";

/** Synthetic test data only; never used by the publication pipeline. */
export function citedEditionFixture(): MarketSnapshot {
  const snapshot = structuredClone(legacy) as unknown as MarketSnapshot;
  snapshot.schemaVersion = 2;
  const ids: Record<PageSlug, string> = {
    "/": "pulse.nvidia_data_center_revenue",
    "/stocks": "stocks.nvidia_q2_revenue_growth",
    "/compute": "compute.nvidia_data_center_growth",
    "/energy": "energy.vertiv_q2_revenue_growth",
    "/models": "models.openai_frontier_output_intensity",
    "/sic": "sic.onsemi_q2_revenue",
  };
  snapshot.metrics = Object.fromEntries(Object.entries(ids).map(([slug, id]) => {
    const oldId = KPI_CATALOG.find(([page]) => page === slug)![2];
    const metric = { ...structuredClone(legacy.metrics[oldId]), id, page: slug, kind: "published" };
    return [id, metric];
  })) as MarketSnapshot["metrics"];
  for (const [slug, page] of Object.entries(snapshot.pages)) {
    const id = ids[slug as PageSlug];
    page.kpis = [{ metricId: id, label: { en: "Cited quarterly fact", zh: "已引用季度資料" } }];
    page.thesisMetricIds = [id];
    if (page.report.thesisSurvivalRationale) page.report.thesisSurvivalRationale.metricIds = [id];
    for (const item of [...page.report.supportingEvidence, ...page.report.opposingEvidence]) item.metricIds = [id];
    for (const item of [...page.report.risks, ...page.report.nextObservations]) {
      if ("comparison" in item) item.comparison = { ...item.comparison, metricId: id, unit: snapshot.metrics[id].unit };
    }
  }
  snapshot.keySignalIds = Object.values(ids);
  return snapshot;
}
