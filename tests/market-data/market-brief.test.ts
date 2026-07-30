import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  buildMarketBrief,
  generateMarketBriefAssets,
  type MarketBriefAssetPaths,
  type MarketBriefPayload,
} from "../../scripts/generate-market-brief.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const snapshotUrl = new URL("../../data/market/current.json", import.meta.url);
const canonicalHtmlUrl = new URL(
  "../../hyperframes/weekly-ai-market-brief/index.html",
  import.meta.url,
);

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

test("reuses the complete prior brief for an unchanged Wednesday", async () => {
  const saturday = await currentSnapshot();
  const paths = await makeAssetWorkspace(saturday);
  await generateMarketBriefAssets(paths);
  const completeBrief = await readFile(paths.canonicalData, "utf8");

  const wednesday = structuredClone(saturday);
  wednesday.runId = "2026-07-29-wednesday";
  wednesday.cadence = "wednesday";
  wednesday.generatedAt = "2026-07-29T01:00:00.000Z";
  wednesday.dataCutoff = "2026-07-29T01:00:00.000Z";
  await writeFile(paths.snapshotPath, `${JSON.stringify(wednesday)}\n`);

  await generateMarketBriefAssets(paths);

  assert.equal(await readFile(paths.canonicalData, "utf8"), completeBrief);
  assert.equal(
    embeddedBrief(await readFile(paths.canonicalHtml, "utf8")).runId,
    saturday.runId,
  );
});

test("generates a short Wednesday cut when a key-signal page changed", async () => {
  const wednesday = await currentSnapshot();
  wednesday.runId = "2026-07-29-wednesday";
  wednesday.cadence = "wednesday";
  wednesday.generatedAt = "2026-07-29T01:00:00.000Z";
  wednesday.dataCutoff = "2026-07-29T01:00:00.000Z";
  wednesday.pages["/energy"].changed = true;
  const paths = await makeAssetWorkspace(wednesday);

  await generateMarketBriefAssets(paths);

  const brief = JSON.parse(
    await readFile(paths.canonicalData, "utf8"),
  ) as MarketBriefPayload;
  assert.equal(brief.runId, wednesday.runId);
  assert.equal(brief.featuredSignalIds.length, 5);
  assert.equal(brief.nextWeekObservations.length, 0);
});

test("centers the embedded composition inside a 390px mobile viewport", async () => {
  const html = await readFile(canonicalHtmlUrl, "utf8");
  const fitRoutine = html.match(
    /const fitComposition = \(\) => \{([\s\S]*?)\n        \};/,
  );
  assert.ok(fitRoutine, "composition must expose its embedded fit routine");
  const root = { style: { transform: "" } };
  const context = {
    window: { innerWidth: 390, innerHeight: 844 },
    document: { querySelector: () => root },
  };

  runInNewContext(`(() => {${fitRoutine[1]}})()`, context);

  assert.equal(
    root.style.transform,
    "translate(0px, 312.3125px) scale(0.203125)",
  );
});

test("seeks to the closing thesis when reduced motion is preferred", async () => {
  const html = await readFile(canonicalHtmlUrl, "utf8");
  const reducedMotionBranch = html.match(
    /(if \(window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \{[\s\S]*?\n          \}) else \{([\s\S]*?)\n          \}/,
  );
  assert.ok(reducedMotionBranch, "composition must retain its reduced-motion branch");
  const calls: Array<[string, number?]> = [];
  const context = {
    window: { matchMedia: () => ({ matches: true }) },
    tl: {
      seek: (time: number) => {
        calls.push(["seek", time]);
        return context.tl;
      },
      pause: () => {
        calls.push(["pause"]);
        return context.tl;
      },
      play: (time: number) => {
        calls.push(["play", time]);
        return context.tl;
      },
    },
  };

  runInNewContext(`${reducedMotionBranch[1]} else {${reducedMotionBranch[2]}}`, context);

  assert.deepEqual(calls, [["seek", 27], ["pause"]]);
});
