import type { DeepDiveConfig } from "../content";

type Locale = "zh" | "en";

const copy = {
  zh: {
    pulseKicker: "04 · 每週市場脈動",
    pulseTitle: "關鍵股票與市場規模",
    updated: "更新",
    day: "日",
    week: "週",
    range: "52 週區間",
    forecastTitle: "SiC 市場規模預測",
    forecastUnit: "十億美元",
    newsKicker: "05 · 產業動態",
    newsTitle: "近期重點新聞摘要",
    newsColumns: ["日期", "標題", "來源", "摘要", "標籤"],
    strategyKicker: "06 · 戰略定位",
    strategyTitle: "從 EV 紅海到 AI 藍海",
    roadmapTitle: "SiC 晶圓戰略路線圖",
    roadmapColumns: ["路線", "市場", "狀態", "機會"],
    propertiesTitle: "為什麼 SiC 適合 AI 電力與封裝？",
    propertiesColumns: ["特性", "SiC", "矽", "優勢"],
    playersTitle: "主要玩家與最新動態",
    playersColumns: ["公司", "定位", "最新動態", "信號"],
    thesisKicker: "07 · 投資論點",
    thesisTitle: "上行機會與下行風險",
    bullTitle: "Bull Case · 看多論點",
    bearTitle: "Bear Case · 看空論點",
  },
  en: {
    pulseKicker: "04 · Weekly market pulse",
    pulseTitle: "Key stocks and market scale",
    updated: "Updated",
    day: "Day",
    week: "Week",
    range: "52-week range",
    forecastTitle: "SiC market size forecast",
    forecastUnit: "USD billions",
    newsKicker: "05 · Industry developments",
    newsTitle: "Recent news digest",
    newsColumns: ["Date", "Title", "Source", "Summary", "Tags"],
    strategyKicker: "06 · Strategic position",
    strategyTitle: "From the EV red ocean to the AI blue ocean",
    roadmapTitle: "SiC wafer strategic roadmap",
    roadmapColumns: ["Route", "Market", "State", "Opportunity"],
    propertiesTitle: "Why SiC fits AI power and packaging",
    propertiesColumns: ["Property", "SiC", "Silicon", "Advantage"],
    playersTitle: "Key players and latest developments",
    playersColumns: ["Company", "Position", "Latest development", "Signal"],
    thesisKicker: "07 · Investment thesis",
    thesisTitle: "Upside opportunities and downside risks",
    bullTitle: "Bull case",
    bearTitle: "Bear case",
  },
} as const;

function DataTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: string[][];
}) {
  return (
    <div className="table-panel sic-table-panel">
      <table className="market-table sic-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row[0]}-${row[1]}`}>
              {row.map((cell, index) => (
                <td key={`${row[0]}-${index}`}>
                  {index === row.length - 1 ? (
                    <span className="table-pill">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SiCDeepDive({
  data,
  locale,
}: {
  data: DeepDiveConfig;
  locale: Locale;
}) {
  const ui = copy[locale];
  const maxForecast = Math.max(...data.forecast.map((item) => item.value));

  return (
    <>
      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.pulseKicker}</p>
            <h2>{ui.pulseTitle}</h2>
          </div>
          <span className="deep-dive-updated">
            {ui.updated} · {data.updated}
          </span>
        </div>

        <div className="sic-pulse-grid">
          <div className="sic-stock-grid">
            {data.stocks.map((stock) => (
              <article className="sic-stock-card" key={stock.ticker}>
                <div className="sic-stock-head">
                  <div>
                    <strong>{stock.ticker}</strong>
                    <span>{stock.market}</span>
                  </div>
                  <span className="sic-stock-price">{stock.price}</span>
                </div>
                <dl className="sic-stock-moves">
                  <div>
                    <dt>{ui.day}</dt>
                    <dd className={stock.day.startsWith("▲") ? "positive" : "negative"}>
                      {stock.day}
                    </dd>
                  </div>
                  <div>
                    <dt>{ui.week}</dt>
                    <dd className={stock.week.startsWith("▲") ? "positive" : "negative"}>
                      {stock.week}
                    </dd>
                  </div>
                  <div>
                    <dt>{ui.range}</dt>
                    <dd>{stock.range}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <article className="panel sic-forecast">
            <div className="sic-subhead">
              <h3>{ui.forecastTitle}</h3>
              <span>{ui.forecastUnit}</span>
            </div>
            <div className="forecast-bars" aria-label={`${ui.forecastTitle}, ${ui.forecastUnit}`}>
              {data.forecast.map((item) => (
                <div className="forecast-column" key={item.year}>
                  <span className="forecast-value">{item.value}</span>
                  <span
                    className="forecast-bar"
                    style={{ height: `${Math.max(9, (item.value / maxForecast) * 100)}%` }}
                  />
                  <span className="forecast-year">{item.year}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.newsKicker}</p>
            <h2>{ui.newsTitle}</h2>
          </div>
        </div>
        <DataTable
          columns={ui.newsColumns}
          rows={data.news.map((item) => [
            item.date,
            item.title,
            item.source,
            item.summary,
            item.tags.join(" · "),
          ])}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.strategyKicker}</p>
            <h2>{ui.strategyTitle}</h2>
          </div>
        </div>

        <div className="sic-subsection">
          <h3>{ui.roadmapTitle}</h3>
          <DataTable
            columns={ui.roadmapColumns}
            rows={data.roadmap.map((item) => [
              item.route,
              item.market,
              item.state,
              item.opportunity,
            ])}
          />
        </div>

        <div className="sic-section-grid">
          <div className="sic-subsection">
            <h3>{ui.propertiesTitle}</h3>
            <DataTable
              columns={ui.propertiesColumns}
              rows={data.properties.map((item) => [
                item.property,
                item.sic,
                item.silicon,
                item.advantage,
              ])}
            />
          </div>

          <div className="sic-subsection">
            <h3>{ui.playersTitle}</h3>
            <DataTable
              columns={ui.playersColumns}
              rows={data.players.map((item) => [
                item.company,
                item.position,
                item.development,
                item.signal,
              ])}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="section-kicker">{ui.thesisKicker}</p>
            <h2>{ui.thesisTitle}</h2>
          </div>
        </div>

        <div className="case-grid">
          <article className="case-panel">
            <span className="panel-label">{ui.bullTitle}</span>
            <ol className="case-list">
              {data.bull.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ol>
          </article>

          <article className="case-panel bear">
            <span className="panel-label">{ui.bearTitle}</span>
            <ol className="case-list">
              {data.bear.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </section>
    </>
  );
}
