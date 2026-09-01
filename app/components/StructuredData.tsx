import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_ORIGIN } from "../seo";

function canonicalStructuredDataUrl(path: string): string {
  const normalized = path === "/" ? "/" : path.endsWith("/") ? path : `${path}/`;
  return new URL(normalized, SITE_ORIGIN).href;
}

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replaceAll("<", "\\u003c"),
      }}
    />
  );
}

export function SiteStructuredData() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_ORIGIN}/#organization`,
            name: SITE_NAME,
            url: SITE_ORIGIN,
            logo: `${SITE_ORIGIN}/favicon.svg`,
            description:
              "Bilingual weekly AI market intelligence across equities, compute, energy, model economics, enterprise agents, and power semiconductors.",
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_ORIGIN}/#website`,
            url: SITE_ORIGIN,
            name: SITE_NAME,
            publisher: { "@id": `${SITE_ORIGIN}/#organization` },
            inLanguage: ["zh-Hant", "en"],
          },
        ],
      }}
    />
  );
}

export function ReportStructuredData({
  path,
  headline,
  description,
  dateModified,
}: {
  path: string;
  headline: string;
  description: string;
  dateModified: string;
}) {
  const url = canonicalStructuredDataUrl(path);
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        mainEntityOfPage: url,
        url,
        headline,
        description,
        image: DEFAULT_OG_IMAGE,
        datePublished: dateModified,
        dateModified,
        inLanguage: ["zh-Hant", "en"],
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        isAccessibleForFree: true,
      }}
    />
  );
}

export function CollectionStructuredData({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}) {
  const url = canonicalStructuredDataUrl(path);
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        url,
        name,
        description,
        inLanguage: ["zh-Hant", "en"],
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      }}
    />
  );
}
