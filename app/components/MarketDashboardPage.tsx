import { createMarketViewModel, loadMarketViewModel } from "../../market-data/view-model";
import type { MarketSnapshot } from "../../market-data/types";
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
import type { EditionMeta, ReaderEditionMeta } from "../../market-data/view-model";
import { BriefPillarIndex } from "./BriefPillarIndex";
import { configuredNewsletterEndpoint } from "../newsletter";

function toReaderEdition({
  cadence,
  cadenceLabel,
  dataCutoff,
  generatedAt,
}: EditionMeta): ReaderEditionMeta {
  return { cadence, cadenceLabel, dataCutoff, generatedAt };
}

export async function MarketDashboardPage({
  config,
  chineseConfig,
  locale = "zh",
  snapshot,
  routePath,
  alternateRoutePath,
  showPillarIndex = true,
}: {
  config: DashboardConfig;
  chineseConfig: DashboardConfig;
  locale?: "zh" | "en";
  snapshot?: MarketSnapshot;
  routePath?: string;
  alternateRoutePath?: string;
  showPillarIndex?: boolean;
}) {
  const viewModel = snapshot
    ? createMarketViewModel(snapshot, { historical: true })
    : await loadMarketViewModel();
  const historical = snapshot !== undefined;
  const edition = {
    en: toReaderEdition(viewModel.getEditionMeta("en")),
    zh: toReaderEdition(viewModel.getEditionMeta("zh")),
  };
  const pageEdition = {
    en: viewModel.getPageMeta(config.slug, "en"),
    zh: viewModel.getPageMeta(config.slug, "zh"),
  };
  const basePath = config.slug as DashboardPath;
  const path = routePath ?? (locale === "en" ? (basePath === "/" ? "/en" : `/en${basePath}`) : basePath);
  const hydratedChineseConfig = normalizeTaiwanCopy(
    hydrateDashboard(chineseConfig, "zh", viewModel, { historical }),
  );
  const localizedSourceBundle = normalizeTaiwanCopy(
    viewModel.sourceBundles[config.slug],
  );

  return (
    <>
      <span
        hidden
        data-market-route-identity={`${viewModel.snapshot.runId} ${viewModel.snapshot.dataCutoff}`}
      />
      <ReportStructuredData
        path={path}
        headline={historical ? pageEdition[locale].report.title : dashboardHeadings[basePath][locale]}
        description={historical ? pageEdition[locale].report.summary : (locale === "en" ? pageSeoEn : pageSeo)[basePath].description}
        dateModified={viewModel.snapshot.dataCutoff}
      />
      <MarketDashboard
        config={hydrateDashboard(config, "en", viewModel, { historical })}
        chineseConfig={hydratedChineseConfig}
        sourceBundle={localizedSourceBundle}
        edition={edition}
        pageEdition={pageEdition}
        initialLocale={locale}
        alternateLocaleHref={alternateRoutePath}
        newsletterEndpoint={configuredNewsletterEndpoint()}
        historical={historical}
      />
      {showPillarIndex ? <BriefPillarIndex pillar={basePath} locale={locale} /> : null}
    </>
  );
}
