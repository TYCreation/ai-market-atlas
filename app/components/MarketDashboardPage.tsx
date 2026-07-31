import { loadMarketViewModel } from "../../market-data/view-model";
import { hydrateDashboard, type DashboardConfig } from "../content";
import {
  dashboardHeadings,
  pageSeo,
  type DashboardPath,
} from "../seo";
import { MarketDashboard } from "./MarketDashboard";
import { ReportStructuredData } from "./StructuredData";

export async function MarketDashboardPage({
  config,
  chineseConfig,
}: {
  config: DashboardConfig;
  chineseConfig: DashboardConfig;
}) {
  const viewModel = await loadMarketViewModel();
  const edition = {
    en: viewModel.getEditionMeta("en"),
    zh: viewModel.getEditionMeta("zh"),
  };
  const pageEdition = {
    en: viewModel.getPageMeta(config.slug, "en"),
    zh: viewModel.getPageMeta(config.slug, "zh"),
  };
  const path = config.slug as DashboardPath;

  return (
    <>
      <ReportStructuredData
        path={path}
        headline={dashboardHeadings[path].zh}
        description={pageSeo[path].description}
        dateModified={viewModel.snapshot.dataCutoff}
      />
      <MarketDashboard
        config={hydrateDashboard(config, "en", viewModel)}
        chineseConfig={hydrateDashboard(chineseConfig, "zh", viewModel)}
        sourceBundle={viewModel.sourceBundles[config.slug]}
        edition={edition}
        pageEdition={pageEdition}
      />
    </>
  );
}
