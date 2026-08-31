import { createHash } from "node:crypto";
import { evaluateQualityGate, sortGateIssues, type GateIssue } from "./quality-gate.ts";
import { assertMarketSnapshot } from "./schema.ts";
import { assertCompletedSession } from "./session.ts";
import {
  checkSourceHealth,
  resolveHostname,
  type HostnameResolver,
  type SourceFetcher,
} from "./source-health.ts";
import type { MarketSnapshot, PageSlug } from "./types.ts";

export type ReviewDecision = "auto_publish" | "manual_review" | "reject";

export type AutomatedReview = {
  schemaVersion: 1;
  reviewId: string;
  runId: string;
  reviewedAt: string;
  candidateSha256: string;
  decision: ReviewDecision;
  checks: Array<{
    id:
      | "schema"
      | "completed-session"
      | "required-data"
      | "source-health"
      | "source-conflict"
      | "anomaly"
      | "bilingual"
      | "narrative-evidence"
      | "no-change-integrity";
    status: "pass" | "warn" | "fail";
    issueCodes: GateIssue["code"][];
  }>;
  issues: GateIssue[];
  reviewedMetricCount: number;
  reviewedSourceCount: number;
};

const RUN_ID = /^(\d{4})-(\d{2})-(\d{2})-(wednesday|saturday|month-end)$/;

export function isSafeMarketRunId(runId: string, cadence?: MarketSnapshot["cadence"]): boolean {
  const match = RUN_ID.exec(runId);
  if (!match) return false;
  const [, year, month, day, scheduledCadence] = match;
  if (cadence !== undefined && scheduledCadence !== cadence) return false;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
  ) {
    return false;
  }
  if (scheduledCadence === "wednesday") return date.getUTCDay() === 3;
  if (scheduledCadence === "saturday") return date.getUTCDay() === 6;
  if (date.getUTCDay() !== 6) return false;
  const nextWeek = new Date(date);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  return nextWeek.getUTCMonth() !== date.getUTCMonth();
}

type ReviewCheck = AutomatedReview["checks"][number];
type CheckId = ReviewCheck["id"];
const REQUIRED_CHECK_IDS: CheckId[] = [
  "schema",
  "completed-session",
  "required-data",
  "source-health",
  "source-conflict",
  "anomaly",
  "bilingual",
  "narrative-evidence",
  "no-change-integrity",
];
const SHA256 = /^[a-f0-9]{64}$/;
const GATE_ISSUE_CODES = new Set<GateIssue["code"]>([
  "SOURCE_CONFLICT",
  "UNEXPLAINED_PRICE_MOVE",
  "FINANCIAL_DELTA",
  "FORECAST_DELTA",
  "MISSING_REQUIRED",
  "LOW_CONFIDENCE",
  "THESIS_REVERSAL",
  "BILINGUAL_MISMATCH",
  "MATERIAL_CHANGE_MISMATCH",
  "SOURCE_UNREACHABLE",
  "STALE_REQUIRED_METRIC",
  "STALE_OPTIONAL_METRIC",
  "METRIC_STAGNATION",
  "NARRATIVE_STAGNATION",
  "MISSING_OPPOSING_EVIDENCE",
  "INSUFFICIENT_PAGE_EVIDENCE",
  "MODELED_MARKET_PRESENTATION",
]);

export const REVIEW_CHECK_CODES = {
  schema: [],
  "completed-session": [],
  "required-data": [
    "MISSING_REQUIRED",
    "LOW_CONFIDENCE",
    "STALE_REQUIRED_METRIC",
    "STALE_OPTIONAL_METRIC",
    "MODELED_MARKET_PRESENTATION",
  ],
  "source-health": ["SOURCE_UNREACHABLE"],
  "source-conflict": ["SOURCE_CONFLICT"],
  anomaly: [
    "UNEXPLAINED_PRICE_MOVE",
    "FINANCIAL_DELTA",
    "FORECAST_DELTA",
    "THESIS_REVERSAL",
    "METRIC_STAGNATION",
    "NARRATIVE_STAGNATION",
  ],
  bilingual: ["BILINGUAL_MISMATCH"],
  "narrative-evidence": ["MISSING_OPPOSING_EVIDENCE", "INSUFFICIENT_PAGE_EVIDENCE"],
  "no-change-integrity": ["MATERIAL_CHANGE_MISMATCH"],
} as const satisfies Record<CheckId, readonly GateIssue["code"][]>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function hashCandidate(candidate: unknown): string {
  const serialized = JSON.stringify(canonicalize(candidate));
  return createHash("sha256").update(serialized ?? "undefined").digest("hex");
}

function issue(
  code: GateIssue["code"],
  message: string,
  details: Partial<Pick<GateIssue, "metricId" | "page" | "sourceIds">> = {},
): GateIssue {
  return {
    code,
    severity: "block",
    message,
    sourceIds: details.sourceIds ?? [],
    ...(details.metricId === undefined ? {} : { metricId: details.metricId }),
    ...(details.page === undefined ? {} : { page: details.page }),
  };
}

function validateCompletedSessions(snapshot: MarketSnapshot): GateIssue[] {
  const issues: GateIssue[] = [];
  const runStart = new Date(snapshot.generatedAt);
  for (const metric of Object.values(snapshot.metrics)) {
    try {
      assertCompletedSession(metric, runStart);
    } catch (error) {
      issues.push(issue(
        "MISSING_REQUIRED",
        error instanceof Error ? error.message : `${metric.id} is not a completed session`,
        { metricId: metric.id, page: metric.page, sourceIds: [...metric.sourceIds].sort() },
      ));
    }
  }
  return issues;
}

function numericClaims(text: string): number[] {
  const claims: number[] = [];
  for (const match of text.replaceAll(",", "").replaceAll("−", "-").matchAll(/[-+]?\d+(?:\.\d+)?/g)) {
    claims.push(Number(match[0]));
  }
  return claims;
}

function citedNumbers(snapshot: MarketSnapshot, metricIds: string[], locale: "en" | "zh"): number[] {
  const values: number[] = [];
  for (const metricId of metricIds) {
    const metric = snapshot.metrics[metricId];
    if (!metric) continue;
    values.push(metric.numericValue, ...numericClaims(metric.display[locale]));
  }
  return values;
}

function claimsMatchEvidence(snapshot: MarketSnapshot, text: string, metricIds: string[], locale: "en" | "zh"): boolean {
  const expected = citedNumbers(snapshot, metricIds, locale);
  return numericClaims(text).every((claim) =>
    expected.some((value) => Math.abs(value - claim) <= Math.max(1e-9, Math.abs(value) * 1e-9)),
  );
}

function validateNarrativeEvidence(snapshot: MarketSnapshot): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const [page, state] of Object.entries(snapshot.pages) as Array<[PageSlug, MarketSnapshot["pages"][PageSlug]]>) {
    const fields: Array<{
      path: string;
      text: MarketSnapshot["pages"][PageSlug]["report"]["title"];
      metricIds: string[];
    }> = [];
    for (const field of ["eyebrow", "title", "summary", "signal"] as const) {
      fields.push({
        path: field,
        text: state.report[field],
        metricIds: state.thesisMetricIds,
      });
    }
    fields.push(
      { path: "thesis.title", text: state.report.thesis.title, metricIds: state.thesisMetricIds },
      { path: "thesis.body", text: state.report.thesis.body, metricIds: state.thesisMetricIds },
    );
    if (state.report.thesisSurvivalRationale !== undefined) {
      fields.push({
        path: "thesisSurvivalRationale",
        text: state.report.thesisSurvivalRationale.text,
        metricIds: state.report.thesisSurvivalRationale.metricIds,
      });
    }
    for (const locale of ["en", "zh"] as const) {
      for (const [index, tag] of state.report.thesis.tags[locale].entries()) {
        fields.push({
          path: `thesis.tags.${locale}[${index}]`,
          text: { en: locale === "en" ? tag : "", zh: locale === "zh" ? tag : "" },
          metricIds: state.thesisMetricIds,
        });
      }
    }
    for (const [index, text] of state.report.catalysts.entries()) {
      fields.push({
        path: `catalysts[${index}]`,
        text,
        metricIds: state.thesisMetricIds,
      });
    }
    for (const [index, note] of (state.report.analystNotes ?? []).entries()) {
      fields.push({
        path: `analystNotes[${index}]`,
        text: note,
        metricIds: state.thesisMetricIds,
      });
    }
    for (const [index, risk] of state.report.risks.entries()) {
      if (!("condition" in risk)) continue;
      fields.push({
        path: `risks[${index}].condition`,
        text: risk.condition,
        metricIds: [risk.comparison.metricId],
      });
    }
    for (const [index, observation] of state.report.nextObservations.entries()) {
      if (!("what" in observation)) continue;
      for (const [part, text] of [["what", observation.what], ["threshold", observation.threshold], ["consequence", observation.consequence]] as const) {
        fields.push({
          path: `nextObservations[${index}].${part}`,
          text,
          metricIds: [observation.comparison.metricId],
        });
      }
    }
    for (const collection of ["supportingEvidence", "opposingEvidence"] as const) {
      for (const [index, evidence] of state.report[collection].entries()) {
        fields.push({
          path: `${collection}[${index}]`,
          text: evidence.text,
          metricIds: evidence.metricIds,
        });
      }
    }

    for (const field of fields) {
      const mismatchedLocales = (["en", "zh"] as const).filter(
        (locale) =>
          field.text[locale].length > 0 &&
          !claimsMatchEvidence(snapshot, field.text[locale], field.metricIds, locale),
      );
      if (mismatchedLocales.length > 0) {
        issues.push(issue(
          "MATERIAL_CHANGE_MISMATCH",
          `${page}.report.${field.path} has an unsupported numeric claim in ${mismatchedLocales.join("/")}.`,
          {
            page,
            sourceIds: field.metricIds.flatMap(
              (metricId) => snapshot.metrics[metricId]?.sourceIds ?? [],
            ).sort(),
          },
        ));
      }
    }
  }
  return issues;
}

function checkFor(
  id: Exclude<CheckId, "schema" | "completed-session" | "narrative-evidence">,
  issues: GateIssue[],
): ReviewCheck {
  const matching = issues.filter((candidate) => REVIEW_CHECK_CODES[id].includes(candidate.code));
  return {
    id,
    status: matching.some((candidate) => candidate.severity === "block")
      ? "fail"
      : matching.length > 0
        ? "warn"
        : "pass",
    issueCodes: [...new Set(matching.map((candidate) => candidate.code))].sort(),
  };
}

function directCheck(id: "schema" | "completed-session" | "narrative-evidence", issues: GateIssue[]): ReviewCheck {
  return {
    id,
    status: issues.length > 0 ? "fail" : "pass",
    issueCodes: [...new Set(issues.map((candidate) => candidate.code))].sort(),
  };
}

function asCount(value: unknown, key: "metrics" | "sources"): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return 0;
  const child = (value as Record<string, unknown>)[key];
  return child !== null && typeof child === "object" && !Array.isArray(child)
    ? Object.keys(child).length
    : 0;
}

export async function reviewCandidate(
  candidate: unknown,
  previous: MarketSnapshot,
  fetcher: SourceFetcher,
  resolver: HostnameResolver = resolveHostname,
  history: readonly MarketSnapshot[] = [],
): Promise<AutomatedReview> {
  const candidateSha256 = hashCandidate(candidate);
  const schemaIssues: GateIssue[] = [];
  let snapshot: MarketSnapshot | undefined;
  try {
    assertMarketSnapshot(candidate);
    if (!isSafeMarketRunId(candidate.runId, candidate.cadence)) {
      throw new Error("Invalid market snapshot: runId must identify its scheduled cadence");
    }
    snapshot = candidate;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid market snapshot";
    schemaIssues.push(issue(
      /(?:bilingual|\.en|\.zh)/i.test(message) ? "BILINGUAL_MISMATCH" : "MISSING_REQUIRED",
      message,
    ));
  }

  const completedIssues = snapshot ? validateCompletedSessions(snapshot) : [];
  const sourceIssues = snapshot ? await checkSourceHealth(snapshot, fetcher, resolver) : [];
  const gateIssues = snapshot
    ? evaluateQualityGate(snapshot, previous, sourceIssues, history).issues
    : [];
  const narrativeIssues = snapshot ? validateNarrativeEvidence(snapshot) : [];
  const editorialIssues = gateIssues.filter(
    (candidate) => ["MISSING_OPPOSING_EVIDENCE", "INSUFFICIENT_PAGE_EVIDENCE"].includes(candidate.code),
  );
  const issues = sortGateIssues([...schemaIssues, ...completedIssues, ...gateIssues, ...narrativeIssues]);

  const checks: AutomatedReview["checks"] = [
    directCheck("schema", schemaIssues),
    directCheck("completed-session", completedIssues),
    checkFor("required-data", gateIssues),
    checkFor("source-health", gateIssues),
    checkFor("source-conflict", gateIssues),
    checkFor("anomaly", gateIssues),
    checkFor("bilingual", [...schemaIssues, ...gateIssues]),
    directCheck("narrative-evidence", [...narrativeIssues, ...editorialIssues]),
    checkFor("no-change-integrity", gateIssues),
  ];

  const rejects =
    checks.some((check) =>
      ["schema", "completed-session", "bilingual", "narrative-evidence", "no-change-integrity"].includes(check.id) &&
      check.status === "fail",
    ) ||
    sourceIssues.some((candidateIssue) => candidateIssue.severity === "block");
  const decision: ReviewDecision = rejects
    ? "reject"
    : issues.some((candidateIssue) => candidateIssue.severity === "block")
      ? "manual_review"
      : "auto_publish";
  const runId = snapshot?.runId ?? `invalid-${candidateSha256.slice(0, 16)}`;

  return {
    schemaVersion: 1,
    reviewId: `${runId}:${candidateSha256}`,
    runId,
    reviewedAt: new Date().toISOString(),
    candidateSha256,
    decision,
    checks,
    issues,
    reviewedMetricCount: asCount(candidate, "metrics"),
    reviewedSourceCount: asCount(candidate, "sources"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const expected = value.includes(".") ? value : value.replace("Z", ".000Z");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === expected;
}

function isIssue(value: unknown): value is GateIssue {
  return isRecord(value) &&
    typeof value.code === "string" && GATE_ISSUE_CODES.has(value.code as GateIssue["code"]) &&
    value.severity === "warn" &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    Array.isArray(value.sourceIds) &&
    value.sourceIds.every((sourceId) => typeof sourceId === "string") &&
    (value.metricId === undefined || typeof value.metricId === "string") &&
    (value.page === undefined || ["/", "/stocks", "/compute", "/energy", "/models", "/sic"].includes(value.page as string)) &&
    (value.oldValue === undefined || typeof value.oldValue === "number" && Number.isFinite(value.oldValue)) &&
    (value.newValue === undefined || typeof value.newValue === "number" && Number.isFinite(value.newValue));
}

/** Validates review invariants that remain verifiable after a snapshot is distilled into an archive. */
export function assertArchivedAutoPublishReview(
  value: unknown,
  expectedRunId: string,
): asserts value is AutomatedReview {
  if (!isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.runId !== expectedRunId ||
    !isSafeMarketRunId(value.runId) ||
    typeof value.candidateSha256 !== "string" ||
    !SHA256.test(value.candidateSha256) ||
    value.reviewId !== `${value.runId}:${value.candidateSha256}` ||
    !isIsoTimestamp(value.reviewedAt) ||
    value.decision !== "auto_publish" ||
    !Number.isSafeInteger(value.reviewedMetricCount) ||
    value.reviewedMetricCount <= 0 ||
    !Number.isSafeInteger(value.reviewedSourceCount) ||
    value.reviewedSourceCount <= 0 ||
    !Array.isArray(value.checks) ||
    !Array.isArray(value.issues) ||
    !value.issues.every(isIssue)) {
    throw new Error("archived automated review is invalid");
  }

  const checkIds = new Set<string>();
  const checkIssueCodes = new Set<string>();
  for (const check of value.checks) {
    if (!isRecord(check) ||
      typeof check.id !== "string" ||
      !REQUIRED_CHECK_IDS.includes(check.id as CheckId) ||
      checkIds.has(check.id) ||
      (check.status !== "pass" && check.status !== "warn") ||
      !Array.isArray(check.issueCodes) ||
      !check.issueCodes.every((code) => typeof code === "string") ||
      JSON.stringify([...check.issueCodes].sort()) !== JSON.stringify(check.issueCodes) ||
      new Set(check.issueCodes).size !== check.issueCodes.length ||
      (check.status === "pass" && check.issueCodes.length !== 0) ||
      (check.status === "warn" && check.issueCodes.length === 0)) {
      throw new Error("archived automated review checks are invalid");
    }
    const allowedCodes = REVIEW_CHECK_CODES[check.id as CheckId];
    if (check.issueCodes.some((code) => !allowedCodes.includes(code as GateIssue["code"])) ||
      check.issueCodes.some((code) => checkIssueCodes.has(code))) {
      throw new Error("archived automated review issue codes are reassigned");
    }
    checkIds.add(check.id);
    for (const code of check.issueCodes) checkIssueCodes.add(code);
  }
  if (checkIds.size !== REQUIRED_CHECK_IDS.length || REQUIRED_CHECK_IDS.some((id) => !checkIds.has(id))) {
    throw new Error("archived automated review checks are incomplete");
  }
  const issueCodes = new Set(value.issues.map((issue) => issue.code));
  if (issueCodes.size !== checkIssueCodes.size || [...issueCodes].some((code) => !checkIssueCodes.has(code))) {
    throw new Error("archived automated review issue checks are inconsistent");
  }
  if (JSON.stringify(sortGateIssues(value.issues)) !== JSON.stringify(value.issues)) {
    throw new Error("archived automated review issues are not deterministic");
  }
}

export function assertAutoPublishReview(
  review: unknown,
  snapshot: unknown,
): asserts review is AutomatedReview {
  const snapshotRunId =
    snapshot !== null && typeof snapshot === "object" && typeof (snapshot as Record<string, unknown>).runId === "string"
      ? (snapshot as Record<string, string>).runId
      : undefined;
  if (
    snapshotRunId === undefined ||
    !isRecord(review) ||
    review.runId !== snapshotRunId ||
    typeof review.candidateSha256 !== "string" ||
    review.reviewId !== `${review.runId}:${review.candidateSha256}`
  ) {
    throw new Error("review identity does not match");
  }
  if (review.decision !== "auto_publish") {
    throw new Error(`automated review decision is ${String(review.decision)}`);
  }
  assertArchivedAutoPublishReview(review, snapshotRunId);
  if (review.candidateSha256 !== hashCandidate(snapshot)) {
    throw new Error("review candidate hash does not match");
  }
  if (
    review.reviewedMetricCount !== asCount(snapshot, "metrics") ||
    review.reviewedSourceCount !== asCount(snapshot, "sources")
  ) {
    throw new Error("review identity does not match");
  }
}
