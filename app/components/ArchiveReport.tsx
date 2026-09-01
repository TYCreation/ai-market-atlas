import Link from "next/link";
import type { MonthlyArchive } from "../../market-data/monthly.ts";
import type { SourceRecord } from "../../market-data/types.ts";
import type { FalsifiableRisk } from "../../market-data/types.ts";
import { SiteCredit } from "./SiteCredit";
import { TaipeiTime } from "./MetricProvenance";

function isFalsifiableRisk(value: MonthlyArchive["risks"][number]): value is FalsifiableRisk {
  return typeof value === "object" && value !== null && "condition" in value && "by" in value && "comparison" in value && "consequence" in value;
}

function monthLabel(month: string, locale: "zh" | "en") {
  const [year, monthNumber] = month.split("-");
  return locale === "zh" ? `${year} 年 ${Number(monthNumber)} 月` : `${month} `;
}

function equityName(metricId: string) {
  return metricId.split(".")[1]?.toUpperCase() ?? metricId;
}

export function ArchiveReport({
  archive,
  sources,
  locale = "zh",
}: {
  archive: MonthlyArchive;
  sources: SourceRecord[];
  locale?: "zh" | "en";
}) {
  const titleZh = `${monthLabel(archive.month, "zh")}市場封存`;
  const titleEn = `${monthLabel(archive.month, "en")}market archive`;
  const legacyNotes = archive.risks.filter((risk) => !isFalsifiableRisk(risk));
  const analystNotes = archive.analystNotes ?? legacyNotes;
  const risks = archive.risks.filter(isFalsifiableRisk);

  return (
    <main className="archive-main">
      <span hidden data-archive-route-identity>
        {archive.runId} {archive.dataCutoff}
      </span>
      <Link className="archive-back" href={locale === "en" ? "/en/archive" : "/archive"}>
        ← {locale === "en" ? "Monthly archives" : "月度市場封存"}
      </Link>

      <header className="archive-header">
        <p className="eyebrow">{locale === "en" ? "Permanent monthly record" : "月度市場封存 · Permanent monthly record"}</p>
        <h1>{locale === "en" ? titleEn : titleZh}</h1>
        {locale === "zh" ? <p className="archive-title-en">{titleEn}</p> : null}
        <p className="archive-summary">{archive.summary[locale]}</p>
        <p className="archive-meta" data-data-cutoff={archive.dataCutoff}>
          {locale === "en" ? "Data cutoff" : "資料截止"} · <TaipeiTime value={archive.dataCutoff} locale={locale} />
        </p>
      </header>

      <section className="archive-section" aria-labelledby="archive-performance">
        <div className="archive-section-head">
          <div>
            <p className="section-kicker">01 · 月度表現 / Monthly performance</p>
            <h2 id="archive-performance">{locale === "en" ? "Market basket and tracked equities" : "市場籃子與主要股票"}</h2>
          </div>
        </div>
        <div className="archive-basket">
          <span>{locale === "en" ? "AI equity basket" : "AI 股票籃子"}</span>
          <strong>{archive.basketChange.display[locale]}</strong>
        </div>
        <div className="archive-equities">
          {archive.equityChanges.map((metric) => (
            <article className="archive-equity" key={metric.id}>
              <span>{equityName(metric.id)}</span>
              <strong>{metric.display[locale]}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="archive-section" aria-labelledby="archive-thesis">
        <div className="archive-section-head">
          <div>
            <p className="section-kicker">02 · 論點變化 / Thesis changes</p>
            <h2 id="archive-thesis">{locale === "en" ? "Core thesis movements during the month" : "本月核心論點"}</h2>
          </div>
        </div>
        {archive.thesisChanges.length === 0 ? (
          <p className="archive-empty">{locale === "en" ? "No thesis stance changes were recorded this month." : "本月沒有已記錄的論點立場變更。"}</p>
        ) : (
          <div className="archive-change-list">
            {archive.thesisChanges.map((change) => (
              <article className="archive-change" key={change.page}>
                <p>{change.page} · {change.from} → {change.to}</p>
                <strong>{change.explanation[locale]}</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="archive-signal-grid">
        <section className="archive-section" aria-labelledby="archive-catalysts">
          <div className="archive-section-head">
            <div>
              <p className="section-kicker">03 · 催化劑 / Catalysts</p>
              <h2 id="archive-catalysts">{locale === "en" ? "Forward catalysts" : "後續催化劑"}</h2>
            </div>
          </div>
          {archive.catalysts.length === 0 ? (
            <p className="archive-empty">{locale === "en" ? "No catalysts were recorded this month." : "本月沒有已記錄的催化劑。"}</p>
          ) : (
            <ul className="archive-list">
              {archive.catalysts.map((item, index) => <li key={index}>{item[locale]}</li>)}
            </ul>
          )}
        </section>

        <section className="archive-section" aria-labelledby="archive-risks">
          <div className="archive-section-head">
            <div>
              <p className="section-kicker">04 · {analystNotes.length > 0 ? "分析註記 / Analyst notes" : "風險 / Risks"}</p>
              <h2 id="archive-risks">{analystNotes.length > 0 ? (locale === "en" ? "Analyst notes" : "分析註記") : (locale === "en" ? "Falsification risks" : "可驗證的風險")}</h2>
            </div>
          </div>
          <ul className="archive-list">
            {analystNotes.length > 0
              ? analystNotes.map((item, index) => <li key={index}>{item[locale]}</li>)
              : risks.map((risk, index) => <li key={index}>{risk.condition[locale]}</li>)}
          </ul>
          {analystNotes.length > 0 && risks.length > 0 ? (
            <>
              <p className="section-kicker">{locale === "en" ? "Falsification risks" : "可驗證的風險"}</p>
              <ul className="archive-list">
                {risks.map((risk, index) => <li key={index}>
                  {risk.condition[locale]} {risk.consequence[locale]} · {risk.by} · {risk.comparison.metricId} {risk.comparison.operator} {risk.comparison.value}{risk.comparison.unit}
                </li>)}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <section className="archive-section archive-sources" aria-labelledby="archive-sources">
        <div className="archive-section-head">
          <div>
            <p className="section-kicker">05 · 完整公開來源 / Complete public sources</p>
            <h2 id="archive-sources">{locale === "en" ? "Complete public sources" : "完整公開來源"}</h2>
          </div>
        </div>
        <div className="archive-source-list">
          {sources.map((source) => (
            <article className="archive-source" id={`archive-source-${source.id}`} key={source.id}>
              <span>{source.kind.toUpperCase()}</span>
              <div>
                <strong>{source.publisher}</strong>
                <p>{source.title}</p>
                <p>{source.scope[locale]}</p>
              </div>
              {source.url ? <a href={source.url} rel="noreferrer" target="_blank">{locale === "en" ? "Open source" : "開啟來源"} ↗</a> : <em>ATLAS model</em>}
            </article>
          ))}
        </div>
      </section>
      <SiteCredit />
    </main>
  );
}
