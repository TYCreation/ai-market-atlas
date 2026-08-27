"use client";

import { useState } from "react";
import type { EquityDeepDiveConfig } from "../content";
import { EditionStatus } from "./EditionStatus";
import { MarketDelta } from "./MarketDelta";
import { MetricProvenance, TaipeiTime } from "./MetricProvenance";

type Locale = "zh" | "en";
type SectorKey = EquityDeepDiveConfig["sectors"][number]["key"];
type FilterKey = "all" | SectorKey;

const copy = {
  zh: {
    marketKicker: "04 · 股票市場監測",
    marketTitle: "領漲結構與相對強弱",
    updated: "更新",
    all: "全部",
    week: "一週",
    month: "一個月",
    breadth: "市場廣度",
    filterLabel: "依 AI 市場主題篩選股票",
    stockTitle: "AI 股票觀察清單",
    stockColumns: [
      "股票",
      "股價",
      "一週",
      "一個月",
      "相對強度",
      "預估本益比",
      "營收成長",
      "催化劑",
      "主要風險",
      "信號",
    ],
    catalystsKicker: "05 · 催化劑行事曆",
    catalystsTitle: "未來四週的市場驗證點",
    basketKicker: "06 · AI 主題投資籃子",
    basketTitle: "從單一股票轉向產業曝險",
    performance: "30 日表現",
    risk: "風險",
    constituents: "成分股",
    riskKicker: "07 · 風險雷達",
    riskTitle: "目前最需要防守的地方",
    riskLevels: { high: "高", medium: "中", low: "低" },
  },
  en: {
    marketKicker: "04 · Equity market monitor",
    marketTitle: "Leadership and relative strength",
    updated: "Updated",
    all: "All",
    week: "1 week",
    month: "1 month",
    breadth: "Breadth",
    filterLabel: "Filter equities by AI market theme",
    stockTitle: "AI equity watchlist",
    stockColumns: [
      "Equity",
      "Price",
      "1 week",
      "1 month",
      "Relative strength",
      "Forward P/E",
      "Revenue growth",
      "Catalyst",
      "Primary risk",
      "Signal",
    ],
    catalystsKicker: "05 · Catalyst calendar",
    catalystsTitle: "Market proof points over the next four weeks",
    basketKicker: "06 · AI thematic baskets",
    basketTitle: "From single names to industry exposure",
    performance: "30-day performance",
    risk: "Risk",
    constituents: "Constituents",
    riskKicker: "07 · Risk radar",
    riskTitle: "Where defense matters now",
    riskLevels: { high: "High", medium: "Medium", low: "Low" },
  },
} as const;

export function EquityMarketDeepDive({
  data,
  locale,
}: {
  data: EquityDeepDiveConfig;
  locale: Locale;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const ui = copy[locale];
  const visibleEquities =
    filter === "all"
      ? data.equities
      : data.equities.filter((equity) => equity.sector === filter);

  return (
    <>
      <section className="section">
        <div className="section-head equity-section-head">
          <div>
            <p className="section-kicker">{ui.marketKicker}</p>
            <h2>{ui.marketTitle}</h2>
          </div>
          <span className="deep-dive-updated">
            {ui.updated} · <TaipeiTime value={data.updated} locale={locale} />
          </span>
        </div>

        <div className="equity-sector-grid">
          {data.sectors.map((sector) => (
            <article
              className={`equity-sector-card ${filter === sector.key ? "active" : ""}`}
              key={sector.key}
            >
              <div className="equity-sector-top">
                <h3>{sector.name}</h3>
                <span>{sector.signal}</span>
              </div>
              <div className="equity-sector-returns">
                <div>
                  <span>{ui.week}</span>
                  <strong><MarketDelta value={sector.week} /></strong>
                </div>
                <div>
                  <span>{ui.month}</span>
                  <strong><MarketDelta value={sector.month} /></strong>
                </div>
                <div>
                  <span>{ui.breadth}</span>
                  <strong>{sector.breadth}%</strong>
                </div>
              </div>
              <span className="equity-breadth-track" aria-hidden="true">
                <span style={{ width: `${sector.breadth}%` }} />
              </span>
            </article>
          ))}
        </div>

        <div className="equity-screener">
          <div className="equity-screener-head">
            <h3>{ui.stockTitle}</h3>
            <div className="equity-filters" aria-label={ui.filterLabel}>
              <button
                className={filter === "all" ? "active" : ""}
                type="button"
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
              >
                {ui.all}
              </button>
              {data.sectors.map((sector) => (
                <button
                  className={filter === sector.key ? "active" : ""}
                  key={sector.key}
                  type="button"
                  onClick={() => setFilter(sector.key)}
                  aria-pressed={filter === sector.key}
                >
                  {sector.name}
                </button>
              ))}
            </div>
          </div>

          <div className="table-panel equity-table-panel">
            <table className="market-table equity-table">
              <thead>
                <tr>
                  {ui.stockColumns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEquities.map((equity) => (
                  <tr key={equity.ticker}>
                    <td>
                      <div className="equity-name">
                        <strong>{equity.ticker}</strong>
                        <span>{equity.company}</span>
                      </div>
                    </td>
                    <td>
                      {equity.price}
                      {equity.stockMetricViews?.price ? <MetricProvenance metric={equity.stockMetricViews.price} locale={locale} /> : null}
                      <EditionStatus locale={locale} metricStatus={equity.stockMetricStatuses?.price} />
                    </td>
                    <td>
                      <MarketDelta value={equity.week} />
                      {equity.stockMetricViews?.weekReturn ? <MetricProvenance metric={equity.stockMetricViews.weekReturn} locale={locale} /> : null}
                      <EditionStatus locale={locale} metricStatus={equity.stockMetricStatuses?.weekReturn} />
                    </td>
                    <td>
                      <MarketDelta value={equity.month} />
                      {equity.stockMetricViews?.monthReturn ? <MetricProvenance metric={equity.stockMetricViews.monthReturn} locale={locale} /> : null}
                      <EditionStatus locale={locale} metricStatus={equity.stockMetricStatuses?.monthReturn} />
                    </td>
                    <td>
                      <div className="strength-cell">
                        <span>{equity.strength}</span>
                        <i aria-hidden="true">
                          <i style={{ width: `${equity.strength}%` }} />
                        </i>
                      </div>
                    </td>
                    <td>{equity.forwardPe}</td>
                    <td><MarketDelta value={equity.revenueGrowth} /></td>
                    <td>{equity.catalyst}</td>
                    <td>{equity.risk}</td>
                    <td>
                      <span className="table-pill">{equity.stance}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.catalystsKicker}</p>
            <h2>{ui.catalystsTitle}</h2>
          </div>
        </div>
        <div className="catalyst-grid">
          {data.catalysts.map((item, index) => (
            <article className="catalyst-card" key={`${item.date}-${item.event}`}>
              <div className="catalyst-date">
                <span>0{index + 1}</span>
                <strong>{item.date}</strong>
              </div>
              <h3>{item.event}</h3>
              <span className="catalyst-companies">{item.companies}</span>
              <p>{item.impact}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.basketKicker}</p>
            <h2>{ui.basketTitle}</h2>
          </div>
        </div>
        <div className="basket-grid">
          {data.baskets.map((basket, index) => (
            <article className="basket-card" key={basket.name}>
              <span className="basket-index">0{index + 1}</span>
              <h3>{basket.name}</h3>
              <p>{basket.focus}</p>
              <div className="basket-metrics">
                <div>
                  <span>{ui.performance}</span>
                  <strong><MarketDelta value={basket.performance} /></strong>
                </div>
                <div>
                  <span>{ui.risk}</span>
                  <strong>{basket.risk}</strong>
                </div>
              </div>
              <div className="basket-tickers" aria-label={ui.constituents}>
                {basket.tickers.map((ticker) => (
                  <span key={ticker}>{ticker}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.riskKicker}</p>
            <h2>{ui.riskTitle}</h2>
          </div>
        </div>
        <div className="risk-grid">
          {data.risks.map((risk) => (
            <article className={`risk-card ${risk.level}`} key={risk.title}>
              <div className="risk-card-top">
                <span>{ui.riskLevels[risk.level]}</span>
                <strong>{risk.metric}</strong>
              </div>
              <h3>{risk.title}</h3>
              <p>{risk.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
