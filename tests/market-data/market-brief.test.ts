import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import missingThesisRationale from "../fixtures/market/missing-thesis-survival-rationale.json" with { type: "json" };
import previousFull from "../fixtures/market/previous-full.json" with { type: "json" };
import {
  assertMarketBriefMatchesSnapshot,
  buildMarketBrief,
  generateMarketBriefAssets,
  marketBriefSnapshotValidationMode,
  marketBriefPayloadSha256,
  isMarketBriefPayload,
  type MarketBriefAssetPaths,
  type MarketBriefPayload,
} from "../../scripts/generate-market-brief.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const snapshotUrl = new URL("../fixtures/market/valid-candidate.json", import.meta.url);
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
  for (const metric of Object.values(wednesday.metrics)) {
    if (Date.parse(metric.asOf) > Date.parse(wednesday.dataCutoff)) {
      metric.asOf = wednesday.dataCutoff;
    }
  }
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

  assert.equal("runId" in brief, false);
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
        signal.kind === "atlas-model" &&
        signal.asOf === snapshot.metrics[signal.id].asOf &&
        signal.sourceIds.length > 0,
    ),
  );
  assert.equal(brief.featuredSignalIds.length, 8);
  assert.ok(brief.nextWeekObservations.length > 0);
  assert.match(brief.methodology.en, /modeled/i);
  assert.match(brief.notInvestmentAdvice.en, /not investment advice/i);
});

test("rejects an arbitrary draft snapshot that omits a thesis survival rationale", async () => {
  const paths = await makeAssetWorkspace(missingThesisRationale as unknown as MarketSnapshot);
  const draftPath = join(dirname(paths.snapshotPath), "draft.json");
  await writeFile(draftPath, await readFile(paths.snapshotPath));
  paths.snapshotPath = draftPath;

  await assert.rejects(
    generateMarketBriefAssets(paths),
    /thesisSurvivalRationale must be an object/,
  );
});

test("retains legacy validation only for persisted current and run archive paths", () => {
  const marketRoot = new URL("../../data/market/", import.meta.url).pathname;
  const currentPath = join(marketRoot, "current.json");
  const runPath = join(marketRoot, "runs", "2026-07-25-saturday.json");

  assert.equal(marketBriefSnapshotValidationMode(currentPath), "published");
  assert.equal(marketBriefSnapshotValidationMode(runPath), "published");
  assert.doesNotThrow(() => buildMarketBrief(previousFull as unknown as MarketSnapshot, "published"));
});

test("omits an optional stale key signal without presenting it as current", async () => {
  const snapshot = await currentSnapshot();
  const staleSignalId = snapshot.keySignalIds.at(-1);
  assert.ok(staleSignalId);
  snapshot.metrics[staleSignalId].required = false;
  snapshot.metrics[staleSignalId].asOf = "2026-07-01T01:00:00.000Z";

  const brief = buildMarketBrief(snapshot);

  assert.ok(!brief.signals.some((signal) => signal.id === staleSignalId));
  assert.ok(!brief.featuredSignalIds.includes(staleSignalId));
});

test("fails closed when a required key signal is stale", async () => {
  const snapshot = await currentSnapshot();
  const staleSignalId = snapshot.keySignalIds.at(-1);
  assert.ok(staleSignalId);
  snapshot.metrics[staleSignalId].asOf = "2026-07-01T01:00:00.000Z";

  assert.throws(() => buildMarketBrief(snapshot), /required key signal.*stale/i);
});

test("semantic validation rejects synchronized editorial and feature tampering", async (t) => {
  const saturday = await currentSnapshot();
  const wednesday = makeWednesday(saturday);
  wednesday.pages["/sic"].changed = true;
  wednesday.pages["/sic"].changeReasons = ["rounded-value-change"];
  const canonical = buildMarketBrief(wednesday);
  const cases: Array<
    [string, (brief: MarketBriefPayload) => void]
  > = [
    [
      "title",
      (brief) => {
        brief.labels.title = { en: "Forged title", zh: "偽造標題" };
      },
    ],
    [
      "summary",
      (brief) => {
        brief.labels.summary = { en: "Forged summary", zh: "偽造摘要" };
      },
    ],
    [
      "methodology",
      (brief) => {
        brief.methodology = { en: "Forged method", zh: "偽造方法" };
      },
    ],
    [
      "disclaimer",
      (brief) => {
        brief.notInvestmentAdvice = {
          en: "Forged disclaimer",
          zh: "偽造免責聲明",
        };
      },
    ],
    [
      "tag",
      (brief) => {
        brief.labels.tags.en[0] = "Forged tag";
        brief.labels.tags.zh[0] = "偽造標籤";
      },
    ],
    [
      "featured subset omitting the changed page",
      (brief) => {
        brief.featuredSignalIds = [
          "pulse.infrastructure_spend",
          "stocks.basket_30d",
          "compute.accelerator_pool",
          "energy.announced_power_gw",
          "models.production_agents",
        ];
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const tampered = structuredClone(canonical);
      mutate(tampered);
      assert.throws(
        () =>
          assertMarketBriefMatchesSnapshot(
            tampered,
            wednesday,
            "tampered brief",
          ),
        /semantics.*snapshot/i,
      );
    });
  }
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
  assert.equal("runId" in embedded, false);
  assert.doesNotMatch(canonicalHtml, new RegExp(snapshot.runId));
  assert.doesNotMatch(await readFile(paths.canonicalData, "utf8"), new RegExp(snapshot.runId));
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

test("unchanged Wednesday preserves canonical prior editorial content while stamping its envelope", async () => {
  const saturday = await currentSnapshot();
  const { paths, prior } = await generatePriorBrief(saturday);

  const wednesday = makeWednesday(saturday);
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(await readFile(paths.canonicalData, "utf8")) as MarketBriefPayload;
  assert.equal("runId" in brief, false);
  assert.equal(brief.cadence, "wednesday");
  assert.equal(brief.dataCutoff, wednesday.dataCutoff);
  assert.deepEqual(brief.sourceIds, prior.sourceIds);
  assert.deepEqual(
    brief.signals,
    prior.signals.map((signal) => ({ ...signal, asOf: wednesday.dataCutoff })),
  );
  assert.deepEqual(brief.labels, prior.labels);
  assert.deepEqual(brief.methodology, prior.methodology);
  assert.deepEqual(brief.notInvestmentAdvice, prior.notInvestmentAdvice);
  assert.ok(brief.featuredSignalIds.length >= 3);
  assert.ok(brief.featuredSignalIds.length <= 5);
  assert.deepEqual(brief.nextWeekObservations, []);
  assert.deepEqual(embeddedBrief(await readFile(paths.canonicalHtml, "utf8")), brief);
});

test("unchanged Wednesday does not trust synchronized prior editorial tampering", async () => {
  const saturday = await currentSnapshot();
  const { paths, prior } = await generatePriorBrief(saturday);
  prior.labels.title = { en: "Forged prior title", zh: "偽造前期標題" };
  prior.labels.summary = { en: "Forged prior summary", zh: "偽造前期摘要" };
  await writeFile(paths.canonicalData, `${JSON.stringify(prior)}\n`);

  const wednesday = makeWednesday(saturday);
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  assert.deepEqual(brief.labels.title, saturday.pages["/"].report.title);
  assert.deepEqual(brief.labels.summary, saturday.pages["/"].report.summary);
  assert.doesNotMatch(brief.labels.title.en, /forged/i);
});

test("prioritizes a changed /sic key signal before Wednesday page balancing", async () => {
  const saturday = await currentSnapshot();
  const { paths } = await generatePriorBrief(saturday);
  const wednesday = makeWednesday(saturday);
  const changedId = "sic.market_2030_usd_b";
  wednesday.metrics[changedId].display = { en: "$24B", zh: "$24B" };
  wednesday.pages["/sic"].changed = true;
  wednesday.pages["/sic"].changeReasons = ["rounded-value-change"];
  wednesday.pages["/"].report.title = { en: "Fresh Wednesday", zh: "本期週三更新" };
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  assert.equal("runId" in brief, false);
  assert.ok(brief.featuredSignalIds.includes(changedId));
  assert.equal(brief.nextWeekObservations.length, 0);
});

test("rejects a newly added key signal without a code-owned freshness policy", async () => {
  const saturday = await currentSnapshot();
  const { paths } = await generatePriorBrief(saturday);
  const wednesday = makeWednesday(saturday);
  const replacementId = "sic.new_packaging_signal";
  const replacement = structuredClone(wednesday.metrics["sic.ev_penetration"]);
  replacement.id = replacementId;
  replacement.display = { en: "$24B replacement", zh: "$24B 新增" };
  wednesday.metrics[replacementId] = replacement;
  wednesday.keySignalIds[wednesday.keySignalIds.length - 1] = replacementId;
  wednesday.pages["/sic"].changed = true;
  wednesday.pages["/sic"].changeReasons = ["first-party-event"];
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  assert.throws(
    () => buildMarketBrief(wednesday),
    /Unknown metric freshness policy: sic\.new_packaging_signal/,
  );
});

test("reorder-only Wednesday remains page-balanced without reviewed changed pages", async () => {
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

test("regenerates instead of reusing prior duplicate featured IDs", async () => {
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

test("regenerates instead of reusing prior feature-bound violations", async (t) => {
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

test("rejects timestamp observations without a structural metric comparison", async () => {
  const brief = buildMarketBrief(await currentSnapshot());
  const observation = brief.nextWeekObservations[0];
  assert.ok(observation && !observation.legacy);
  observation.comparison = null;
  assert.equal(isMarketBriefPayload(brief), false);
});

test("brief generation preserves nonuniform observation and tag counts", async () => {
  const snapshot = await currentSnapshot();
  snapshot.pages["/"].report.thesis.tags.en.push("Execution risk", "Customer proof");
  snapshot.pages["/"].report.thesis.tags.zh.push("執行風險", "客戶證明");
  snapshot.pages["/compute"].report.nextObservations = snapshot.pages["/compute"].report.nextObservations.slice(0, 1);
  snapshot.pages["/energy"].report.nextObservations.push(
    structuredClone(snapshot.pages["/energy"].report.nextObservations[0]),
  );
  const brief = buildMarketBrief(snapshot);
  const expectedObservationCount = Object.values(snapshot.pages)
    .reduce((total, page) => total + page.report.nextObservations.length, 0);
  assert.equal(brief.nextWeekObservations.length, expectedObservationCount);
  assert.equal(brief.labels.tags.en.length, 5);
  assert.equal(brief.labels.tags.zh.length, 5);
});

test("rejects non-canonical, stale, and future signal observations", async () => {
  const cases = [
    ["non-ISO date", "Aug 1 2026", /ISO|invalid/i],
    ["stale date", "2020-01-01T00:00:00.000Z", /stale/i],
    ["future date", "2099-01-01T00:00:00.000Z", /future/i],
  ] as const;
  for (const [label, asOf, error] of cases) {
    const snapshot = await currentSnapshot();
    snapshot.metrics[snapshot.keySignalIds[0]].asOf = asOf;
    await assert.rejects(() => Promise.resolve().then(() => buildMarketBrief(snapshot)), error, label);
  }
});

test("brief payload identity is deterministic and rejects same-cutoff tampering", async () => {
  const snapshot = await currentSnapshot();
  const brief = buildMarketBrief(snapshot);
  assert.equal(marketBriefPayloadSha256(brief), marketBriefPayloadSha256(structuredClone(brief)));
  const tampered = structuredClone(brief);
  tampered.dataCutoff = brief.dataCutoff;
  tampered.labels.title.en = `${tampered.labels.title.en} (tampered)`;
  assert.notEqual(marketBriefPayloadSha256(tampered), marketBriefPayloadSha256(brief));
  assert.equal(isMarketBriefPayload(tampered), true);
  assert.throws(
    () => assertMarketBriefMatchesSnapshot(tampered, snapshot),
    /semantics do not match/i,
  );
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
      "missing thesis tags",
      (snapshot) => {
        snapshot.pages["/"].report.thesis.tags.en = [];
        snapshot.pages["/"].report.thesis.tags.zh = [];
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
        /invalid generated market brief|observations|tag/i,
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
  assert.equal("runId" in brief, false);
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
