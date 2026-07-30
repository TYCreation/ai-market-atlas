"use client";

import Link from "next/link";
import { useState } from "react";
import type { DashboardConfig } from "../content";

const navItems = [
  { href: "/", label: "Market Pulse" },
  { href: "/compute", label: "Compute & Chips" },
  { href: "/energy", label: "Data Centers & Energy" },
  { href: "/models", label: "Models & Agents" },
];

const horizons = ["30D", "Q3", "2027"] as const;

export function MarketDashboard({ config }: { config: DashboardConfig }) {
  const [horizon, setHorizon] = useState<(typeof horizons)[number]>("Q3");

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AI Market Atlas home">
          <span className="brand-mark" aria-hidden="true" />
          <strong>AI / ATLAS</strong>
          <span>Market intelligence</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              className={`nav-link ${config.slug === item.href ? "active" : ""}`}
              href={item.href}
              key={item.href}
              aria-current={config.slug === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="status" aria-label="Brief status">
          <span className="status-dot" aria-hidden="true" />
          Intelligence brief · July 2026
        </div>
      </header>

      <main className="main">
        <section className="masthead">
          <div className="masthead-copy">
            <p className="eyebrow">{config.eyebrow}</p>
            <h1>{config.title}</h1>
            <p className="masthead-summary">{config.summary}</p>
            <div className="masthead-meta">
              <span className="signal-badge">Signal · {config.signal}</span>
              <span className="edition">Issue 07.26 · Updated weekly</span>
            </div>
          </div>

          <div className="signal-orbit" aria-label={`${config.orbitLabel}: ${config.orbitValue}`}>
            <span className="orbit-axis" aria-hidden="true" />
            <span className="orbit-dot one" aria-hidden="true" />
            <span className="orbit-dot two" aria-hidden="true" />
            <span className="orbit-dot three" aria-hidden="true" />
            <div className="orbit-core">
              <strong>{config.orbitValue}</strong>
              <span>{config.orbitLabel}</span>
            </div>
          </div>
        </section>

        <section className="metric-strip" aria-label="Headline metrics">
          {config.kpis.map((kpi) => (
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
              <p className="section-kicker">01 · Executive synthesis</p>
              <h2>The decision layer</h2>
            </div>
            <div className="horizon-selector" aria-label="Select analysis horizon">
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
              <span className="brief-number">Core thesis / 01</span>
              <h3>{config.thesis.title}</h3>
              <p>{config.thesis.body}</p>
              <div className="tag-row" aria-label="Thesis themes">
                {config.thesis.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </article>

            <aside className="panel chart-panel" aria-label={config.chart.label}>
              <span className="panel-label">{config.chart.label} · {horizon}</span>
              <div className="bar-chart" aria-hidden="true">
                {config.chart.values.map((value, index) => (
                  <span
                    className={`bar ${index === config.chart.values.length - 1 ? "hot" : ""}`}
                    key={`${value}-${index}`}
                    style={{ height: `${Math.max(14, value * (horizon === "2027" ? 1.05 : horizon === "30D" ? 0.92 : 1))}%` }}
                  />
                ))}
              </div>
              <p className="chart-caption">{config.chart.caption[horizon]}</p>
            </aside>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">02 · Constraint map</p>
              <h2>Where pressure is building</h2>
            </div>
          </div>

          <div className="signal-grid">
            {config.clusters.map((cluster, index) => (
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
              <p className="section-kicker">03 · Market tracker</p>
              <h2>{config.table.title}</h2>
            </div>
          </div>

          <div className="table-panel">
            <table className="market-table">
              <thead>
                <tr>
                  {config.table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.table.rows.map((row) => (
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

        <section className="section">
          <div className="section-head">
            <div>
              <p className="section-kicker">04 · Leadership watchlist</p>
              <h2>Three questions for the room</h2>
            </div>
          </div>

          <div className="watch-grid">
            {config.watchlist.map((item) => (
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
            <strong>Method note.</strong> This prototype uses an illustrative July 2026
            dataset to demonstrate the report structure. Figures are directional market
            models, not audited financial data or investment advice.
          </p>
          <span className="footer-edition">AI Market Atlas · 07.26</span>
        </footer>
      </main>
    </div>
  );
}
