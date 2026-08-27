import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import validCandidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { loadRecentSnapshots } from "../../market-data/history.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const valid = validCandidate as unknown as MarketSnapshot;

function snapshot(runId: string, dataCutoff: string): MarketSnapshot {
  const result = structuredClone(valid);
  result.runId = runId;
  result.dataCutoff = dataCutoff;
  result.generatedAt = dataCutoff;
  for (const page of Object.values(result.pages)) page.verifiedAt = dataCutoff;
  for (const metric of Object.values(result.metrics)) metric.asOf = dataCutoff;
  return result;
}

test("loads recent direct-child snapshots newest first and caps the result", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-history-"));
  try {
    for (const item of [
      snapshot("2026-08-22-saturday", "2026-08-22T01:00:00.000Z"),
      snapshot("2026-08-19-wednesday", "2026-08-19T01:00:00.000Z"),
      snapshot("2026-08-15-saturday", "2026-08-15T01:00:00.000Z"),
    ]) {
      await writeFile(join(root, `${item.runId}.json`), JSON.stringify(item));
    }
    await writeFile(join(root, "README.txt"), "ignored");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "nested.json"), JSON.stringify(snapshot("2026-08-08-saturday", "2026-08-08T01:00:00.000Z")));

    const recent = await loadRecentSnapshots(root, "2026-08-26T01:00:00.000Z", 2);
    assert.deepEqual(recent.map((item) => item.runId), [
      "2026-08-22-saturday",
      "2026-08-19-wednesday",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed on an invalid direct-child JSON file and names the file", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-history-invalid-"));
  try {
    await writeFile(join(root, "bad.json"), "{not-json");
    await assert.rejects(
      loadRecentSnapshots(root, "2026-08-26T01:00:00.000Z", 1),
      /bad\.json/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinked direct-child JSON files", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-history-symlink-"));
  try {
    const target = join(root, "target.json");
    await writeFile(target, JSON.stringify(snapshot("2026-08-22-saturday", "2026-08-22T01:00:00.000Z")));
    await symlink(target, join(root, "link.json"));
    await assert.rejects(
      loadRecentSnapshots(root, "2026-08-26T01:00:00.000Z", 2),
      /link\.json/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
