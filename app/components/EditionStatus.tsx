import type { EditionMeta } from "../../market-data/view-model";
import type { Locale, MetricStatus } from "../../market-data/types";

const copy = {
  zh: {
    cutoff: "資料截止",
    verified: "驗證時間",
    waiting: "等待更新",
  },
  en: {
    cutoff: "Data cutoff",
    verified: "Verified",
    waiting: "Awaiting update",
  },
} as const;

export type LocalizedEditionMeta = Record<Locale, EditionMeta>;
export type LocalizedPageEdition = Record<
  Locale,
  { changed: boolean; changeLabel: string; verifiedAt: string }
>;

export function EditionStatus({
  locale,
  edition,
  page,
  metricStatus,
}: {
  locale: Locale;
  edition?: LocalizedEditionMeta;
  page?: LocalizedPageEdition;
  metricStatus?: MetricStatus;
}) {
  const ui = copy[locale];
  if (metricStatus) {
    return metricStatus === "waiting" ? (
      <span className="waiting-status">{ui.waiting}</span>
    ) : null;
  }
  if (!edition || !page) return null;

  const editionMeta = edition[locale];
  const pageMeta = page[locale];
  return (
    <div className="edition-status" data-run-id={editionMeta.runId}>
      <span>{editionMeta.cadenceLabel}</span>
      <span>{ui.cutoff} · {editionMeta.dataCutoff}</span>
      <span>{ui.verified} · {pageMeta.verifiedAt}</span>
      {!pageMeta.changed ? <strong>{pageMeta.changeLabel}</strong> : null}
      <span className="edition-run">{editionMeta.runId}</span>
    </div>
  );
}
