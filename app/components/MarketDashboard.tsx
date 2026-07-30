"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardConfig } from "../content";
import { chineseDashboards } from "../content-zh";
import { EquityMarketDeepDive } from "./EquityMarketDeepDive";
import { SiCDeepDive } from "./SiCDeepDive";

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
    status: "情報簡報 · 2026 年 7 月",
    languageButton: "中文 / EN",
    languageLabel: "切換為英文",
    signal: "市場信號",
    edition: "07.26 期 · 每週更新",
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
    method:
      "本原型使用 2026 年 7 月的示意數據呈現報告架構。所有數字皆為方向性市場模型，並非經稽核財務資料或投資建議。",
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
    status: "Intelligence brief · July 2026",
    languageButton: "中文",
    languageLabel: "切換為繁體中文",
    signal: "Signal",
    edition: "Issue 07.26 · Updated weekly",
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
    method:
      "This prototype uses an illustrative July 2026 dataset to demonstrate the report structure. Figures are directional market models, not audited financial data or investment advice.",
  },
} as const;

const horizons = ["30D", "Q3", "2027"] as const;

export function MarketDashboard({ config }: { config: DashboardConfig }) {
  const [horizon, setHorizon] = useState<(typeof horizons)[number]>("Q3");
  const [locale, setLocale] = useState<Locale>("zh");
  const activeConfig = locale === "zh" ? chineseDashboards[config.slug] : config;
  const ui = copy[locale];

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("ai-atlas-locale");
    if (savedLocale === "zh" || savedLocale === "en") {
      setLocale(savedLocale);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-Hant" : "en";
  }, [locale]);

  function toggleLocale() {
    const nextLocale: Locale = locale === "zh" ? "en" : "zh";
    setLocale(nextLocale);
    window.localStorage.setItem("ai-atlas-locale", nextLocale);
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
            {ui.status}
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
              <span className="edition">{ui.edition}</span>
            </div>
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
          {activeConfig.kpis.map((kpi) => (
            <article className="metric" key={kpi.label}>
              <span className="metric-label">{kpi.label}</span>
              <div className="metric-value">{kpi.value}</div>
              <div className="metric-foot">
                <span>{kpi.foot}</span>
                <span className="metric-delta">{kpi.delta}</span>
              </div>
            </article>
          ))}
        </section>

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

        <footer className="footer">
          <p>
            <strong>{ui.methodLabel}</strong> {ui.method}
          </p>
          <span className="footer-edition">AI Market Atlas · 07.26</span>
        </footer>
      </main>
    </div>
  );
}
