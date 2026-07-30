import { realpath, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertMarketSnapshot } from "../market-data/schema.ts";
import type {
  BilingualText,
  MarketSnapshot,
  MetricKind,
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
  kind: MetricKind;
  sourceIds: string[];
  zh: LocalizedSignal;
  en: LocalizedSignal;
};

export type MarketBriefPayload = {
  schemaVersion: 1;
  runId: string;
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

const PAGE_ORDER: PageSlug[] = ["/", "/stocks", "/compute", "/energy", "/models", "/sic"];
const EMBEDDED_BRIEF =
  /<script id="embedded-market-brief" type="application\/json">[\s\S]*?<\/script>/;
const BODY_SCRIPT_ANCHOR = "\n    <script>\n      const params = ";

function featuredSignalIds(snapshot: MarketSnapshot): string[] {
  const limit = snapshot.cadence === "wednesday" ? 5 : 8;
  const ordered = snapshot.keySignalIds.map((id) => {
    const metric = snapshot.metrics[id];
    if (!metric) throw new Error(`Market brief references missing key signal ${id}`);
    return metric;
  });
  const preferred =
    snapshot.cadence === "wednesday"
      ? [
          ...ordered.filter((metric) => snapshot.pages[metric.page].changed),
          ...ordered.filter((metric) => !snapshot.pages[metric.page].changed),
        ]
      : ordered;
  const selected: string[] = [];

  for (const page of PAGE_ORDER) {
    const metric = preferred.find(
      (candidate) => candidate.page === page && !selected.includes(candidate.id),
    );
    if (metric && selected.length < limit) selected.push(metric.id);
  }
  for (const metric of preferred) {
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
  assertMarketSnapshot(snapshot);
  const signals = snapshot.keySignalIds.map((id): MarketBriefSignal => {
    const metric = snapshot.metrics[id];
    if (!metric) throw new Error(`Market brief references missing key signal ${id}`);
    const label = snapshot.pages[metric.page].report.signal;
    return {
      id,
      page: metric.page,
      kind: metric.kind,
      sourceIds: [...metric.sourceIds],
      zh: { label: label.zh, value: metric.display.zh },
      en: { label: label.en, value: metric.display.en },
    };
  });
  const sourceIds = [...new Set(signals.flatMap((signal) => signal.sourceIds))].sort();
  const report = snapshot.pages["/"].report;

  return {
    schemaVersion: 1,
    runId: snapshot.runId,
    cadence: snapshot.cadence,
    dataCutoff: snapshot.dataCutoff,
    sourceIds,
    signals,
    featuredSignalIds: featuredSignalIds(snapshot),
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

function isMarketBriefPayload(value: unknown): value is MarketBriefPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketBriefPayload>;
  const signalIds = new Set(
    Array.isArray(candidate.signals)
      ? candidate.signals
          .filter((signal) => signal && typeof signal.id === "string")
          .map((signal) => signal.id)
      : [],
  );
  const labels = candidate.labels;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.runId === "string" &&
    candidate.runId.length > 0 &&
    (candidate.cadence === "wednesday" ||
      candidate.cadence === "saturday" ||
      candidate.cadence === "month-end") &&
    typeof candidate.dataCutoff === "string" &&
    !Number.isNaN(Date.parse(candidate.dataCutoff)) &&
    Array.isArray(candidate.sourceIds) &&
    candidate.sourceIds.every((id) => typeof id === "string" && id.length > 0) &&
    Array.isArray(candidate.signals) &&
    candidate.signals.length > 0 &&
    candidate.signals.every(
      (signal) =>
        signal &&
        typeof signal.id === "string" &&
        signal.id.length > 0 &&
        typeof signal.page === "string" &&
        (signal.kind === "modeled" || signal.kind === "published") &&
        Array.isArray(signal.sourceIds) &&
        signal.sourceIds.length > 0 &&
        signal.sourceIds.every((id) => typeof id === "string" && id.length > 0) &&
        isLocalizedSignal(signal.zh) &&
        isLocalizedSignal(signal.en),
    ) &&
    Array.isArray(candidate.featuredSignalIds) &&
    candidate.featuredSignalIds.length >= 3 &&
    candidate.featuredSignalIds.every(
      (id) => typeof id === "string" && signalIds.has(id),
    ) &&
    Array.isArray(candidate.nextWeekObservations) &&
    candidate.nextWeekObservations.every(isBilingualText) &&
    labels !== undefined &&
    isBilingualText(labels.eyebrow) &&
    isBilingualText(labels.title) &&
    isBilingualText(labels.summary) &&
    isBilingualText(labels.signal) &&
    isBilingualText(labels.thesis) &&
    Array.isArray(labels.tags.zh) &&
    labels.tags.zh.every((tag) => typeof tag === "string" && tag.length > 0) &&
    Array.isArray(labels.tags.en) &&
    labels.tags.en.every((tag) => typeof tag === "string" && tag.length > 0) &&
    isBilingualText(candidate.methodology) &&
    isBilingualText(candidate.notInvestmentAdvice)
  );
}

function isCompleteBrief(brief: MarketBriefPayload): boolean {
  return (
    (brief.cadence === "saturday" || brief.cadence === "month-end") &&
    brief.featuredSignalIds.length >= 5 &&
    brief.featuredSignalIds.length <= 8 &&
    brief.nextWeekObservations.length > 0
  );
}

function hasChangedKeySignal(snapshot: MarketSnapshot): boolean {
  return snapshot.keySignalIds.some((id) => {
    const metric = snapshot.metrics[id];
    return metric ? snapshot.pages[metric.page].changed : true;
  });
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

async function loadExistingBrief(path: string): Promise<MarketBriefPayload | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isMarketBriefPayload(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function loadSnapshot(path: string): Promise<MarketSnapshot> {
  const resolved = await realpath(resolve(path));
  const file = await stat(resolved);
  if (!file.isFile()) throw new Error(`Market snapshot path is not a regular file: ${path}`);
  const value = JSON.parse(await readFile(resolved, "utf8")) as unknown;
  assertMarketSnapshot(value);
  return value;
}

export async function generateMarketBriefAssets(paths: MarketBriefAssetPaths): Promise<void> {
  const snapshot = await loadSnapshot(paths.snapshotPath);
  const existing = await loadExistingBrief(paths.canonicalData);
  const brief =
    snapshot.cadence === "wednesday" &&
    !hasChangedKeySignal(snapshot) &&
    existing &&
    isCompleteBrief(existing)
      ? existing
      : buildMarketBrief(snapshot);
  const data = serializeBrief(brief);
  const canonicalHtml = await readFile(paths.canonicalHtml, "utf8");
  const html = upsertEmbeddedBrief(canonicalHtml, brief);

  await Promise.all([
    writeFile(paths.canonicalData, data),
    writeFile(paths.publicData, data),
    writeFile(paths.canonicalHtml, html),
    writeFile(paths.publicHtml, html),
  ]);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return value;
}

function defaultPaths(): MarketBriefAssetPaths {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return {
    snapshotPath: resolve(repositoryRoot, option("--snapshot") ?? "data/market/current.json"),
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
  await generateMarketBriefAssets(defaultPaths());
}
