import Link from "next/link";
import type { EntityHub } from "../../market-data/entity-pages";
import { ReportStructuredData } from "./StructuredData";

const pillarLabels = {
  "/": { en: "Market pulse", zh: "市場脈動" },
  "/stocks": { en: "AI stocks", zh: "AI 股票" },
  "/compute": { en: "Compute", zh: "算力" },
  "/energy": { en: "Energy", zh: "能源" },
  "/models": { en: "Models", zh: "模型" },
  "/sic": { en: "SiC", zh: "SiC" },
} as const;

export function EntityHubPage({ entity, locale }: { entity: EntityHub; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  const route = zh ? `/entity/${entity.slug}` : `/en/entity/${entity.slug}`;
  const title = zh ? `${entity.name.zh} 證據索引` : `${entity.name.en} evidence index`;
  const description = zh
    ? `${entity.name.zh}：保留市場快報中的可追溯指標與公開來源。`
    : `${entity.name.en}: traceable metrics and public sources in retained market briefs.`;
  const prefix = zh ? "" : "/en";
  return (
    <main className="entity-hub">
      <ReportStructuredData path={route} headline={title} description={description} dateModified={entity.lastModified} />
      <header>
        <p className="eyebrow">AI Market Atlas · Evidence index</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <time dateTime={entity.lastModified}>{entity.lastModified}</time>
      </header>
      <section aria-label={zh ? "相關主題" : "Related pillars"}>
        <h2>{zh ? "相關主題" : "Related pillars"}</h2>
        <ul>
          {entity.pillars.map((pillar) => <li key={pillar}><Link href={`${prefix}${pillar === "/" ? "" : pillar}` || prefix || "/"}>{pillarLabels[pillar][locale]}</Link></li>)}
        </ul>
      </section>
      <section aria-label={zh ? "歷史快報" : "Historical briefs"}>
        <h2>{zh ? "歷史快報" : "Historical briefs"}</h2>
        <ul>
          {entity.briefs.map((brief) => <li key={brief.date}>
            <Link href={`${prefix}/brief/${brief.date}`}><time dateTime={brief.dataCutoff}>{brief.date}</time></Link>
            <span>{brief.pillars.map((pillar) => pillarLabels[pillar][locale]).join(" · ")}</span>
          </li>)}
        </ul>
      </section>
      <section aria-label={zh ? "引用指標" : "Cited metrics"}>
        <h2>{zh ? "引用指標" : "Cited metrics"}</h2>
        <ul>
          {entity.metrics.map((metric) => <li key={`${metric.date}:${metric.id}`}>
            <time dateTime={metric.asOf}>{metric.date}</time><code>{metric.id}</code><span>{metric.display[locale]}</span>
          </li>)}
        </ul>
      </section>
      <section aria-label={zh ? "公開來源" : "Public sources"}>
        <h2>{zh ? "公開來源" : "Public sources"}</h2>
        <ul>
          {entity.sources.map((source) => <li id={`source-${source.id}`} key={source.id}>
            {source.url ? <a href={source.url}>{source.publisher}: {source.title}</a> : <span>{source.publisher}: {source.title}</span>}
          </li>)}
        </ul>
      </section>
    </main>
  );
}
