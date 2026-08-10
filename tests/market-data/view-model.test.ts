import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildSourceBundles,
  createMarketViewModel,
  getKpi,
  getPageMeta,
  loadMarketSnapshot,
} from "../../market-data/view-model.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

test("returns both locales from one metric record", () => {
  assert.deepEqual(getKpi("/", 0, "en"), {
    metricId: "pulse.infrastructure_spend",
    value: "$2.8T",
    sourceIds: ["atlas-model", "stanford-economy"],
  });
  assert.equal(getKpi("/", 0, "zh").metricId, "pulse.infrastructure_spend");
});

test("marks an unchanged page without replacing its thesis", () => {
  const meta = getPageMeta("/models", "zh");
  assert.equal(meta.changeLabel, "本期無重大變化");
  assert.equal(meta.changed, false);
  assert.equal(meta.report.thesis.title, "勝出的代理是重新設計的工作流程，不是聊天視窗。");
});

test("builds each page source bundle only from referenced snapshot sources", async () => {
  const snapshot = JSON.parse(
    await readFile(new URL("../../data/market/current.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  const bundles = buildSourceBundles(snapshot);

  assert.deepEqual(
    [...bundles["/energy"].kpiSources[0]].sort(),
    ["atlas-model", "iea-data-centres", "iea-energy-ai"],
  );
  assert.deepEqual(
    bundles["/energy"].sources.map((source) => source.id).sort(),
    ["atlas-model", "doe-data-centers", "iea-data-centres", "iea-energy-ai", "vistra-q2-2026"],
  );
  assert.equal(bundles["/energy"].reviewed, snapshot.dataCutoff);
});

test("loads and validates an explicitly selected preview snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-view-model-"));
  const previewPath = join(root, "preview.json");
  const snapshot = JSON.parse(
    await readFile(new URL("../../data/market/current.json", import.meta.url), "utf8"),
  ) as MarketSnapshot;
  snapshot.runId = "preview-safe-path";
  await writeFile(previewPath, `${JSON.stringify(snapshot)}\n`);

  const loaded = await loadMarketSnapshot(previewPath);
  assert.equal(loaded.runId, "preview-safe-path");
  assert.equal(createMarketViewModel(loaded).getEditionMeta("en").runId, "preview-safe-path");

  await assert.rejects(
    () => loadMarketSnapshot(join(root, "..", "missing.json")),
    /snapshot path|ENOENT/i,
  );
});
