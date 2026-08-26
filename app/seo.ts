import type { Metadata } from "next";

export const SITE_ORIGIN = "https://aimarketatlas.net";
export const SITE_NAME = "AI Market Atlas";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-equities.jpg`;

export const pageSeo = {
  "/": {
    title: "AI 市場情報週報",
    description:
      "每週三、週六更新的中英文 AI 市場情報，追蹤 AI 股票、算力晶片、資料中心能源、模型經濟、企業代理與 SiC 功率半導體。",
  },
  "/stocks": {
    title: "AI 股票市場週報",
    description:
      "追蹤主要 AI 基礎設施與半導體股票的週度表現、財報催化劑、估值、市場廣度與風險。",
  },
  "/compute": {
    title: "AI 算力與半導體市場週報",
    description:
      "每週追蹤 GPU、客製加速器、先進封裝、HBM、晶圓產能與 AI 算力供應鏈的市場變化。",
  },
  "/energy": {
    title: "AI 資料中心能源市場週報",
    description:
      "追蹤 AI 資料中心電力需求、電網限制、併網時程、冷卻密度與能源供應瓶頸。",
  },
  "/models": {
    title: "AI 模型經濟與代理市場週報",
    description:
      "每週分析 AI 模型定價、推論成本、企業採用、代理成效與商業化訊號。",
  },
  "/sic": {
    title: "SiC 與 AI 資料中心功率市場週報",
    description:
      "追蹤 SiC 供應商、產能、800V 電力架構、AI 資料中心採用與功率半導體市場訊號。",
  },
  "/archive": {
    title: "AI 市場情報月度封存",
    description:
      "瀏覽 AI 股票、算力、能源、模型與功率半導體的永久月度市場報告、論點與公開資料來源。",
  },
} as const;

export const pageSeoEn: Record<keyof typeof pageSeo, { title: string; description: string }> = {
  "/": { title: "Weekly AI Market Intelligence", description: "A bilingual Wednesday and Saturday briefing on AI stocks, compute, data-center energy, model economics, enterprise agents, and SiC power semiconductors." },
  "/stocks": { title: "AI Stocks Weekly Market Report", description: "Track weekly performance, catalysts, earnings signals, valuation, breadth, and risk across leading AI infrastructure and semiconductor stocks." },
  "/compute": { title: "AI Compute & Semiconductor Market Report", description: "Weekly intelligence on GPUs, custom accelerators, advanced packaging, HBM, foundry capacity, and AI compute supply." },
  "/energy": { title: "AI Data Center Energy Market Report", description: "Track data-center electricity demand, grid constraints, interconnection timelines, cooling density, and AI infrastructure power bottlenecks." },
  "/models": { title: "AI Model Economics & Agents Report", description: "Weekly analysis of model pricing, inference economics, enterprise AI adoption, agent performance, and commercialization signals." },
  "/sic": { title: "SiC & AI Data Center Power Market Report", description: "Weekly SiC intelligence covering suppliers, capacity, 800V power architecture, adoption, and AI data-center demand." },
  "/archive": { title: "AI Market Intelligence Archive", description: "Browse permanent monthly AI market reports, theses, and public sources across stocks, compute, energy, models, and power semiconductors." },
};

export type DashboardPath =
  | "/"
  | "/stocks"
  | "/compute"
  | "/energy"
  | "/models"
  | "/sic";

export const dashboardHeadings: Record<
  DashboardPath,
  { zh: string; en: string }
> = {
  "/": {
    zh: "每週 AI 市場情報與產業趨勢",
    en: "Weekly AI market intelligence",
  },
  "/stocks": {
    zh: "AI 股票市場週報",
    en: "AI equity market weekly",
  },
  "/compute": {
    zh: "AI 算力與半導體市場週報",
    en: "AI compute and semiconductor market weekly",
  },
  "/energy": {
    zh: "AI 資料中心與能源市場週報",
    en: "AI data center and energy market weekly",
  },
  "/models": {
    zh: "AI 模型經濟與代理市場週報",
    en: "AI model economics and agents weekly",
  },
  "/sic": {
    zh: "SiC 與 AI 資料中心功率市場週報",
    en: "SiC and AI data center power market weekly",
  },
};

/**
 * `routeFile()` in the export writes `<route>/index.html`, so the server serves the
 * trailing-slash form and 301-redirects the slashless one. Every canonical, hreflang
 * and sitemap entry must name the address the server actually serves.
 */
function withTrailingSlash(path: string): string {
  return path === "/" ? "/" : path.endsWith("/") ? path : `${path}/`;
}

function chinesePath(route: string): string {
  return withTrailingSlash(route);
}

function englishPath(route: string): string {
  return withTrailingSlash(route === "/" ? "/en" : `/en${route}`);
}

function languageAlternates(route: string) {
  const zh = chinesePath(route);
  return { "zh-Hant": zh, en: englishPath(route), "x-default": zh };
}

/**
 * Applied per indexable page rather than in the root layout: vinext emits the layout's
 * metadata alongside a page's own instead of merging them, so a layout-level `robots`
 * would put a conflicting `index, follow` next to the not-found page's `noindex`.
 */
const INDEXABLE_ROBOTS = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
} as const;

export function buildMetadata(
  path: keyof typeof pageSeo,
  options?: { title?: string; description?: string; route?: string },
): Metadata {
  const seo = pageSeo[path];
  const title = options?.title ?? seo.title;
  const description = options?.description ?? seo.description;
  const absoluteTitle = `${title}｜${SITE_NAME}`;
  const route = options?.route ?? path;

  return {
    title: { absolute: absoluteTitle },
    description,
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: chinesePath(route),
      languages: languageAlternates(route),
    },
    openGraph: {
      title: absoluteTitle,
      description,
      type: "website",
      locale: "zh_TW",
      siteName: SITE_NAME,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1774,
          height: 887,
          alt: `${SITE_NAME} ${title}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: absoluteTitle,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export function buildEnglishMetadata(
  path: keyof typeof pageSeo,
  options?: { title?: string; description?: string; route?: string },
): Metadata {
  const seo = pageSeoEn[path];
  const title = options?.title ?? seo.title;
  const description = options?.description ?? seo.description;
  const absoluteTitle = `${title} | ${SITE_NAME}`;
  const route = options?.route ?? path;
  return {
    title: { absolute: absoluteTitle },
    description,
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: englishPath(route),
      languages: languageAlternates(route),
    },
    openGraph: { title: absoluteTitle, description, type: "website", locale: "en_US", siteName: SITE_NAME, images: [{ url: DEFAULT_OG_IMAGE, width: 1774, height: 887, alt: `${SITE_NAME} ${title}` }] },
    twitter: { card: "summary_large_image", title: absoluteTitle, description, images: [DEFAULT_OG_IMAGE] },
  };
}
