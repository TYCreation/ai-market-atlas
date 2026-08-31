import { isDeepStrictEqual } from "node:util";
import { evaluateMetricFreshness } from "./freshness.ts";
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
    | "SOURCE_UNREACHABLE"
    | "STALE_REQUIRED_METRIC"
    | "STALE_OPTIONAL_METRIC"
    | "METRIC_STAGNATION"
    | "NARRATIVE_STAGNATION"
    | "MISSING_OPPOSING_EVIDENCE"
    | "INSUFFICIENT_PAGE_EVIDENCE"
    | "MODELED_MARKET_PRESENTATION";
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
const PAGE_EVIDENCE_FLOORS: Record<PageSlug, { supporting: number; opposing: number }> = {
  "/": { supporting: 1, opposing: 1 },
  "/stocks": { supporting: 1, opposing: 1 },
  "/compute": { supporting: 1, opposing: 1 },
  "/energy": { supporting: 1, opposing: 1 },
  "/models": { supporting: 1, opposing: 1 },
  "/sic": { supporting: 1, opposing: 1 },
};

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
  if (prior === undefined) return false;
  const withoutSurvivalRationale = (report: MarketSnapshot["pages"][PageSlug]["report"]) =>
    Object.fromEntries(
      Object.entries(report).filter(([key]) => key !== "thesisSurvivalRationale"),
    );
  return !isDeepStrictEqual(
    withoutSurvivalRationale(current.pages[page].report),
    withoutSurvivalRationale(prior.report),
  );
}

function thesisChanged(current: MarketSnapshot, previous: MarketSnapshot, page: PageSlug): boolean {
  const prior = previous.pages?.[page];
  return prior !== undefined && !isDeepStrictEqual(current.pages[page].report.thesis, prior.report.thesis);
}

function hasSurvivalRationale(state: MarketSnapshot["pages"][PageSlug]): boolean {
  const rationale = state.report.thesisSurvivalRationale;
  return rationale !== undefined &&
    rationale.text.en.trim().length > 0 &&
    rationale.text.zh.trim().length > 0 &&
    rationale.metricIds.length > 0;
}

function sameMetricIdSet(left: string[], right: string[]): boolean {
  return isDeepStrictEqual(
    [...new Set(left)].sort(),
    [...new Set(right)].sort(),
  );
}

function metricChanged(current: MarketSnapshot, previous: MarketSnapshot, metricId: string): boolean {
  const metric = current.metrics[metricId];
  const prior = previous.metrics?.[metricId];
  if (metric === undefined || prior === undefined) return false;
  return metric.numericValue !== prior.numericValue ||
    metric.asOf !== prior.asOf ||
    !sameMetricIdSet(metric.sourceIds, prior.sourceIds) ||
    !isDeepStrictEqual(metric.observations, prior.observations);
}

function changedEvidenceCites(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  page: PageSlug,
  thesisMetricIds: string[],
): boolean {
  const priorEvidence = [
    ...(previous.pages?.[page]?.report.supportingEvidence ?? []),
    ...(previous.pages?.[page]?.report.opposingEvidence ?? []),
  ];
  const priorIds = new Set(thesisMetricIds);
  const currentEvidence = [
    ...current.pages[page].report.supportingEvidence,
    ...current.pages[page].report.opposingEvidence,
  ];
  return currentEvidence.some((item) =>
    item.metricIds.some((metricId) => priorIds.has(metricId)) &&
    !priorEvidence.some((priorItem) => isDeepStrictEqual(priorItem, item)),
  );
}

function hasCausalStanceEvidence(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  page: PageSlug,
  thesisMetricIds: string[],
): boolean {
  return thesisMetricIds.some((metricId) => metricChanged(current, previous, metricId)) &&
    changedEvidenceCites(current, previous, page, thesisMetricIds);
}

function editorialState(page: MarketSnapshot["pages"][PageSlug]): {
  report: MarketSnapshot["pages"][PageSlug]["report"];
  thesisStance: MarketSnapshot["pages"][PageSlug]["thesisStance"];
  thesisMetricIds: string[];
} {
  return {
    report: page.report,
    thesisStance: page.thesisStance,
    thesisMetricIds: [...new Set(page.thesisMetricIds)].sort(),
  };
}

function addStagnationIssues(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  history: readonly MarketSnapshot[],
  issues: GateIssue[],
): void {
  const older = history[0];
  if (older === undefined) return;

  for (const metric of Object.values(current.metrics)) {
    const prior = previous.metrics?.[metric.id];
    const oldest = older.metrics?.[metric.id];
    if (prior === undefined || oldest === undefined) continue;
    const policy = evaluateMetricFreshness(metric, current.dataCutoff).policy;
    if (
      ["market-close", "weekly", "atlas-model"].includes(policy.class) &&
      metric.numericValue === prior.numericValue &&
      metric.numericValue === oldest.numericValue
    ) {
      issues.push(issueForMetric(
        "METRIC_STAGNATION",
        "warn",
        metric,
        "Metric numeric value is unchanged across three consecutive editions.",
      ));
    }
  }

  for (const [page, state] of Object.entries(current.pages) as Array<[PageSlug, MarketSnapshot["pages"][PageSlug]]>) {
    const prior = previous.pages?.[page];
    const oldest = older.pages?.[page];
    if (
      prior !== undefined &&
      oldest !== undefined &&
      isDeepStrictEqual(editorialState(state), editorialState(prior)) &&
      isDeepStrictEqual(editorialState(state), editorialState(oldest))
    ) {
      issues.push({
        code: "NARRATIVE_STAGNATION",
        severity: "warn",
        page,
        message: "Thesis and report language is unchanged across three consecutive editions.",
        sourceIds: state.thesisMetricIds.flatMap((id) => current.metrics[id]?.sourceIds ?? []).sort(),
      });
    }
  }
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
  const stanceEvidence =
    priorPage !== undefined &&
    priorPage.thesisStance !== current.pages[page].thesisStance &&
    hasCausalStanceEvidence(current, previous, page, current.pages[page].thesisMetricIds);
  const thesisRestated =
    current.pages[page].changeReasons.includes("thesis-reexamined-restated") &&
    thesisChanged(current, previous, page) &&
    current.pages[page].thesisMetricIds.length > 0;
  return newFirstPartyEvent || roundedValueChange || gateWorthyMovement || stanceEvidence || thesisRestated;
}

export function evaluateQualityGate(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  externalIssues: GateIssue[] = [],
  history: readonly MarketSnapshot[] = [],
): GateResult {
  const issues: GateIssue[] = [...externalIssues];
  const metrics = Object.values(current.metrics);

  for (const metric of metrics) {
    const freshness = evaluateMetricFreshness(metric, current.dataCutoff);
    if (metric.required && freshness.state === "stale") {
      issues.push(issueForMetric(
        "STALE_REQUIRED_METRIC",
        "block",
        metric,
        `Required metric is stale under ${freshness.policy.class} policy.`,
      ));
    }
    if (!metric.required && freshness.state === "stale") {
      issues.push(issueForMetric(
        "STALE_OPTIONAL_METRIC",
        "warn",
        metric,
        `Optional metric is stale under ${freshness.policy.class} policy.`,
      ));
    }

    const marketFurniture = [
      metric.market,
      metric.marketTimezone,
      metric.primaryListing,
      metric.securityType,
      metric.sessionState,
    ].some((value) => value !== undefined);
    if (metric.kind === "modeled" && marketFurniture) {
      issues.push(issueForMetric(
        "MODELED_MARKET_PRESENTATION",
        "block",
        metric,
        "Modeled metrics cannot carry exchange-market presentation fields.",
      ));
    }

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
    if (metric.required && metric.status === "waiting") {
      issues.push(issueForMetric(
        "MISSING_REQUIRED",
        "block",
        metric,
        "A required metric is waiting for data.",
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
    const floor = PAGE_EVIDENCE_FLOORS[page];
    const supportingEvidenceIsInsufficient =
      state.report.supportingEvidence.length < floor.supporting ||
      state.report.supportingEvidence.some((item) => item.metricIds.length === 0);
    if (supportingEvidenceIsInsufficient) {
      issues.push({
        code: "INSUFFICIENT_PAGE_EVIDENCE",
        severity: "block",
        page,
        message: `Every page must cite at least ${floor.supporting} supporting evidence item with metric IDs.`,
        sourceIds: [],
      });
    }
    if (
      state.report.opposingEvidence.length < floor.opposing ||
      state.report.opposingEvidence.some((item) => item.metricIds.length === 0)
    ) {
      issues.push({
        code: "MISSING_OPPOSING_EVIDENCE",
        severity: "block",
        page,
        message: "Every page must cite opposing evidence with metric IDs.",
        sourceIds: [],
      });
    }
    const priorStance = previous.pages?.[page]?.thesisStance ?? state.previousThesisStance;
    const priorPage = previous.pages?.[page];
    if (priorPage !== undefined && state.previousThesisStance !== priorPage.thesisStance) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "Candidate previousThesisStance must match the trusted prior snapshot.",
        sourceIds: [],
      });
    }
    const thesisMetricsOnPage = state.thesisMetricIds.every(
      (metricId) => current.metrics[metricId]?.page === page,
    );
    const stanceChanged = priorStance !== state.thesisStance;
    if (stanceChanged && (
      state.thesisMetricIds.length === 0 ||
      !thesisMetricsOnPage ||
      !state.changed ||
      !hasCausalStanceEvidence(current, previous, page, state.thesisMetricIds)
    )) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A stance change must cite same-page thesis metrics, changed supporting/opposing evidence, and a current-vs-prior metric difference.",
        sourceIds: state.thesisMetricIds.flatMap((id) => current.metrics[id]?.sourceIds ?? []).sort(),
      });
    }
    const restated = thesisChanged(current, previous, page);
    const declaredRestatement = state.changeReasons.includes("thesis-reexamined-restated");
    if (restated && (!state.changed || !declaredRestatement || state.thesisMetricIds.length === 0)) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A restated thesis must mark the page changed, use the exact thesis re-examination reason, and cite thesis metrics.",
        sourceIds: [],
      });
    }
    if (!restated && declaredRestatement) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "The thesis re-examination restatement reason requires an actual thesis rewrite.",
        sourceIds: [],
      });
    }
    if (!restated && !hasSurvivalRationale(state)) {
      issues.push({
        code: "MATERIAL_CHANGE_MISMATCH",
        severity: "block",
        page,
        message: "A thesis that survives unchanged requires an argued rationale with cited metric IDs.",
        sourceIds: [],
      });
    }
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

  addStagnationIssues(current, previous, history, issues);

  const sorted = sortGateIssues(issues);
  return { publishable: !sorted.some((issue) => issue.severity === "block"), issues: sorted };
}
