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
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.getUTCMonth() !== date.getUTCMonth();
}

type ReviewCheck = AutomatedReview["checks"][number];
type CheckId = ReviewCheck["id"];

const CHECK_CODES: Record<Exclude<CheckId, "schema" | "completed-session" | "narrative-evidence">, GateIssue["code"][]> = {
  "required-data": ["MISSING_REQUIRED", "LOW_CONFIDENCE"],
  "source-health": ["SOURCE_UNREACHABLE"],
  "source-conflict": ["SOURCE_CONFLICT"],
  anomaly: ["UNEXPLAINED_PRICE_MOVE", "FINANCIAL_DELTA", "FORECAST_DELTA", "THESIS_REVERSAL"],
  bilingual: ["BILINGUAL_MISMATCH"],
  "no-change-integrity": ["MATERIAL_CHANGE_MISMATCH"],
};

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
    for (const sourceId of metric.sourceIds) {
      const source = snapshot.sources[sourceId];
      if (!source) continue;
      const sourceText = [
        source.publisher,
        source.title,
        source.url ?? "",
        source.publishedAt,
        source.retrievedAt,
        source.scope[locale],
      ].join(" ");
      values.push(...numericClaims(sourceText));
    }
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
    for (const locale of ["en", "zh"] as const) {
      for (const [index, tag] of state.report.thesis.tags[locale].entries()) {
        fields.push({
          path: `thesis.tags.${locale}[${index}]`,
          text: { en: locale === "en" ? tag : "", zh: locale === "zh" ? tag : "" },
          metricIds: state.thesisMetricIds,
        });
      }
    }
    for (const collection of ["catalysts", "risks", "nextObservations"] as const) {
      for (const [index, text] of state.report[collection].entries()) {
        fields.push({
          path: `${collection}[${index}]`,
          text,
          metricIds: state.thesisMetricIds,
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
  const matching = issues.filter((candidate) => CHECK_CODES[id].includes(candidate.code));
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
    ? evaluateQualityGate(snapshot, previous, sourceIssues).issues
    : [];
  const narrativeIssues = snapshot ? validateNarrativeEvidence(snapshot) : [];
  const issues = sortGateIssues([...schemaIssues, ...completedIssues, ...gateIssues, ...narrativeIssues]);

  const checks: AutomatedReview["checks"] = [
    directCheck("schema", schemaIssues),
    directCheck("completed-session", completedIssues),
    checkFor("required-data", gateIssues),
    checkFor("source-health", gateIssues),
    checkFor("source-conflict", gateIssues),
    checkFor("anomaly", gateIssues),
    checkFor("bilingual", [...schemaIssues, ...gateIssues]),
    directCheck("narrative-evidence", narrativeIssues),
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

export function assertAutoPublishReview(review: AutomatedReview, snapshot: unknown): void {
  if (review.schemaVersion !== 1) throw new Error("automated review schema is unsupported");
  if (review.candidateSha256 !== hashCandidate(snapshot)) {
    throw new Error("review candidate hash does not match");
  }
  const snapshotRunId =
    snapshot !== null && typeof snapshot === "object" && typeof (snapshot as Record<string, unknown>).runId === "string"
      ? (snapshot as Record<string, string>).runId
      : undefined;
  if (
    snapshotRunId === undefined ||
    review.runId !== snapshotRunId ||
    review.reviewId !== `${review.runId}:${review.candidateSha256}` ||
    review.reviewedMetricCount !== asCount(snapshot, "metrics") ||
    review.reviewedSourceCount !== asCount(snapshot, "sources")
  ) {
    throw new Error("review identity does not match");
  }
  if (review.decision !== "auto_publish") {
    throw new Error(`automated review decision is ${review.decision}`);
  }
  const expectedChecks: CheckId[] = [
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
  if (
    review.checks.length !== expectedChecks.length ||
    expectedChecks.some((id) => !review.checks.some((check) => check.id === id))
  ) {
    throw new Error("automated review checks are incomplete");
  }
  if (
    review.checks.some((check) => check.status === "fail") ||
    review.issues.some((candidateIssue) => candidateIssue.severity === "block")
  ) {
    throw new Error("automated review contains a failed check");
  }
}
