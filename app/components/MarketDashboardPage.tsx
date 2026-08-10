import { loadMarketViewModel } from "../../market-data/view-model";
import { hydrateDashboard, type DashboardConfig } from "../content";
import {
  dashboardHeadings,
  pageSeo,
  pageSeoEn,
  type DashboardPath,
} from "../seo";
import { MarketDashboard } from "./MarketDashboard";
import { ReportStructuredData } from "./StructuredData";
import { normalizeTaiwanCopy } from "../taiwan-copy";

export async function MarketDashboardPage({
  config,
  chineseConfig,
  locale = "zh",
}: {
  config: DashboardConfig;
  chineseConfig: DashboardConfig;
  locale?: "zh" | "en";
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
  const basePath = config.slug as DashboardPath;
  const path = locale === "en" ? (basePath === "/" ? "/en" : `/en${basePath}`) : basePath;
  const hydratedChineseConfig = normalizeTaiwanCopy(
    hydrateDashboard(chineseConfig, "zh", viewModel),
  );
  const localizedSourceBundle = normalizeTaiwanCopy(
    viewModel.sourceBundles[config.slug],
  );

  return (
    <>
      <ReportStructuredData
        path={path}
        headline={dashboardHeadings[basePath][locale]}
        description={(locale === "en" ? pageSeoEn : pageSeo)[basePath].description}
        dateModified={viewModel.snapshot.dataCutoff}
      />
      <MarketDashboard
        config={hydrateDashboard(config, "en", viewModel)}
        chineseConfig={hydratedChineseConfig}
        sourceBundle={localizedSourceBundle}
        edition={edition}
        pageEdition={pageEdition}
        initialLocale={locale}
      />
    </>
  );
}
