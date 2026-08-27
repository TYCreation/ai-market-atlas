import type { Locale } from "../../market-data/types";
import type { MetricView } from "../../market-data/view-model";

const labels = {
  zh: {
    "published-fact": "已發布資料",
    "market-observation": "市場觀測",
    "atlas-model": "Atlas 模型",
    asOf: "截至",
  },
  en: {
    "published-fact": "Published fact",
    "market-observation": "Market observation",
    "atlas-model": "Atlas model",
    asOf: "As of",
  },
} as const;

export function TaipeiTime({
  value,
  locale,
  includeTime = false,
}: {
  value: string;
  locale: Locale;
  includeTime?: boolean;
}) {
  const formatted = new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    month: locale === "zh" ? "2-digit" : "short",
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(new Date(value));

  return <time dateTime={value}>{formatted}</time>;
}

export function MetricProvenance({
  metric,
  locale,
}: {
  metric: MetricView;
  locale: Locale;
}) {
  const ui = labels[locale];
  return (
    <span className="metric-provenance">
      <span className="metric-kind">{ui[metric.kind]}</span>
      <span className="metric-as-of">
        {ui.asOf} <TaipeiTime value={metric.asOf} locale={locale} />
      </span>
    </span>
  );
}
