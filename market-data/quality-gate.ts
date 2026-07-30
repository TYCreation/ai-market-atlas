import { isDeepStrictEqual } from "node:util";
import type { MarketSnapshot, MetricRecord, PageSlug, SourceRecord } from "./types.ts";

export type GateIssue = {
  code:
    | "SOURCE_CONFLICT"
    | "UNEXPLAINED_PRICE_MOVE"
    | "FINANCIAL_DELTA"
    | "FORECAST_DELTA"
    | "MISSING_REQUIRED"
    | "LOW_CONFIDENCE"
    | "THESIS_REVERSAL"
    | "BILINGUAL_MISMATCH"
    | "MATERIAL_CHANGE_MISMATCH"
    | "SOURCE_UNREACHABLE";
  severity: "block" | "warn";
  metricId?: string;
  page?: PageSlug;
  message: string;
  oldValue?: number;
  newValue?: number;
  sourceIds: string[];
};

export type GateResult = {
  publishable: boolean;
  issues: GateIssue[];
};

const FINANCIAL_METRIC = /(?:revenue.*growth|growth.*revenue|valuation|forward[_-]?pe|software[_-]?spend[_-]?growth)/i;
const FORECAST_METRIC = /(?:market.*(?:size|20\d{2})|forecast|long[_-]?range|market_20\d{2})/i;
const FIRST_PARTY_KINDS = new Set(["official", "company"]);

function exceeds(value: number, threshold: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(threshold)) * 4;
  return value - threshold > tolerance;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortGateIssues(issues: GateIssue[]): GateIssue[] {
  return [...issues].sort((left, right) =>
    compareText(left.code, right.code) ||
    compareText(left.metricId ?? "", right.metricId ?? "") ||
    compareText(left.page ?? "", right.page ?? "") ||
    compareText(left.message, right.message),
  );
}

function issueForMetric(
  code: GateIssue["code"],
  severity: GateIssue["severity"],
  metric: MetricRecord,
  message: string,
  values: Pick<GateIssue, "oldValue" | "newValue"> = {},
): GateIssue {
  return {
    code,
    severity,
    metricId: metric.id,
    page: metric.page,
    message,
    ...values,
    sourceIds: [...metric.sourceIds].sort(),
  };
}

function sourceSpread(metric: MetricRecord): number {
  if (metric.observations.length < 2) return 0;
  const values = metric.observations.map(({ numericValue }) => numericValue);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return 0;
  if (minimum === 0) return Number.POSITIVE_INFINITY;
  return Math.abs((maximum - minimum) / minimum);
}

function hasSourceKind(snapshot: MarketSnapshot, metric: MetricRecord, kinds: Set<string>): boolean {
  return metric.sourceIds.some((sourceId) => kinds.has(snapshot.sources[sourceId]?.kind));
}

function normalizedProvenanceText(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function canonicalSourceUrl(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    return url.href;
  } catch {
    return raw;
  }
}

function sourceFingerprint(source: SourceRecord): string {
  return JSON.stringify([
    canonicalSourceUrl(source.url),
    normalizedProvenanceText(source.publisher),
    normalizedProvenanceText(source.title),
    new Date(source.publishedAt).toISOString(),
  ]);
}

function hasNewSourceKind(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  metric: MetricRecord,
  kinds: Set<string>,
): boolean {
  const priorFingerprints = new Set(
    (previous.metrics?.[metric.id]?.sourceIds ?? [])
      .map((sourceId) => previous.sources?.[sourceId])
      .filter((source): source is SourceRecord => source !== undefined)
      .map(sourceFingerprint),
  );
  return metric.sourceIds.some(
    (sourceId) => {
      const source = current.sources[sourceId];
      return source !== undefined &&
        kinds.has(source.kind) &&
        !priorFingerprints.has(sourceFingerprint(source));
    },
  );
}

function previousValue(metric: MetricRecord, previous: MarketSnapshot): number | undefined {
  return previous.metrics?.[metric.id]?.numericValue ?? metric.previousNumericValue;
}

function reportChanged(current: MarketSnapshot, previous: MarketSnapshot, page: PageSlug): boolean {
  const prior = previous.pages?.[page];
  return prior !== undefined && !isDeepStrictEqual(current.pages[page].report, prior.report);
}

function sameMetricIdSet(left: string[], right: string[]): boolean {
  return isDeepStrictEqual(
    [...new Set(left)].sort(),
    [...new Set(right)].sort(),
  );
}

function hasPageChangeEvidence(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  page: PageSlug,
  gateIssues: GateIssue[],
): boolean {
  const pageMetrics = Object.values(current.metrics).filter((metric) => metric.page === page);
  const priorPage = previous.pages?.[page];
  const newFirstPartyEvent = pageMetrics.some((metric) =>
    hasNewSourceKind(current, previous, metric, FIRST_PARTY_KINDS),
  );
  const roundedValueChange = pageMetrics.some((metric) => {
    const prior = previous.metrics?.[metric.id];
    return prior !== undefined && !isDeepStrictEqual(prior.display, metric.display);
  });
  const gateWorthyMovement = gateIssues.some(
    (issue) =>
      issue.page === page &&
      ["SOURCE_CONFLICT", "UNEXPLAINED_PRICE_MOVE", "FINANCIAL_DELTA", "FORECAST_DELTA"].includes(issue.code),
  );
  const conclusionChanged =
    priorPage !== undefined && priorPage.thesisStance !== current.pages[page].thesisStance;
  return newFirstPartyEvent || roundedValueChange || gateWorthyMovement || conclusionChanged;
}

export function evaluateQualityGate(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  externalIssues: GateIssue[] = [],
): GateResult {
  const issues: GateIssue[] = [...externalIssues];
  const metrics = Object.values(current.metrics);

  for (const metric of metrics) {
    if (/\.price$/i.test(metric.id) && exceeds(sourceSpread(metric), 0.01)) {
      issues.push(issueForMetric(
        "SOURCE_CONFLICT",
        "block",
        metric,
        "Independent price observations disagree by more than one percent.",
      ));
    }

    if (
      /\.weekReturn$/i.test(metric.id) &&
      exceeds(Math.abs(metric.numericValue), 20) &&
      !hasSourceKind(current, metric, FIRST_PARTY_KINDS)
    ) {
      issues.push(issueForMetric(
        "UNEXPLAINED_PRICE_MOVE",
        "block",
        metric,
        "Weekly equity return exceeds twenty percent without official or company corroboration.",
        { oldValue: previousValue(metric, previous), newValue: metric.numericValue },
      ));
    }

    const oldValue = previousValue(metric, previous);
    if (
      oldValue !== undefined &&
      FINANCIAL_METRIC.test(metric.id) &&
      exceeds(Math.abs(metric.numericValue - oldValue), 10) &&
      !hasNewSourceKind(current, previous, metric, FIRST_PARTY_KINDS)
    ) {
      issues.push(issueForMetric(
        "FINANCIAL_DELTA",
        "block",
        metric,
        "Revenue-growth or valuation movement exceeds ten percentage points without a new financial source.",
        { oldValue, newValue: metric.numericValue },
      ));
    }

    if (
      oldValue !== undefined &&
      FORECAST_METRIC.test(metric.id) &&
      (oldValue === 0
        ? metric.numericValue !== 0
        : exceeds(Math.abs((metric.numericValue - oldValue) / oldValue), 0.1)) &&
      !hasNewSourceKind(current, previous, metric, new Set(["research"]))
    ) {
      issues.push(issueForMetric(
        "FORECAST_DELTA",
        "block",
        metric,
        "Market-size or long-range forecast moved by more than ten percent without a new research source.",
        { oldValue, newValue: metric.numericValue },
      ));
    }

    if (!metric.required && metric.status === "waiting") {
      issues.push(issueForMetric(
        "MISSING_REQUIRED",
        "warn",
        metric,
        "A non-required metric is waiting for data.",
      ));
    }

    if (metric.required && metric.confidence === "low") {
      issues.push(issueForMetric(
        "LOW_CONFIDENCE",
        "block",
        metric,
        "A required metric has low confidence.",
      ));
    }

    if (!metric.display.en?.trim() || !metric.display.zh?.trim()) {
      issues.push(issueForMetric(
        "BILINGUAL_MISMATCH",
        "block",
        metric,
        "A metric is missing an English or Chinese display value.",
      ));
    }
  }

  const required = metrics.filter((metric) => metric.required);
  const waitingRequired = required.filter((metric) => metric.status === "waiting");
  if (required.length > 0 && waitingRequired.length / required.length > 0.2) {
    issues.push({
      code: "MISSING_REQUIRED",
      severity: "block",
      message: "More than twenty percent of required metrics are waiting for data.",
      sourceIds: [],
    });
  }

  for (const [page, state] of Object.entries(current.pages) as Array<[PageSlug, MarketSnapshot["pages"][PageSlug]]>) {
    const priorStance = previous.pages?.[page]?.thesisStance ?? state.previousThesisStance;
    if (priorStance !== "neutral" && priorStance !== state.thesisStance) {
      issues.push({
        code: "THESIS_REVERSAL",
        severity: "block",
        page,
        message: "The page stance negates its prior directional thesis.",
        sourceIds: state.thesisMetricIds.flatMap((id) => current.metrics[id]?.sourceIds ?? []).sort(),
      });
    }
    if (!state.changed && reportChanged(current, previous, page)) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A page marked unchanged rewrites report or thesis content.",
        sourceIds: [],
      });
    }
    const priorPage = previous.pages?.[page];
    if (
      !state.changed &&
      priorPage !== undefined &&
      (
        state.thesisStance !== priorPage.thesisStance ||
        !sameMetricIdSet(state.thesisMetricIds, priorPage.thesisMetricIds)
      )
    ) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A page marked unchanged modifies its stance or thesis citations.",
        sourceIds: [],
      });
    }
  }

  const issuesBeforeChangedEvidence = [...issues];
  for (const [page, state] of Object.entries(current.pages) as Array<[PageSlug, MarketSnapshot["pages"][PageSlug]]>) {
    if (state.changed && !hasPageChangeEvidence(current, previous, page, issuesBeforeChangedEvidence)) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A page marked changed has no new event, rounded value, gate-worthy movement, or conclusion-changing evidence.",
        sourceIds: [],
      });
    }
  }

  const sorted = sortGateIssues(issues);
  return { publishable: !sorted.some((issue) => issue.severity === "block"), issues: sorted };
}
