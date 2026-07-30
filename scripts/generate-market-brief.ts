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
const PAGE_SLUGS = new Set<PageSlug>(PAGE_ORDER);
const CADENCE_BOUNDS: Record<RunCadence, { min: number; max: number }> = {
  wednesday: { min: 3, max: 5 },
  saturday: { min: 5, max: 8 },
  "month-end": { min: 5, max: 8 },
};
const EMBEDDED_BRIEF =
  /<script id="embedded-market-brief" type="application\/json">[\s\S]*?<\/script>/;
const BODY_SCRIPT_ANCHOR = "\n    <script>\n      const params = ";

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

function featuredSignalIds(
  snapshot: MarketSnapshot,
  changedSignalIds: ReadonlySet<string> = new Set(),
): string[] {
  const limit = CADENCE_BOUNDS[snapshot.cadence].max;
  const ordered = snapshot.keySignalIds.map((id) => {
    const metric = snapshot.metrics[id];
    if (!metric) throw new Error(`Market brief references missing key signal ${id}`);
    return metric;
  });
  const selected: string[] = [];
  const changedPages = new Set<PageSlug>();

  if (snapshot.cadence === "wednesday") {
    for (const metric of ordered) {
      if (changedSignalIds.has(metric.id)) changedPages.add(metric.page);
    }
    if (changedSignalIds.size === 0) {
      for (const page of PAGE_ORDER) {
        if (snapshot.pages[page].changed) changedPages.add(page);
      }
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

export function buildMarketBrief(
  snapshot: MarketSnapshot,
  changedSignalIds: ReadonlySet<string> = new Set(),
): MarketBriefPayload {
  assertMarketSnapshot(snapshot);
  assertSnapshotBriefCardinality(snapshot);
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
    featuredSignalIds: featuredSignalIds(snapshot, changedSignalIds),
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
      typeof candidate.runId === "string" &&
      candidate.runId.length > 0 &&
      typeof candidate.dataCutoff === "string" &&
      !Number.isNaN(Date.parse(candidate.dataCutoff)) &&
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
          (signal.kind === "modeled" || signal.kind === "published") &&
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
  if (
    value.runId !== snapshot.runId ||
    value.cadence !== snapshot.cadence ||
    value.dataCutoff !== snapshot.dataCutoff
  ) {
    throw new Error(`${label} envelope does not match snapshot`);
  }
  const snapshotSignalIds = new Set(snapshot.keySignalIds);
  if (
    value.signals.length !== snapshotSignalIds.size ||
    value.signals.some((signal) => !snapshotSignalIds.has(signal.id))
  ) {
    throw new Error(`${label} signals do not match snapshot`);
  }
  for (const signal of value.signals) {
    const metric = snapshot.metrics[signal.id];
    const reportSignal = metric
      ? snapshot.pages[metric.page].report.signal
      : undefined;
    if (
      !metric ||
      metric.page !== signal.page ||
      metric.kind !== signal.kind ||
      metric.display.zh !== signal.zh.value ||
      metric.display.en !== signal.en.value ||
      reportSignal?.zh !== signal.zh.label ||
      reportSignal?.en !== signal.en.label ||
      !sameStringSet(metric.sourceIds, signal.sourceIds)
    ) {
      throw new Error(
        `${label} signal ${signal.id} does not match snapshot identity`,
      );
    }
  }
  const boundSourceIds = [
    ...new Set(
      snapshot.keySignalIds.flatMap(
        (signalId) => snapshot.metrics[signalId]?.sourceIds ?? [],
      ),
    ),
  ];
  if (
    !sameStringSet(value.sourceIds, boundSourceIds) ||
    value.sourceIds.some((sourceId) => snapshot.sources[sourceId] === undefined)
  ) {
    throw new Error(`${label} sources do not match snapshot`);
  }
  if (
    JSON.stringify(value.nextWeekObservations) !==
    JSON.stringify(nextWeekObservations(snapshot))
  ) {
    throw new Error(`${label} observation policy does not match snapshot`);
  }
}

function isCompleteBrief(brief: MarketBriefPayload): boolean {
  return (
    (brief.cadence === "saturday" || brief.cadence === "month-end") &&
    brief.featuredSignalIds.length >= 5 &&
    brief.featuredSignalIds.length <= 8 &&
    brief.nextWeekObservations.length > 0
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function changedKeySignalIds(
  snapshot: MarketSnapshot,
  prior: MarketBriefPayload,
): { orderChanged: boolean; signalIds: Set<string> } {
  const signalIds = new Set<string>();
  const priorById = new Map(prior.signals.map((signal) => [signal.id, signal]));
  for (const id of snapshot.keySignalIds) {
    const metric = snapshot.metrics[id];
    const previous = priorById.get(id);
    if (
      !metric ||
      !previous ||
      metric.page !== previous.page ||
      metric.kind !== previous.kind ||
      metric.display.zh !== previous.zh.value ||
      metric.display.en !== previous.en.value ||
      !sameStringSet(metric.sourceIds, previous.sourceIds)
    ) {
      signalIds.add(id);
    }
  }
  return {
    orderChanged:
      snapshot.keySignalIds.length !== prior.signals.length ||
      snapshot.keySignalIds.some((id, index) => id !== prior.signals[index]?.id),
    signalIds,
  };
}

function reusePriorContent(
  current: MarketBriefPayload,
  prior: MarketBriefPayload,
): MarketBriefPayload {
  return {
    ...current,
    labels: prior.labels,
    methodology: prior.methodology,
    notInvestmentAdvice: prior.notInvestmentAdvice,
  };
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
  assertSnapshotBriefCardinality(snapshot);
  const existing = await loadExistingBrief(paths.canonicalData);
  const changes =
    snapshot.cadence === "wednesday" && existing && isCompleteBrief(existing)
      ? changedKeySignalIds(snapshot, existing)
      : { orderChanged: false, signalIds: new Set<string>() };
  const current = buildMarketBrief(snapshot, changes.signalIds);
  const brief =
    snapshot.cadence === "wednesday" &&
    existing &&
    isCompleteBrief(existing) &&
    changes.signalIds.size === 0 &&
    !changes.orderChanged
      ? reusePriorContent(current, existing)
      : current;
  if (!isMarketBriefPayload(brief)) {
    throw new Error("Invalid generated market brief payload");
  }
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
