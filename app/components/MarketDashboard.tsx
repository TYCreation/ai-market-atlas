"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DashboardConfig } from "../content";
import type { SourceBundle } from "../sources";
import { EquityMarketDeepDive } from "./EquityMarketDeepDive";
import {
  EditionStatus,
  type LocalizedEditionMeta,
  type LocalizedPageEdition,
} from "./EditionStatus";
import { SiCDeepDive } from "./SiCDeepDive";
import { WeeklyMarketBrief } from "./WeeklyMarketBrief";
import { MetricSources, SourcePanel } from "./SourcePanel";

type Locale = "zh" | "en";

const copy = {
  zh: {
    brandTag: "市場情報",
    nav: [
      { href: "/", label: "市場脈動" },
      { href: "/stocks", label: "AI 股票市場" },
      { href: "/compute", label: "算力與晶片" },
      { href: "/energy", label: "資料中心與能源" },
      { href: "/models", label: "模型與代理" },
      { href: "/sic", label: "SiC 與功率半導體" },
    ],
    homeLabel: "AI Market Atlas 首頁",
    navLabel: "主要導覽",
    statusLabel: "簡報狀態",
    languageButton: "中文 / EN",
    languageLabel: "切換為英文",
    signal: "市場信號",
    sourcesPublished: "資料來源已公開",
    headlineMetrics: "核心指標",
    sectionOneKicker: "01 · 高層摘要",
    sectionOneTitle: "決策層",
    horizonLabel: "選擇分析期間",
    coreThesis: "核心論點 / 01",
    thesisThemes: "論點主題",
    sectionTwoKicker: "02 · 制約地圖",
    sectionTwoTitle: "壓力正在何處累積",
    sectionThreeKicker: "03 · 市場追蹤",
    sectionFourKicker: "04 · 領導者觀察清單",
    sectionFourTitle: "會議室裡的三個問題",
    methodLabel: "方法說明。",
    archiveLink: "月度封存",
    method:
      "本頁使用已驗證並發布的市場快照。模型數字用於方向性比較，並非經稽核財務資料或投資建議。",
  },
  en: {
    brandTag: "Market intelligence",
    nav: [
      { href: "/", label: "Market Pulse" },
      { href: "/stocks", label: "AI Equity Market" },
      { href: "/compute", label: "Compute & Chips" },
      { href: "/energy", label: "Data Centers & Energy" },
      { href: "/models", label: "Models & Agents" },
      { href: "/sic", label: "SiC & Power" },
    ],
    homeLabel: "AI Market Atlas home",
    navLabel: "Primary navigation",
    statusLabel: "Brief status",
    languageButton: "中文",
    languageLabel: "切換為繁體中文",
    signal: "Signal",
    sourcesPublished: "Sources published",
    headlineMetrics: "Headline metrics",
    sectionOneKicker: "01 · Executive synthesis",
    sectionOneTitle: "The decision layer",
    horizonLabel: "Select analysis horizon",
    coreThesis: "Core thesis / 01",
    thesisThemes: "Thesis themes",
    sectionTwoKicker: "02 · Constraint map",
    sectionTwoTitle: "Where pressure is building",
    sectionThreeKicker: "03 · Market tracker",
    sectionFourKicker: "04 · Leadership watchlist",
    sectionFourTitle: "Three questions for the room",
    methodLabel: "Method note.",
    archiveLink: "Monthly archive",
    method:
      "This page uses a validated, promoted market snapshot. Modeled figures are for directional comparison, not audited financial data or investment advice.",
  },
} as const;

const horizons = ["30D", "Q3", "2027"] as const;
const localeEvent = "ai-atlas-locale-change";

function subscribeLocale(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(localeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(localeEvent, listener);
  };
}

function getStoredLocale(): Locale {
  const saved = window.localStorage.getItem("ai-atlas-locale");
  return saved === "en" ? "en" : "zh";
}

export function MarketDashboard({
  config,
  chineseConfig,
  sourceBundle,
  edition,
  pageEdition,
}: {
  config: DashboardConfig;
  chineseConfig: DashboardConfig;
  sourceBundle: SourceBundle;
  edition: LocalizedEditionMeta;
  pageEdition: LocalizedPageEdition;
}) {
  const [horizon, setHorizon] = useState<(typeof horizons)[number]>("Q3");
  const locale = useSyncExternalStore(subscribeLocale, getStoredLocale, () => "zh");
  const activeConfig = locale === "zh" ? chineseConfig : config;
  const ui = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-Hant" : "en";
  }, [locale]);

  function toggleLocale() {
    const nextLocale: Locale = locale === "zh" ? "en" : "zh";
    window.localStorage.setItem("ai-atlas-locale", nextLocale);
    window.dispatchEvent(new Event(localeEvent));
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label={ui.homeLabel}>
          <span className="brand-mark" aria-hidden="true" />
          <strong>AI / ATLAS</strong>
          <span>{ui.brandTag}</span>
        </Link>

        <nav className="primary-nav" aria-label={ui.navLabel}>
          {ui.nav.map((item) => (
            <Link
              className={`nav-link ${activeConfig.slug === item.href ? "active" : ""}`}
              href={item.href}
              key={item.href}
              aria-current={activeConfig.slug === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="status" aria-label={ui.statusLabel}>
            <span className="status-dot" aria-hidden="true" />
            {edition[locale].cadenceLabel} · {edition[locale].dataCutoff.slice(0, 10)}
          </div>
          <button
            className="language-switch"
            type="button"
            onClick={toggleLocale}
            aria-label={ui.languageLabel}
          >
            <span aria-hidden="true">文</span>
            {ui.languageButton}
          </button>
        </div>
      </header>

      <main className="main">
        <section className="masthead">
          <div className="masthead-copy">
            <p className="eyebrow">{activeConfig.eyebrow}</p>
            <h1>{activeConfig.title}</h1>
            <p className="masthead-summary">{activeConfig.summary}</p>
            <div className="masthead-meta">
              <span className="signal-badge">{ui.signal} · {activeConfig.signal}</span>
              <span className="edition">{edition[locale].runId}</span>
              <a className="source-jump" href="#sources">
                {ui.sourcesPublished} <span aria-hidden="true">↓</span>
              </a>
            </div>
            <EditionStatus locale={locale} edition={edition} page={pageEdition} />
          </div>

          <div className="signal-orbit" aria-label={`${activeConfig.orbitLabel}: ${activeConfig.orbitValue}`}>
            <span className="orbit-axis" aria-hidden="true" />
            <span className="orbit-dot one" aria-hidden="true" />
            <span className="orbit-dot two" aria-hidden="true" />
            <span className="orbit-dot three" aria-hidden="true" />
            <div className="orbit-core">
              <strong>{activeConfig.orbitValue}</strong>
              <span>{activeConfig.orbitLabel}</span>
            </div>
          </div>
        </section>

        <section className="metric-strip" aria-label={ui.headlineMetrics}>
          {activeConfig.kpis.map((kpi, index) => (
            <article className="metric" key={kpi.label}>
              <span className="metric-label">{kpi.label}</span>
              <div className="metric-value">{kpi.value}</div>
              <EditionStatus locale={locale} metricStatus={kpi.status} />
              <div className="metric-foot">
                <span>{kpi.foot}</span>
                <span className="metric-delta">{kpi.delta}</span>
              </div>
              <MetricSources
                bundle={sourceBundle}
                index={index}
                locale={locale}
                metricId={kpi.metricId}
              />
            </article>
          ))}
        </section>

        {activeConfig.report &&
        (activeConfig.report.supportingEvidence.length > 0 ||
          activeConfig.report.opposingEvidence.length > 0 ||
          activeConfig.report.catalysts.length > 0) ? (
          <section className="section report-evidence">
            <div className="section-head">
              <div>
                <p className="section-kicker">
                  {locale === "zh" ? "本期證據" : "Edition evidence"}
                </p>
                <h2>{locale === "zh" ? "支持、反向與催化信號" : "Supporting, opposing, and catalyst signals"}</h2>
              </div>
            </div>
            <div className="watch-grid">
              {[
                ...activeConfig.report.supportingEvidence.map((item) => ({
                  kind: locale === "zh" ? "支持證據" : "Supporting evidence",
                  text: item.text,
                  key: item.metricIds.join("-"),
                })),
                ...activeConfig.report.opposingEvidence.map((item) => ({
                  kind: locale === "zh" ? "反向證據" : "Opposing evidence",
                  text: item.text,
                  key: item.metricIds.join("-"),
                })),
                ...activeConfig.report.catalysts.map((text, index) => ({
                  kind: locale === "zh" ? "催化劑" : "Catalyst",
                  text,
                  key: `catalyst-${index}`,
                })),
              ].map((item) => (
                <article className="watch-card" key={`${item.kind}-${item.key}`}>
                  <div className="watch-priority"><span>{item.kind}</span><span>↗</span></div>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeConfig.slug === "/" ? (
          <WeeklyMarketBrief locale={locale} />
        ) : null}

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">{ui.sectionOneKicker}</p>
              <h2>{ui.sectionOneTitle}</h2>
            </div>
            <div className="horizon-selector" aria-label={ui.horizonLabel}>
              {horizons.map((item) => (
                <button
                  className={horizon === item ? "active" : ""}
                  key={item}
                  onClick={() => setHorizon(item)}
                  type="button"
                  aria-pressed={horizon === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="brief-grid">
            <article className="panel brief-panel">
              <span className="brief-number">{ui.coreThesis}</span>
              <h3>{activeConfig.thesis.title}</h3>
              <p>{activeConfig.thesis.body}</p>
              <div className="tag-row" aria-label={ui.thesisThemes}>
                {activeConfig.thesis.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </article>

            <aside className="panel chart-panel" aria-label={activeConfig.chart.label}>
              <span className="panel-label">{activeConfig.chart.label} · {horizon}</span>
              <div className="bar-chart" aria-hidden="true">
                {activeConfig.chart.values.map((value, index) => (
                  <span
                    className={`bar ${index === activeConfig.chart.values.length - 1 ? "hot" : ""}`}
                    key={`${value}-${index}`}
                    style={{ height: `${Math.max(14, value * (horizon === "2027" ? 1.05 : horizon === "30D" ? 0.92 : 1))}%` }}
                  />
                ))}
              </div>
              <p className="chart-caption">{activeConfig.chart.caption[horizon]}</p>
            </aside>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">{ui.sectionTwoKicker}</p>
              <h2>{ui.sectionTwoTitle}</h2>
            </div>
          </div>

          <div className="signal-grid">
            {activeConfig.clusters.map((cluster, index) => (
              <article
                className={`signal-card ${cluster.critical ? "critical" : ""}`}
                key={cluster.name}
                style={{ "--score": `${cluster.score}%` } as React.CSSProperties}
              >
                <div className="signal-top">
                  <span className="signal-index">0{index + 1}</span>
                  <span className="signal-score">{cluster.score}</span>
                </div>
                <h3>{cluster.name}</h3>
                <p>{cluster.note}</p>
                <span className="signal-state">{cluster.state}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">{ui.sectionThreeKicker}</p>
              <h2>{activeConfig.table.title}</h2>
            </div>
          </div>

          <div className="table-panel">
            <table className="market-table">
              <thead>
                <tr>
                  {activeConfig.table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeConfig.table.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={`${row[0]}-${index}`}>
                        {index === 3 ? <span className="table-pill">{cell}</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {activeConfig.deepDive ? (
          <SiCDeepDive data={activeConfig.deepDive} locale={locale} />
        ) : null}

        {activeConfig.equityDive ? (
          <EquityMarketDeepDive data={activeConfig.equityDive} locale={locale} />
        ) : null}

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">
                {activeConfig.deepDive || activeConfig.equityDive
                  ? locale === "zh"
                    ? "08 · 領導者觀察清單"
                    : "08 · Leadership watchlist"
                  : ui.sectionFourKicker}
              </p>
              <h2>{ui.sectionFourTitle}</h2>
            </div>
          </div>

          <div className="watch-grid">
            {activeConfig.watchlist.map((item) => (
              <article className="watch-card" key={item.title}>
                <div className="watch-priority">
                  <span>{item.priority}</span>
                  <span>↗</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <span className="watch-owner">{item.owner}</span>
              </article>
            ))}
          </div>
        </section>

        <SourcePanel bundle={sourceBundle} locale={locale} />

        <footer className="footer">
          <p>
            <strong>{ui.methodLabel}</strong> {ui.method}
          </p>
          <Link className="footer-archive" href="/archive">{ui.archiveLink} ↗</Link>
          <span className="footer-edition">AI Market Atlas · {edition[locale].runId}</span>
        </footer>
      </main>
    </div>
  );
}
