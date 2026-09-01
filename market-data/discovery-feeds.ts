import type { EntityHub } from "./entity-pages.ts";
import type { PublishedBrief } from "./briefs.ts";

export const DISCOVERY_ARTIFACTS = ["/rss.xml", "/news-sitemap.xml", "/llms.txt"] as const;
export type DiscoveryArtifact = (typeof DISCOVERY_ARTIFACTS)[number];
export const DISCOVERY_ARTIFACT_CONTENT_TYPES: Record<DiscoveryArtifact, string> = {
  "/rss.xml": "application/rss+xml",
  "/news-sitemap.xml": "application/xml",
  "/llms.txt": "text/plain",
};
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1_000;
export const SITE_ORIGIN = "https://aimarketatlas.net";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asReferenceTime(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("news sitemap reference time is invalid");
  return time;
}

function briefTitle(brief: PublishedBrief, locale: "en" | "zh"): string {
  const title = brief.snapshot.pages["/"]?.report?.title?.[locale];
  return title || (locale === "en" ? `AI Market Atlas weekly brief — ${brief.date}` : `AI Market Atlas 每週快報 — ${brief.date}`);
}

function briefUrl(date: string, locale: "en" | "zh"): string {
  return `${SITE_ORIGIN}/${locale === "en" ? "en/" : ""}brief/${date}/`;
}

export function eligibleNewsBriefs(
  briefs: PublishedBrief[],
  referenceTime: string | Date,
): PublishedBrief[] {
  const reference = asReferenceTime(referenceTime);
  return briefs
    .filter((brief) => {
      const published = Date.parse(brief.snapshot.dataCutoff);
      return Number.isFinite(published) && published <= reference && reference - published <= NEWS_WINDOW_MS;
    })
    .sort((left, right) => right.snapshot.dataCutoff.localeCompare(left.snapshot.dataCutoff) || right.date.localeCompare(left.date));
}

export function buildRssXml(briefs: PublishedBrief[]): string {
  const entries = [...briefs]
    .sort((left, right) => right.snapshot.dataCutoff.localeCompare(left.snapshot.dataCutoff) || right.date.localeCompare(left.date))
    .map((brief) => {
      const url = briefUrl(brief.date, "zh");
      return [
        "  <item>",
        `    <title>${escapeXml(briefTitle(brief, "en"))}</title>`,
        `    <link>${url}</link>`,
        `    <guid isPermaLink="true">${url}</guid>`,
        `    <pubDate>${escapeXml(new Date(brief.snapshot.dataCutoff).toUTCString())}</pubDate>`,
        `    <description>${escapeXml(briefTitle(brief, "zh"))}</description>`,
        "  </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "  <title>AI Market Atlas</title>",
    `  <link>${SITE_ORIGIN}/</link>`,
    `  <atom:link href="${SITE_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>`,
    "  <description>週三、週六發布的雙語 AI 市場情報 / Bilingual AI market intelligence.</description>",
    entries,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function buildNewsSitemapXml(
  briefs: PublishedBrief[],
  referenceTime: string | Date,
): string {
  const entries = eligibleNewsBriefs(briefs, referenceTime)
    .map((brief) => [
      "  <url>",
      `    <loc>${briefUrl(brief.date, "zh")}</loc>`,
      "    <news:news>",
      "      <news:publication>",
      "        <news:name>AI Market Atlas</news:name>",
      "        <news:language>zh</news:language>",
      "      </news:publication>",
      `      <news:publication_date>${escapeXml(brief.snapshot.dataCutoff)}</news:publication_date>`,
      `      <news:title>${escapeXml(briefTitle(brief, "zh"))}</news:title>`,
      "    </news:news>",
      "  </url>",
    ].join("\n"))
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    entries,
    "</urlset>",
    "",
  ].join("\n");
}

export function buildLlmsTxt(
  briefs: PublishedBrief[],
  entities: Pick<EntityHub, "slug" | "name">[] = [],
): string {
  const lines = [
    "# AI Market Atlas",
    "",
    "AI Market Atlas is a bilingual (繁體中文 / English) weekly intelligence site covering AI equities, compute, data-center energy, model economics, enterprise agents, and SiC power semiconductors.",
    "The site publishes provenance-bound dated briefs and evidence-linked entity hubs. Modeled values are directional analysis, not audited financial data or investment advice.",
    "",
    "## Discovery feeds",
    "",
    `- RSS: ${SITE_ORIGIN}/rss.xml`,
    `- News sitemap (recent briefs): ${SITE_ORIGIN}/news-sitemap.xml`,
    `- XML sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
    "## Canonical sections",
    "",
    `- Market pulse: ${SITE_ORIGIN}/`,
    `- AI equity market: ${SITE_ORIGIN}/stocks/`,
    `- Compute and chips: ${SITE_ORIGIN}/compute/`,
    `- Data centers and energy: ${SITE_ORIGIN}/energy/`,
    `- Models and agents: ${SITE_ORIGIN}/models/`,
    `- SiC and power: ${SITE_ORIGIN}/sic/`,
    `- Monthly archive: ${SITE_ORIGIN}/archive/`,
    "",
    "## Permanent dated briefs",
    "",
    ...[...briefs].sort((left, right) => right.date.localeCompare(left.date)).flatMap((brief) => [
      `- ${brief.date}: ${briefUrl(brief.date, "zh")} · ${briefUrl(brief.date, "en")}`,
    ]),
    "",
    "## Entity hubs",
    "",
    ...[...entities].sort((left, right) => left.slug.localeCompare(right.slug)).map((entity) =>
      `- ${entity.name.en} / ${entity.name.zh}: ${SITE_ORIGIN}/entity/${entity.slug}/ · ${SITE_ORIGIN}/en/entity/${entity.slug}/`,
    ),
    "",
  ];
  return lines.join("\n");
}

// Explicit aliases make the artifact intent obvious to callers and keep the
// public API stable if feed names are used directly by deployment scripts.
export const generateRssXml = buildRssXml;
export const generateNewsSitemapXml = buildNewsSitemapXml;
export const generateLlmsTxt = buildLlmsTxt;
