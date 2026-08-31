import { realpath, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { evaluateMetricFreshness } from "../market-data/freshness.ts";
import { hashCandidate } from "../market-data/review.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "../market-data/schema.ts";
import type {
  BilingualText,
  MarketSnapshot,
  MetricRecord,
  PageSlug,
  RunCadence,
} from "../market-data/types.ts";

type LocalizedSignal = {
  label: string;
  value: string;
};

export type MarketBriefSignal = {
  id: string;
  page: PageSlug;
  kind: "published-fact" | "market-observation" | "atlas-model";
  asOf: string;
  sourceIds: string[];
  zh: LocalizedSignal;
  en: LocalizedSignal;
};

export type MarketBriefPayload = {
  schemaVersion: 1;
  cadence: RunCadence;
  dataCutoff: string;
  sourceIds: string[];
  signals: MarketBriefSignal[];
  featuredSignalIds: string[];
  nextWeekObservations: BilingualText[];
  labels: {
    eyebrow: BilingualText;
    title: BilingualText;
    summary: BilingualText;
    signal: BilingualText;
    thesis: BilingualText;
    tags: Record<"zh" | "en", string[]>;
  };
  methodology: BilingualText;
  notInvestmentAdvice: BilingualText;
};

export type MarketBriefAssetPaths = {
  snapshotPath: string;
  canonicalData: string;
  publicData: string;
  canonicalHtml: string;
  publicHtml: string;
};

const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCanonicalUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    CANONICAL_UTC_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

/**
 * Non-reader-facing identity for the complete, cutoff-bound brief payload.
 * The domain separator prevents this digest from being confused with a
 * candidate snapshot hash while remaining deterministic across exports.
 */
export function marketBriefPayloadSha256(brief: MarketBriefPayload): string {
  return hashCandidate({
    identity: "ai-market-atlas:market-brief:v1",
    dataCutoff: brief.dataCutoff,
    payload: brief,
  });
}

const PAGE_ORDER: PageSlug[] = ["/", "/stocks", "/compute", "/energy", "/models", "/sic"];
const PAGE_SLUGS = new Set<PageSlug>(PAGE_ORDER);
const CADENCE_BOUNDS: Record<RunCadence, { min: number; max: number }> = {
  wednesday: { min: 3, max: 5 },
  saturday: { min: 5, max: 8 },
  "month-end": { min: 5, max: 8 },
};
const EMBEDDED_BRIEF =
  /<script id="embedded-market-brief" type="application\/json">[\s\S]*?<\/script>/;
const BODY_SCRIPT_ANCHOR = "\n    <script>\n      const params = ";
const BRIEF_VALIDATOR_ANCHOR = "      function hasLocalizedSignal(signal) {";
const BRIEF_VALIDATOR_HELPER = `      function isCanonicalUtcTimestamp(value) {
        if (
          typeof value !== "string" ||
          !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)
        ) {
          return false;
        }
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(5, 7));
        const day = Number(value.slice(8, 10));
        const hour = Number(value.slice(11, 13));
        const minute = Number(value.slice(14, 16));
        const second = Number(value.slice(17, 19));
        const millisecond = Number(value.slice(20, 23));
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return (
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= daysInMonth[month - 1] &&
          hour <= 23 &&
          minute <= 59 &&
          second <= 59 &&
          millisecond <= 999
        );
      }

`;
const BRIEF_PAYLOAD_BINDING_ANCHOR = "      function hasLocalizedSignal(signal) {";
const BRIEF_PAYLOAD_BINDING_HELPER = `      function canonicalizeBriefValue(value) {
        if (Array.isArray(value)) return value.map(canonicalizeBriefValue);
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value)
              .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
              .map(([key, child]) => [key, canonicalizeBriefValue(child)]),
          );
        }
        return value;
      }

      function sameBriefPayload(left, right) {
        return JSON.stringify(canonicalizeBriefValue(left)) ===
          JSON.stringify(canonicalizeBriefValue(right));
      }

`;

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains a duplicate key signal`);
  }
}

function assertSnapshotBriefCardinality(snapshot: MarketSnapshot): void {
  assertUnique(snapshot.keySignalIds, "Market snapshot key signal list");
  const { min } = CADENCE_BOUNDS[snapshot.cadence];
  if (snapshot.keySignalIds.length < min) {
    throw new Error(
      `${snapshot.cadence} market brief requires at least ${min} unique key signals`,
    );
  }
  const tags = snapshot.pages["/"].report.thesis.tags;
  if (tags.zh.length !== 3 || tags.en.length !== 3) {
    throw new Error("Market brief requires exactly three thesis tags per language");
  }
  if (
    snapshot.cadence !== "wednesday" &&
    !PAGE_ORDER.some(
      (page) => snapshot.pages[page].report.nextObservations.length > 0,
    )
  ) {
    throw new Error(`${snapshot.cadence} market brief requires next-week observations`);
  }
}

function freshKeySignals(snapshot: MarketSnapshot): MetricRecord[] {
  const signals: MetricRecord[] = [];
  const cutoff = Date.parse(snapshot.dataCutoff);
  for (const id of snapshot.keySignalIds) {
    const metric = snapshot.metrics[id];
    if (!metric) throw new Error(`Market brief references missing key signal ${id}`);
    const asOf = Date.parse(metric.asOf);
    if (asOf > cutoff) {
      throw new Error(`Key signal is from the future and cannot be rendered: ${metric.id}`);
    }
    const freshness = evaluateMetricFreshness(metric, snapshot.dataCutoff);
    if (freshness.state === "stale") {
      if (metric.required) {
        throw new Error(
          `Required key signal is stale and cannot be rendered: ${metric.id} (${freshness.policy.class} policy)`,
        );
      }
      continue;
    }
    signals.push(metric);
  }
  const { min } = CADENCE_BOUNDS[snapshot.cadence];
  if (signals.length < min) {
    throw new Error(`${snapshot.cadence} market brief requires at least ${min} fresh key signals`);
  }
  return signals;
}

function briefSignalKind(metric: MetricRecord): MarketBriefSignal["kind"] {
  const policy = evaluateMetricFreshness(metric, metric.asOf).policy;
  if (metric.kind === "modeled") return "atlas-model";
  return policy.class === "market-close" ? "market-observation" : "published-fact";
}

function featuredSignalIds(snapshot: MarketSnapshot, ordered: readonly MetricRecord[]): string[] {
  const limit = CADENCE_BOUNDS[snapshot.cadence].max;
  const selected: string[] = [];
  const changedPages = new Set<PageSlug>();

  if (snapshot.cadence === "wednesday") {
    for (const page of PAGE_ORDER) {
      if (snapshot.pages[page].changed) changedPages.add(page);
    }
    for (const metric of ordered) {
      if (changedPages.has(metric.page) && selected.length < limit) {
        selected.push(metric.id);
      }
    }
  }

  for (const page of PAGE_ORDER) {
    const metric = ordered.find(
      (candidate) => candidate.page === page && !selected.includes(candidate.id),
    );
    if (metric && selected.length < limit) selected.push(metric.id);
  }
  for (const metric of ordered) {
    if (selected.length === limit) break;
    if (!selected.includes(metric.id)) selected.push(metric.id);
  }
  return selected;
}

function nextWeekObservations(snapshot: MarketSnapshot): BilingualText[] {
  if (snapshot.cadence === "wednesday") return [];
  return PAGE_ORDER.flatMap((page) => snapshot.pages[page].report.nextObservations.slice(0, 1));
}

export function buildMarketBrief(snapshot: MarketSnapshot): MarketBriefPayload {
  assertPublishedMarketSnapshot(snapshot);
  assertSnapshotBriefCardinality(snapshot);
  const freshSignals = freshKeySignals(snapshot);
  const signals = freshSignals.map((metric): MarketBriefSignal => {
    const label = snapshot.pages[metric.page].report.signal;
    return {
      id: metric.id,
      page: metric.page,
      kind: briefSignalKind(metric),
      asOf: metric.asOf,
      sourceIds: [...metric.sourceIds],
      zh: { label: label.zh, value: metric.display.zh },
      en: { label: label.en, value: metric.display.en },
    };
  });
  const sourceIds = [...new Set(signals.flatMap((signal) => signal.sourceIds))].sort();
  const report = snapshot.pages["/"].report;

  return {
    schemaVersion: 1,
    cadence: snapshot.cadence,
    dataCutoff: snapshot.dataCutoff,
    sourceIds,
    signals,
    featuredSignalIds: featuredSignalIds(snapshot, freshSignals),
    nextWeekObservations: nextWeekObservations(snapshot),
    labels: {
      eyebrow: report.eyebrow,
      title: report.title,
      summary: report.summary,
      signal: report.signal,
      thesis: report.thesis.title,
      tags: report.thesis.tags,
    },
    methodology: {
      zh: "模型值由 AI Market Atlas 依已列來源建模；請查閱來源與方法說明。",
      en: "Modeled values are produced by AI Market Atlas from the listed sources; review the sources and methodology.",
    },
    notInvestmentAdvice: {
      zh: "本快報不構成投資建議。",
      en: "This brief is not investment advice.",
    },
  };
}

function isBilingualText(value: unknown): value is BilingualText {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BilingualText>;
  return (
    typeof candidate.zh === "string" &&
    candidate.zh.length > 0 &&
    typeof candidate.en === "string" &&
    candidate.en.length > 0
  );
}

function isLocalizedSignal(value: unknown): value is LocalizedSignal {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalizedSignal>;
  return (
    typeof candidate.label === "string" &&
    candidate.label.length > 0 &&
    typeof candidate.value === "string" &&
    candidate.value.length > 0
  );
}

export function isMarketBriefPayload(value: unknown): value is MarketBriefPayload {
  try {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<MarketBriefPayload>;
    if (
      candidate.cadence !== "wednesday" &&
      candidate.cadence !== "saturday" &&
      candidate.cadence !== "month-end"
    ) {
      return false;
    }
    const signals = Array.isArray(candidate.signals) ? candidate.signals : [];
    const signalIds = signals
      .filter((signal) => signal && typeof signal.id === "string")
      .map((signal) => signal.id);
    const signalIdSet = new Set(signalIds);
    const sourceIds = Array.isArray(candidate.sourceIds) ? candidate.sourceIds : [];
    const sourceIdSet = new Set(sourceIds);
    const featuredSignalIds = Array.isArray(candidate.featuredSignalIds)
      ? candidate.featuredSignalIds
      : [];
    const featuredIdSet = new Set(featuredSignalIds);
    const { min, max } = CADENCE_BOUNDS[candidate.cadence];
    const labels = candidate.labels;
    const structurallyValid =
      candidate.schemaVersion === 1 &&
      !("runId" in candidate) &&
      isCanonicalUtcTimestamp(candidate.dataCutoff) &&
      sourceIds.length > 0 &&
      sourceIds.every((id) => typeof id === "string" && id.length > 0) &&
      sourceIdSet.size === sourceIds.length &&
      signals.length >= min &&
      signalIdSet.size === signals.length &&
      signals.every(
        (signal) =>
          signal &&
          typeof signal.id === "string" &&
          signal.id.length > 0 &&
          PAGE_SLUGS.has(signal.page) &&
          (signal.kind === "published-fact" ||
            signal.kind === "market-observation" ||
            signal.kind === "atlas-model") &&
          isCanonicalUtcTimestamp(signal.asOf) &&
          Date.parse(signal.asOf) <= Date.parse(candidate.dataCutoff) &&
          Array.isArray(signal.sourceIds) &&
          signal.sourceIds.length > 0 &&
          signal.sourceIds.every((id) => typeof id === "string" && id.length > 0) &&
          new Set(signal.sourceIds).size === signal.sourceIds.length &&
          signal.sourceIds.every((id) => sourceIdSet.has(id)) &&
          isLocalizedSignal(signal.zh) &&
          isLocalizedSignal(signal.en),
      ) &&
      featuredSignalIds.length >= min &&
      featuredSignalIds.length <= max &&
      featuredIdSet.size === featuredSignalIds.length &&
      featuredSignalIds.every((id) => typeof id === "string" && signalIdSet.has(id)) &&
      Array.isArray(candidate.nextWeekObservations) &&
      candidate.nextWeekObservations.every(isBilingualText) &&
      Boolean(labels) &&
      isBilingualText(labels?.eyebrow) &&
      isBilingualText(labels?.title) &&
      isBilingualText(labels?.summary) &&
      isBilingualText(labels?.signal) &&
      isBilingualText(labels?.thesis) &&
      Array.isArray(labels?.tags?.zh) &&
      labels.tags.zh.length === 3 &&
      labels.tags.zh.every((tag) => typeof tag === "string" && tag.length > 0) &&
      Array.isArray(labels?.tags?.en) &&
      labels.tags.en.length === 3 &&
      labels.tags.en.every((tag) => typeof tag === "string" && tag.length > 0) &&
      isBilingualText(candidate.methodology) &&
      isBilingualText(candidate.notInvestmentAdvice);
    if (!structurallyValid) return false;

    const boundSourceIds = new Set(signals.flatMap((signal) => signal.sourceIds));
    if (
      boundSourceIds.size !== sourceIdSet.size ||
      [...boundSourceIds].some((id) => !sourceIdSet.has(id))
    ) {
      return false;
    }
    return candidate.cadence === "wednesday"
      ? candidate.nextWeekObservations.length === 0
      : candidate.nextWeekObservations.length > 0;
  } catch {
    return false;
  }
}

export function assertMarketBriefMatchesSnapshot(
  value: unknown,
  snapshot: MarketSnapshot,
  label = "Market brief",
): asserts value is MarketBriefPayload {
  if (!isMarketBriefPayload(value)) {
    throw new Error(`${label} is not a valid market brief payload`);
  }
  const canonical = buildMarketBrief(snapshot);
  if (!isDeepStrictEqual(value, canonical)) {
    throw new Error(`${label} semantics do not match snapshot`);
  }
}

function serializeBrief(brief: MarketBriefPayload): string {
  return `${JSON.stringify(brief, null, 2)}\n`;
}

function embeddedJson(brief: MarketBriefPayload): string {
  return JSON.stringify(brief).replaceAll("<", "\\u003c");
}

function upsertEmbeddedBrief(html: string, brief: MarketBriefPayload): string {
  const embedded = `<script id="embedded-market-brief" type="application/json">${embeddedJson(brief)}</script>`;
  if (EMBEDDED_BRIEF.test(html)) return html.replace(EMBEDDED_BRIEF, embedded);
  if (!html.includes(BODY_SCRIPT_ANCHOR)) {
    throw new Error("HyperFrames HTML is missing the market brief script anchor");
  }
  return html.replace(BODY_SCRIPT_ANCHOR, `\n    ${embedded}${BODY_SCRIPT_ANCHOR}`);
}

function hardenBriefValidation(html: string): string {
  if (!html.includes(BRIEF_VALIDATOR_ANCHOR)) {
    throw new Error("HyperFrames HTML is missing the brief validator anchor");
  }
  let hardened = html.includes("function isCanonicalUtcTimestamp(value)")
    ? html
    : html.replace(BRIEF_VALIDATOR_ANCHOR, `${BRIEF_VALIDATOR_HELPER}${BRIEF_VALIDATOR_ANCHOR}`);
  if (!hardened.includes("function canonicalizeBriefValue(value)")) {
    hardened = hardened.replace(
      BRIEF_PAYLOAD_BINDING_ANCHOR,
      `${BRIEF_PAYLOAD_BINDING_HELPER}${BRIEF_PAYLOAD_BINDING_ANCHOR}`,
    );
  }
  hardened = hardened
    .replace(
      'Object.prototype.hasOwnProperty.call(brief, "runId")',
      'Object.keys(brief).sort().join(",") !== "cadence,dataCutoff,featuredSignalIds,labels,methodology,nextWeekObservations,notInvestmentAdvice,schemaVersion,signals,sourceIds"',
    )
    .replace(
      'typeof signal.asOf === "string" &&\n          !Number.isNaN(Date.parse(signal.asOf))',
      'isCanonicalUtcTimestamp(signal.asOf)',
    )
    .replace(
      'typeof brief.dataCutoff !== "string" ||\n          Number.isNaN(Date.parse(brief.dataCutoff))',
      '!isCanonicalUtcTimestamp(brief.dataCutoff) ||\n          brief.signals.some((signal) => signal.asOf > brief.dataCutoff)',
    );
  return hardened;
}

async function loadSnapshot(path: string): Promise<MarketSnapshot> {
  const resolved = await realpath(resolve(path));
  const file = await stat(resolved);
  if (!file.isFile()) throw new Error(`Market snapshot path is not a regular file: ${path}`);
  const value = JSON.parse(await readFile(resolved, "utf8")) as unknown;
  if (basename(resolved) === "candidate.json") {
    assertMarketSnapshot(value);
  } else {
    assertPublishedMarketSnapshot(value);
  }
  return value;
}

export async function generateMarketBriefAssets(paths: MarketBriefAssetPaths): Promise<void> {
  const snapshot = await loadSnapshot(paths.snapshotPath);
  assertSnapshotBriefCardinality(snapshot);
  const brief = buildMarketBrief(snapshot);
  assertMarketBriefMatchesSnapshot(brief, snapshot, "Generated market brief");
  const data = serializeBrief(brief);
  const canonicalHtml = await readFile(paths.canonicalHtml, "utf8");
  const html = hardenBriefValidation(upsertEmbeddedBrief(canonicalHtml, brief));

  await Promise.all([
    writeFile(paths.canonicalData, data),
    writeFile(paths.publicData, data),
    writeFile(paths.canonicalHtml, html),
    writeFile(paths.publicHtml, html),
  ]);
}

function parseCliArgs(args: string[]): { snapshotPath?: string } {
  let snapshotPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--snapshot" || argument.startsWith("--snapshot=")) {
      if (snapshotPath !== undefined) throw new Error("Duplicate --snapshot option");
      const value =
        argument === "--snapshot" ? args[++index] : argument.slice("--snapshot=".length);
      if (!value || value.startsWith("--")) throw new Error("--snapshot requires a path");
      snapshotPath = value;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    throw new Error(`Unexpected positional argument: ${argument}`);
  }
  return { snapshotPath };
}

function defaultPaths(snapshotOption?: string): MarketBriefAssetPaths {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return {
    snapshotPath: resolve(repositoryRoot, snapshotOption ?? "data/market/current.json"),
    canonicalData: resolve(repositoryRoot, "hyperframes/weekly-ai-market-brief/data.json"),
    publicData: resolve(repositoryRoot, "public/market-brief/data.json"),
    canonicalHtml: resolve(repositoryRoot, "hyperframes/weekly-ai-market-brief/index.html"),
    publicHtml: resolve(repositoryRoot, "public/market-brief/index.html"),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { snapshotPath } = parseCliArgs(process.argv.slice(2));
  await generateMarketBriefAssets(defaultPaths(snapshotPath));
}
