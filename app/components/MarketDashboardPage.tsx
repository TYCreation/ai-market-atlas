import { loadMarketViewModel } from "../../market-data/view-model";
import { hydrateDashboard, type DashboardConfig } from "../content";
import { MarketDashboard } from "./MarketDashboard";

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

  return (
    <MarketDashboard
      config={hydrateDashboard(config, "en", viewModel)}
      chineseConfig={hydrateDashboard(chineseConfig, "zh", viewModel)}
      sourceBundle={viewModel.sourceBundles[config.slug]}
      edition={edition}
      pageEdition={pageEdition}
    />
  );
}
