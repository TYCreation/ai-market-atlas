import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildMarketBrief,
  generateMarketBriefAssets,
  isMarketBriefPayload,
  type MarketBriefAssetPaths,
  type MarketBriefPayload,
} from "../../scripts/generate-market-brief.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const snapshotUrl = new URL("../../data/market/current.json", import.meta.url);
const canonicalHtmlUrl = new URL(
  "../../hyperframes/weekly-ai-market-brief/index.html",
  import.meta.url,
);
const repositoryRootUrl = new URL("../../", import.meta.url);

async function currentSnapshot(): Promise<MarketSnapshot> {
  return JSON.parse(await readFile(snapshotUrl, "utf8")) as MarketSnapshot;
}

async function makeAssetWorkspace(snapshot: MarketSnapshot): Promise<MarketBriefAssetPaths> {
  const root = await mkdtemp(join(tmpdir(), "atlas-market-brief-"));
  const paths = {
    snapshotPath: join(root, "snapshot.json"),
    canonicalData: join(root, "canonical-data.json"),
    publicData: join(root, "public-data.json"),
    canonicalHtml: join(root, "canonical-index.html"),
    publicHtml: join(root, "public-index.html"),
  };
  await writeFile(paths.snapshotPath, `${JSON.stringify(snapshot)}\n`);
  await copyFile(canonicalHtmlUrl, paths.canonicalHtml);
  await copyFile(canonicalHtmlUrl, paths.publicHtml);
  return paths;
}

function embeddedBrief(html: string): MarketBriefPayload {
  const match = html.match(
    /<script id="embedded-market-brief" type="application\/json">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "generated HTML must contain an embedded market brief");
  return JSON.parse(match[1]) as MarketBriefPayload;
}

function makeWednesday(snapshot: MarketSnapshot): MarketSnapshot {
  const wednesday = structuredClone(snapshot);
  wednesday.runId = "2026-07-29-wednesday";
  wednesday.cadence = "wednesday";
  wednesday.generatedAt = "2026-07-29T01:00:00.000Z";
  wednesday.dataCutoff = "2026-07-29T01:00:00.000Z";
  for (const page of Object.values(wednesday.pages)) {
    page.changed = false;
    page.changeReasons = [];
  }
  return wednesday;
}

async function generatePriorBrief(
  snapshot: MarketSnapshot,
): Promise<{ paths: MarketBriefAssetPaths; prior: MarketBriefPayload }> {
  const paths = await makeAssetWorkspace(snapshot);
  await generateMarketBriefAssets(paths);
  return {
    paths,
    prior: JSON.parse(await readFile(paths.canonicalData, "utf8")) as MarketBriefPayload,
  };
}

async function makeCliWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-market-brief-cli-"));
  for (const relative of [
    "scripts/generate-market-brief.ts",
    "market-data",
    "data/market/current.json",
    "hyperframes/weekly-ai-market-brief",
    "public/market-brief",
  ]) {
    const source = new URL(relative, repositoryRootUrl);
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
  return root;
}

async function runBriefCli(
  cwd: string,
  args: string[],
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "scripts/generate-market-brief.ts", ...args],
      { cwd },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ code, stderr, stdout }));
  });
}

test("generates one bilingual brief from the promoted snapshot", async () => {
  const snapshot = await currentSnapshot();
  const brief = buildMarketBrief(snapshot);

  assert.equal(brief.runId, snapshot.runId);
  assert.equal(brief.signals.length, snapshot.keySignalIds.length);
  assert.deepEqual(
    brief.signals.map((signal) => signal.id),
    snapshot.keySignalIds,
  );
  assert.ok(
    brief.signals.every(
      (signal) =>
        signal.zh.label &&
        signal.zh.value &&
        signal.en.label &&
        signal.en.value &&
        signal.sourceIds.length > 0,
    ),
  );
  assert.equal(brief.featuredSignalIds.length, 8);
  assert.ok(brief.nextWeekObservations.length > 0);
  assert.match(brief.methodology.en, /modeled/i);
  assert.match(brief.notInvestmentAdvice.en, /not investment advice/i);
});

test("keeps canonical and public HyperFrames assets synchronized", async () => {
  const snapshot = await currentSnapshot();
  const paths = await makeAssetWorkspace(snapshot);

  await generateMarketBriefAssets(paths);

  assert.equal(
    await readFile(paths.canonicalData, "utf8"),
    await readFile(paths.publicData, "utf8"),
  );
  const canonicalHtml = await readFile(paths.canonicalHtml, "utf8");
  assert.equal(canonicalHtml, await readFile(paths.publicHtml, "utf8"));
  const embedded = embeddedBrief(canonicalHtml);
  assert.equal(embedded.runId, snapshot.runId);
  assert.deepEqual(embedded, JSON.parse(await readFile(paths.canonicalData, "utf8")));
  assert.doesNotMatch(canonicalHtml, /ISSUE 07\.26|JULY 30, 2026/);
});

test("checked-in canonical and public assets are byte-identical with the same embedded payload", async () => {
  const canonicalHtml = await readFile(canonicalHtmlUrl, "utf8");
  const canonicalData = await readFile(
    new URL("../../hyperframes/weekly-ai-market-brief/data.json", import.meta.url),
    "utf8",
  );
  assert.equal(
    canonicalHtml,
    await readFile(new URL("../../public/market-brief/index.html", import.meta.url), "utf8"),
  );
  assert.equal(
    canonicalData,
    await readFile(new URL("../../public/market-brief/data.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(embeddedBrief(canonicalHtml), JSON.parse(canonicalData));
});

test("reuses prior content but stamps the current Wednesday envelope", async () => {
  const saturday = await currentSnapshot();
  const { paths, prior } = await generatePriorBrief(saturday);

  const wednesday = makeWednesday(saturday);
  wednesday.pages["/"].report.title = {
    en: "Current title that must not replace reused content",
    zh: "不應取代重用內容的本期標題",
  };
  for (const page of Object.values(wednesday.pages)) page.changed = true;
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(await readFile(paths.canonicalData, "utf8")) as MarketBriefPayload;
  assert.equal(brief.runId, wednesday.runId);
  assert.equal(brief.cadence, "wednesday");
  assert.equal(brief.dataCutoff, wednesday.dataCutoff);
  assert.deepEqual(brief.sourceIds, prior.sourceIds);
  assert.deepEqual(brief.labels, prior.labels);
  assert.ok(brief.featuredSignalIds.length >= 3);
  assert.ok(brief.featuredSignalIds.length <= 5);
  assert.deepEqual(brief.nextWeekObservations, []);
  assert.deepEqual(embeddedBrief(await readFile(paths.canonicalHtml, "utf8")), brief);
});

test("prioritizes a changed /sic key signal before Wednesday page balancing", async () => {
  const saturday = await currentSnapshot();
  const { paths } = await generatePriorBrief(saturday);
  const wednesday = makeWednesday(saturday);
  const changedId = "sic.market_2030_usd_b";
  wednesday.metrics[changedId].display = { en: "$24B", zh: "$24B" };
  wednesday.pages["/"].report.title = { en: "Fresh Wednesday", zh: "本期週三更新" };
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  assert.equal(brief.runId, wednesday.runId);
  assert.ok(brief.featuredSignalIds.includes(changedId));
  assert.equal(brief.nextWeekObservations.length, 0);
});

test("prioritizes a genuinely added /sic signal when a Wednesday ID is replaced", async () => {
  const saturday = await currentSnapshot();
  const { paths } = await generatePriorBrief(saturday);
  const wednesday = makeWednesday(saturday);
  const replacementId = "sic.new_packaging_signal";
  const replacement = structuredClone(wednesday.metrics["sic.ev_penetration"]);
  replacement.id = replacementId;
  replacement.display = { en: "$24B replacement", zh: "$24B 新增" };
  wednesday.metrics[replacementId] = replacement;
  wednesday.keySignalIds[wednesday.keySignalIds.length - 1] = replacementId;
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  assert.equal(brief.runId, wednesday.runId);
  assert.ok(
    brief.featuredSignalIds.includes(replacementId),
    `expected ${replacementId} in ${brief.featuredSignalIds.join(", ")}`,
  );
  assert.ok(brief.featuredSignalIds.length >= 3);
  assert.ok(brief.featuredSignalIds.length <= 5);
});

test("does not treat reorder-only positional mismatches as changed signal records", async () => {
  const saturday = await currentSnapshot();
  const { paths } = await generatePriorBrief(saturday);
  const wednesday = makeWednesday(saturday);
  wednesday.keySignalIds.reverse();
  wednesday.pages["/"].report.title = {
    en: "Fresh reorder-only Wednesday",
    zh: "本期僅重排週三更新",
  };
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  const featuredSicCount = brief.featuredSignalIds.filter((id) =>
    id.startsWith("sic."),
  ).length;
  assert.equal(brief.labels.title.en, "Fresh reorder-only Wednesday");
  assert.ok(
    featuredSicCount < 4,
    `reorder-only cut falsely prioritized ${featuredSicCount} /sic signals: ${brief.featuredSignalIds.join(", ")}`,
  );
});

test("detects key-signal changes from IDs, values, kinds, and source bindings", async (t) => {
  const mutations: Array<[string, (snapshot: MarketSnapshot) => void]> = [
    [
      "IDs",
      (snapshot) => {
        [snapshot.keySignalIds[0], snapshot.keySignalIds[1]] = [
          snapshot.keySignalIds[1],
          snapshot.keySignalIds[0],
        ];
      },
    ],
    [
      "values",
      (snapshot) => {
        snapshot.metrics["sic.market_2030_usd_b"].display.en = "$24B";
      },
    ],
    [
      "kinds",
      (snapshot) => {
        snapshot.metrics["sic.market_2030_usd_b"].kind = "published";
      },
    ],
    [
      "source bindings",
      (snapshot) => {
        snapshot.metrics["sic.market_2030_usd_b"].sourceIds.push("iea-energy-ai");
      },
    ],
  ];

  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const saturday = await currentSnapshot();
      const { paths } = await generatePriorBrief(saturday);
      const wednesday = makeWednesday(saturday);
      wednesday.pages["/"].report.title = { en: `Fresh ${name}`, zh: `本期${name}` };
      mutate(wednesday);
      await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

      await generateMarketBriefAssets(paths);

      const brief = JSON.parse(await readFile(paths.canonicalData, "utf8")) as MarketBriefPayload;
      assert.equal(brief.runId, wednesday.runId);
      assert.equal(brief.labels.title.en, `Fresh ${name}`);
    });
  }
});

test("enforces cadence-specific featured-signal bounds and uniqueness", async () => {
  const snapshot = await currentSnapshot();
  const wednesday = makeWednesday(snapshot);
  assert.equal(buildMarketBrief(wednesday).featuredSignalIds.length, 5);

  const saturday = buildMarketBrief(snapshot);
  assert.equal(saturday.featuredSignalIds.length, 8);
  assert.equal(new Set(saturday.featuredSignalIds).size, 8);

  const monthEnd = structuredClone(snapshot);
  monthEnd.runId = "2026-07-31-month-end";
  monthEnd.cadence = "month-end";
  const monthEndBrief = buildMarketBrief(monthEnd);
  assert.equal(monthEndBrief.featuredSignalIds.length, 8);
  assert.ok(monthEndBrief.nextWeekObservations.length > 0);
});

test("rejects a snapshot with too few unique key signals for its cadence", async () => {
  const snapshot = makeWednesday(await currentSnapshot());
  snapshot.keySignalIds = snapshot.keySignalIds.slice(0, 2);
  assert.throws(() => buildMarketBrief(snapshot), /at least 3 unique key signals/i);
});

test("rejects duplicate snapshot key signals", async () => {
  const snapshot = makeWednesday(await currentSnapshot());
  snapshot.keySignalIds = [
    snapshot.keySignalIds[0],
    snapshot.keySignalIds[1],
    snapshot.keySignalIds[1],
  ];
  assert.throws(() => buildMarketBrief(snapshot), /duplicate key signal/i);
});

test("rejects duplicate featured IDs in a prior brief instead of reusing it", async () => {
  const saturday = await currentSnapshot();
  const { paths, prior } = await generatePriorBrief(saturday);
  prior.featuredSignalIds[4] = prior.featuredSignalIds[0];
  await writeFile(paths.canonicalData, `${JSON.stringify(prior)}\n`);
  const wednesday = makeWednesday(saturday);
  wednesday.pages["/"].report.title = { en: "Fresh content", zh: "本期內容" };
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(await readFile(paths.canonicalData, "utf8")) as MarketBriefPayload;
  assert.equal(brief.labels.title.en, "Fresh content");
  assert.equal(new Set(brief.featuredSignalIds).size, brief.featuredSignalIds.length);
});

test("rejects lower- and upper-bound violations in a prior complete brief", async (t) => {
  for (const [name, featuredSignalIds] of [
    ["below lower bound", [0, 1, 2, 3]],
    ["above upper bound", [0, 1, 2, 3, 4, 5, 6, 7, 8]],
  ] as const) {
    await t.test(name, async () => {
      const saturday = await currentSnapshot();
      const { paths, prior } = await generatePriorBrief(saturday);
      prior.featuredSignalIds = featuredSignalIds.map((index) => prior.signals[index].id);
      await writeFile(paths.canonicalData, `${JSON.stringify(prior)}\n`);
      const wednesday = makeWednesday(saturday);
      wednesday.pages["/"].report.title = { en: "Fresh content", zh: "本期內容" };
      await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

      await generateMarketBriefAssets(paths);

      const brief = JSON.parse(
        await readFile(paths.canonicalData, "utf8"),
      ) as MarketBriefPayload;
      assert.equal(brief.labels.title.en, "Fresh content");
      assert.ok(brief.featuredSignalIds.length >= 3);
      assert.ok(brief.featuredSignalIds.length <= 5);
    });
  }
});

test("payload validation returns false instead of throwing for malformed nested fields", async () => {
  const malformed = buildMarketBrief(await currentSnapshot()) as unknown as {
    labels: null;
  };
  malformed.labels = null;

  assert.doesNotThrow(() => isMarketBriefPayload(malformed));
  assert.equal(isMarketBriefPayload(malformed), false);
});

test("rejects invalid generated payloads before changing any output", async (t) => {
  const cases: Array<[string, (snapshot: MarketSnapshot) => void]> = [
    [
      "Saturday without evidence-backed observations",
      (snapshot) => {
        for (const page of Object.values(snapshot.pages)) {
          page.report.nextObservations = [];
        }
      },
    ],
    [
      "fewer tags than the three rendered slots",
      (snapshot) => {
        snapshot.pages["/"].report.thesis.tags.en = ["Compute", "Power"];
        snapshot.pages["/"].report.thesis.tags.zh = ["算力", "電力"];
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const snapshot = await currentSnapshot();
      mutate(snapshot);
      const paths = await makeAssetWorkspace(snapshot);
      const originalCanonicalHtml = await readFile(paths.canonicalHtml, "utf8");
      const originalPublicHtml = await readFile(paths.publicHtml, "utf8");
      await writeFile(paths.canonicalData, "sentinel-canonical\n");
      await writeFile(paths.publicData, "sentinel-public\n");

      await assert.rejects(
        generateMarketBriefAssets(paths),
        /invalid generated market brief|observations|tags/i,
      );

      assert.equal(await readFile(paths.canonicalData, "utf8"), "sentinel-canonical\n");
      assert.equal(await readFile(paths.publicData, "utf8"), "sentinel-public\n");
      assert.equal(await readFile(paths.canonicalHtml, "utf8"), originalCanonicalHtml);
      assert.equal(await readFile(paths.publicHtml, "utf8"), originalPublicHtml);
    });
  }
});

test("supports --snapshot=<path> in a real CLI process", async () => {
  const root = await makeCliWorkspace();
  const snapshot = makeWednesday(await currentSnapshot());
  const snapshotPath = join(root, "equals-snapshot.json");
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);

  const result = await runBriefCli(root, [`--snapshot=${snapshotPath}`]);

  assert.equal(result.code, 0, result.stderr);
  const brief = JSON.parse(
    await readFile(join(root, "hyperframes/weekly-ai-market-brief/data.json"), "utf8"),
  ) as MarketBriefPayload;
  assert.equal(brief.runId, snapshot.runId);
});

test("rejects unknown, duplicate, and positional CLI arguments before writing", async (t) => {
  const cases = [
    ["misspelled flag", ["--snapshop", "snapshot.json"]],
    ["unknown flag", ["--unknown"]],
    ["duplicate flag", ["--snapshot", "snapshot.json", "--snapshot", "snapshot.json"]],
    ["stray positional", ["snapshot.json"]],
  ] as const;

  for (const [name, args] of cases) {
    await t.test(name, async () => {
      const root = await makeCliWorkspace();
      const canonicalData = join(root, "hyperframes/weekly-ai-market-brief/data.json");
      const publicData = join(root, "public/market-brief/data.json");
      await writeFile(canonicalData, "sentinel-canonical\n");
      await writeFile(publicData, "sentinel-public\n");

      const result = await runBriefCli(root, [...args]);

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /unknown|duplicate|positional/i);
      assert.equal(await readFile(canonicalData, "utf8"), "sentinel-canonical\n");
      assert.equal(await readFile(publicData, "utf8"), "sentinel-public\n");
    });
  }
});
