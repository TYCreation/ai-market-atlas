import { REQUIRED_METRIC_IDS, REQUIRED_STOCK_METRIC_IDS } from "./catalog.ts";
import type { MarketSnapshot, MetricRecord, PageSlug, SourceRecord } from "./types.ts";

const PAGE_SLUGS = ["/", "/stocks", "/compute", "/energy", "/models", "/sic"] as const;
const CADENCES = new Set(["wednesday", "saturday", "month-end"]);
const SOURCE_KINDS = new Set(["official", "company", "research", "pricing", "market", "atlas"]);
const METRIC_KINDS = new Set(["published", "modeled"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const STATUSES = new Set(["verified", "waiting"]);
const SESSION_STATES = new Set(["closed", "holiday"]);
const STANCES = new Set(["bullish", "neutral", "bearish"]);
const CHANGE_REASONS = new Set([
  "first-party-event",
  "rounded-value-change",
  "gate-worthy-movement",
  "conclusion-changing-evidence",
]);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_QUERY_PARAMETER = /(?:api[_-]?key|access[_-]?token|token|secret|signature|sig|password|credential|key)/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid market snapshot: ${message}`);
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) fail(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${path} must be a non-empty string`);
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be a finite number`);
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function requireIsoTimestamp(value: unknown, path: string): string {
  const timestamp = requireString(value, path);
  if (!ISO_TIMESTAMP.test(timestamp) || Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    fail(`${path} must be an ISO timestamp`);
  }
  return timestamp;
}

function requireBilingual(value: unknown, path: string): void {
  const text = requireRecord(value, path);
  requireString(text.zh, `${path}.zh`);
  requireString(text.en, `${path}.en`);
}

function requireStringArray(value: unknown, path: string): string[] {
  return requireArray(value, path).map((item, index) => requireString(item, `${path}[${index}]`));
}

function assertSafePublicUrl(value: unknown, path: string): void {
  const raw = requireString(value, path);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(`${path} must be a valid public URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`${path} must use http or https`);
  }
  if (url.username || url.password) fail(`${path} must not contain credentials`);
  for (const name of url.searchParams.keys()) {
    if (SECRET_QUERY_PARAMETER.test(name)) fail(`${path} must not contain secret-like query parameters`);
  }
}

export function assertSourceRecord(
  value: unknown,
  path = "source",
  expectedId?: string,
): asserts value is SourceRecord {
  const source = requireRecord(value, path);
  const id = requireString(source.id, `${path}.id`);
  if (expectedId !== undefined && id !== expectedId) fail(`${path}.id must equal ${expectedId}`);
  if (!SOURCE_KINDS.has(requireString(source.kind, `${path}.kind`))) {
    fail(`${path}.kind is unsupported`);
  }
  requireString(source.publisher, `${path}.publisher`);
  requireString(source.title, `${path}.title`);
  if (source.url !== undefined) assertSafePublicUrl(source.url, `${path}.url`);
  requireIsoTimestamp(source.publishedAt, `${path}.publishedAt`);
  requireIsoTimestamp(source.retrievedAt, `${path}.retrievedAt`);
  requireBilingual(source.scope, `${path}.scope`);
}

function assertSource(key: string, value: unknown, ids: Set<string>): SourceRecord {
  assertSourceRecord(value, `sources.${key}`, key);
  if (ids.has(value.id)) fail(`duplicate source ID ${value.id}`);
  ids.add(value.id);
  return value;
}

function assertMetric(
  key: string,
  value: unknown,
  ids: Set<string>,
  sources: UnknownRecord,
): MetricRecord {
  const metric = requireRecord(value, `metrics.${key}`);
  const id = requireString(metric.id, `metrics.${key}.id`);
  if (id !== key || ids.has(id)) fail(`duplicate metric ID ${id}`);
  ids.add(id);
  if (!PAGE_SLUGS.includes(requireString(metric.page, `metrics.${key}.page`) as PageSlug)) {
    fail(`metrics.${key}.page is unsupported`);
  }
  if (typeof metric.required !== "boolean") fail(`${id}.required must be a boolean`);
  if (!METRIC_KINDS.has(requireString(metric.kind, `${id}.kind`))) fail(`${id}.kind is unsupported`);
  requireNumber(metric.numericValue, `${id}.numericValue`);
  if (metric.previousNumericValue !== undefined) requireNumber(metric.previousNumericValue, `${id}.previousNumericValue`);
  requireBilingual(metric.display, `${id}.display`);
  requireString(metric.unit, `${id}.unit`);
  for (const optional of ["currency", "market", "marketTimezone", "primaryListing"] as const) {
    if (metric[optional] !== undefined) requireString(metric[optional], `${id}.${optional}`);
  }
  if (metric.securityType !== undefined && !["primary", "adr", "not-applicable"].includes(requireString(metric.securityType, `${id}.securityType`))) {
    fail(`${id}.securityType is unsupported`);
  }
  requireIsoTimestamp(metric.asOf, `${id}.asOf`);
  if (metric.sessionState !== undefined && !SESSION_STATES.has(requireString(metric.sessionState, `${id}.sessionState`))) {
    fail(`${id}.sessionState is unsupported`);
  }
  const hasMarketFurniture = [metric.market, metric.marketTimezone, metric.primaryListing, metric.securityType]
    .some((field) => field !== undefined);
  if (metric.kind === "published" && hasMarketFurniture && metric.sessionState === undefined) {
    fail(`${id}.sessionState is required for published market metrics`);
  }
  const sourceIds = requireStringArray(metric.sourceIds, `${id}.sourceIds`);
  if (metric.required && sourceIds.length === 0) fail(`${id} must have at least one source`);
  for (const sourceId of sourceIds) {
    if (!sources[sourceId]) fail(`${id} references missing source ${sourceId}`);
  }
  const observations = requireArray(metric.observations, `${id}.observations`);
  const observedSources = new Set<string>();
  for (const [index, observationValue] of observations.entries()) {
    const observation = requireRecord(observationValue, `${id}.observations[${index}]`);
    const sourceId = requireString(observation.sourceId, `${id}.observations[${index}].sourceId`);
    if (!sources[sourceId] || !sourceIds.includes(sourceId)) {
      fail(`${id}.observations[${index}] references an unsourced observation`);
    }
    observedSources.add(sourceId);
    requireNumber(observation.numericValue, `${id}.observations[${index}].numericValue`);
    requireIsoTimestamp(observation.asOf, `${id}.observations[${index}].asOf`);
  }
  if (metric.kind === "published" && id.startsWith("stocks.") && id.endsWith(".price") && observedSources.size < 2) {
    fail(`${id} must have at least two independent observations`);
  }
  if (!CONFIDENCE.has(requireString(metric.confidence, `${id}.confidence`))) fail(`${id}.confidence is unsupported`);
  if (!STATUSES.has(requireString(metric.status, `${id}.status`))) fail(`${id}.status is unsupported`);
  if (metric.required && metric.confidence === "low" && metric.status === "verified") {
    fail(`${id} cannot be verified with low confidence`);
  }
  return metric as MetricRecord;
}

function assertMetricReferences(ids: string[], path: string, metrics: UnknownRecord): void {
  for (const id of ids) {
    const metric = metrics[id];
    if (!isRecord(metric) || !Array.isArray(metric.sourceIds) || metric.sourceIds.length === 0) {
      fail(`${path} references a metric without sources: ${id}`);
    }
  }
}

function assertPage(key: PageSlug, value: unknown, metrics: UnknownRecord): void {
  const page = requireRecord(value, `pages.${key}`);
  if (typeof page.changed !== "boolean") fail(`pages.${key}.changed must be a boolean`);
  for (const [index, reason] of requireArray(page.changeReasons, `pages.${key}.changeReasons`).entries()) {
    if (!CHANGE_REASONS.has(requireString(reason, `pages.${key}.changeReasons[${index}]`))) {
      fail(`pages.${key}.changeReasons[${index}] is unsupported`);
    }
  }
  requireIsoTimestamp(page.verifiedAt, `pages.${key}.verifiedAt`);
  for (const stance of ["thesisStance", "previousThesisStance"] as const) {
    if (!STANCES.has(requireString(page[stance], `pages.${key}.${stance}`))) fail(`pages.${key}.${stance} is unsupported`);
  }
  assertMetricReferences(requireStringArray(page.thesisMetricIds, `pages.${key}.thesisMetricIds`), `pages.${key}.thesisMetricIds`, metrics);
  const report = requireRecord(page.report, `pages.${key}.report`);
  for (const field of ["eyebrow", "title", "summary", "signal"] as const) requireBilingual(report[field], `pages.${key}.report.${field}`);
  const thesis = requireRecord(report.thesis, `pages.${key}.report.thesis`);
  requireBilingual(thesis.title, `pages.${key}.report.thesis.title`);
  requireBilingual(thesis.body, `pages.${key}.report.thesis.body`);
  const tags = requireRecord(thesis.tags, `pages.${key}.report.thesis.tags`);
  requireStringArray(tags.zh, `pages.${key}.report.thesis.tags.zh`);
  requireStringArray(tags.en, `pages.${key}.report.thesis.tags.en`);
  for (const field of ["supportingEvidence", "opposingEvidence"] as const) {
    for (const [index, evidenceValue] of requireArray(report[field], `pages.${key}.report.${field}`).entries()) {
      const evidence = requireRecord(evidenceValue, `pages.${key}.report.${field}[${index}]`);
      requireBilingual(evidence.text, `pages.${key}.report.${field}[${index}].text`);
      assertMetricReferences(requireStringArray(evidence.metricIds, `pages.${key}.report.${field}[${index}].metricIds`), `pages.${key}.report.${field}[${index}].metricIds`, metrics);
    }
  }
  for (const field of ["catalysts", "risks", "nextObservations"] as const) {
    for (const [index, text] of requireArray(report[field], `pages.${key}.report.${field}`).entries()) {
      requireBilingual(text, `pages.${key}.report.${field}[${index}]`);
    }
  }
}

export function assertMarketSnapshot(value: unknown): asserts value is MarketSnapshot {
  const snapshot = requireRecord(value, "snapshot");
  if (snapshot.schemaVersion !== 1) fail("schemaVersion must be 1");
  requireString(snapshot.runId, "runId");
  if (!CADENCES.has(requireString(snapshot.cadence, "cadence"))) fail("cadence is unsupported");
  requireIsoTimestamp(snapshot.generatedAt, "generatedAt");
  requireIsoTimestamp(snapshot.dataCutoff, "dataCutoff");
  const sources = requireRecord(snapshot.sources, "sources");
  const sourceIds = new Set<string>();
  for (const [key, source] of Object.entries(sources)) assertSource(key, source, sourceIds);
  const metrics = requireRecord(snapshot.metrics, "metrics");
  const metricIds = new Set<string>();
  for (const [key, metric] of Object.entries(metrics)) assertMetric(key, metric, metricIds, sources);
  for (const id of REQUIRED_METRIC_IDS) {
    if (!metrics[id]) fail(`required catalog metric is missing: ${id}`);
  }
  for (const id of REQUIRED_STOCK_METRIC_IDS) {
    if (!metrics[id]) fail(`required equity metric is missing: ${id}`);
  }
  const pages = requireRecord(snapshot.pages, "pages");
  for (const slug of PAGE_SLUGS) {
    if (!pages[slug]) fail(`page is missing: ${slug}`);
    assertPage(slug, pages[slug], metrics);
  }
  assertMetricReferences(requireStringArray(snapshot.keySignalIds, "keySignalIds"), "keySignalIds", metrics);
}
