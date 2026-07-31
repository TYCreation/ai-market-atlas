import type { Locale, SourceBundle, SourceReference } from "../sources";

const copy = {
  zh: {
    kicker: "09 · 資料來源與方法",
    title: "公開資料，可追溯假設",
    intro:
      "我們優先引用官方統計、監管申報、公司投資人資料與供應商定價。AI Atlas 的推估會明確標示，不會偽裝成原始公布數據。",
    reviewed: "最後查閱",
    primary: "原始來源優先",
    model: "模型數字明確標示",
    review: "自動審查後發布",
    open: "開啟原始資料",
    kinds: {
      atlas: "ATLAS 模型",
      official: "官方資料",
      company: "公司揭露",
      research: "研究報告",
      pricing: "官方定價",
      market: "市場資料",
    },
    metricSources: "來源",
    method:
      "頁面上的市場溫度、綜合指數、追蹤籃子與部分預測為編輯模型；它們用來比較方向，不是即時行情、官方統計或投資建議。",
    reviewMethod:
      "每週三與週六的候選資料都會接受自動化審查，檢查來源可用性、數值範圍、雙語完整性與內容追溯。只有審查結果為可自動發布，且內容雜湊與候選資料一致時，才會進入正式網站；來源衝突或異常變動會轉交人工確認。",
  },
  en: {
    kicker: "09 · Sources & methodology",
    title: "Public inputs, traceable assumptions",
    intro:
      "We prioritize official statistics, regulatory filings, investor materials, and provider pricing. AI Atlas estimates are explicitly labeled rather than presented as published facts.",
    reviewed: "Last reviewed",
    primary: "Primary sources first",
    model: "Modeled figures labeled",
    review: "Published after automated review",
    open: "Open original source",
    kinds: {
      atlas: "ATLAS model",
      official: "Official data",
      company: "Company disclosure",
      research: "Research",
      pricing: "Official pricing",
      market: "Market data",
    },
    metricSources: "Sources",
    method:
      "Market heat, composite indices, tracking baskets, and selected forecasts are editorial models for directional comparison—not live prices, official statistics, or investment advice.",
    reviewMethod:
      "Every Wednesday and Saturday candidate passes automated checks for source availability, value ranges, bilingual completeness, and traceability. Publication proceeds only after an auto-publish decision bound to the exact candidate; source conflicts and anomalous changes are escalated for human review.",
  },
} as const;

export function MetricSources({
  bundle,
  index,
  locale,
  metricId,
}: {
  bundle: SourceBundle;
  index: number;
  locale: Locale;
  metricId?: string;
}) {
  const ui = copy[locale];
  const sourceIds = bundle.kpiSources[index] ?? [];
  const sourceIndex = new Map(
    bundle.sources.map((source, sourcePosition) => [
      source.id,
      { source, sourcePosition: sourcePosition + 1 },
    ]),
  );

  return (
    <div
      className="metric-sources"
      aria-label={ui.metricSources}
      data-metric-id={metricId}
      id={metricId ? `metric-source-${metricId}` : undefined}
    >
      <span>{ui.metricSources}</span>
      {sourceIds.map((sourceId) => {
        const entry = sourceIndex.get(sourceId);
        if (!entry) return null;
        return (
          <a
            href={`#source-${sourceId}`}
            key={sourceId}
            title={`${entry.source.publisher}: ${entry.source.title}`}
          >
            S{entry.sourcePosition}
          </a>
        );
      })}
    </div>
  );
}

function SourceCard({
  source,
  index,
  locale,
}: {
  source: SourceReference;
  index: number;
  locale: Locale;
}) {
  const ui = copy[locale];
  const content = (
    <>
      <div className="source-card-top">
        <span className={`source-kind ${source.kind}`}>{ui.kinds[source.kind]}</span>
        <span className="source-index">S{index + 1}</span>
      </div>
      <p className="source-publisher">{source.publisher}</p>
      <h3>{source.title}</h3>
      <p className="source-scope">{source.scope[locale]}</p>
      <div className="source-card-foot">
        <span>{source.published}</span>
        {source.url ? <span>{ui.open} ↗</span> : null}
      </div>
    </>
  );

  return (
    <article className="source-card" id={`source-${source.id}`}>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {content}
        </a>
      ) : (
        content
      )}
    </article>
  );
}

export function SourcePanel({
  bundle,
  locale,
}: {
  bundle: SourceBundle;
  locale: Locale;
}) {
  const ui = copy[locale];

  return (
    <section className="section source-section" id="sources">
      <div className="section-head source-section-head">
        <div>
          <p className="section-kicker">{ui.kicker}</p>
          <h2>{ui.title}</h2>
        </div>
        <span className="source-reviewed">
          {ui.reviewed} · {bundle.reviewed}
        </span>
      </div>

      <div className="source-principles">
        <p>{ui.intro}</p>
        <div>
          <span>✓ {ui.primary}</span>
          <span>✓ {ui.model}</span>
          <span>✓ {ui.review}</span>
        </div>
      </div>

      <div className="source-grid">
        {bundle.sources.map((source, index) => (
          <SourceCard
            index={index}
            key={source.id}
            locale={locale}
            source={source}
          />
        ))}
      </div>

      <p className="source-method">
        <strong>{locale === "zh" ? "模型說明。" : "Model note."}</strong>{" "}
        {ui.method}
      </p>
      <p className="source-method">
        <strong>{locale === "zh" ? "發布審查。" : "Publication review."}</strong>{" "}
        {ui.reviewMethod}
      </p>
    </section>
  );
}
