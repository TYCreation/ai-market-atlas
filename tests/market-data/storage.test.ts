import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  promoteCandidate,
  pruneRuns,
  restoreCurrent,
  validateCandidate,
} from "../../market-data/storage.ts";
import {
  autoPublishReview,
  makeBlockedFixtureWorkspace,
  makeFixtureWorkspace,
  writePublishableReview,
} from "./helpers.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

test("promotes only a publishable candidate and archives the previous snapshot", async () => {
  const paths = await makeFixtureWorkspace();
  const previous = await readFile(paths.currentPath, "utf8");

  const result = await promoteCandidate(paths);

  assert.equal(result.promoted, true);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, "2026-08-01-saturday");
  assert.equal(await readFile(result.archivedPath, "utf8"), previous);
  assert.deepEqual(await readdir(paths.runsDir), ["2026-08-01-saturday.json"]);
});

test("does not change current.json when the gate blocks", async () => {
  const paths = await makeBlockedFixtureWorkspace();
  const before = await readFile(paths.currentPath, "utf8");

  await assert.rejects(() => promoteCandidate(paths), /automated review decision is manual_review/);

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
  assert.deepEqual(await readdir(paths.runsDir), []);
});

test("refuses promotion when review is missing or bound to another hash", async () => {
  const paths = await makeFixtureWorkspace();
  await assert.rejects(
    () => promoteCandidate({ ...paths, reviewPath: join(paths.root, "reviews", "missing.json") }),
    /matching auto_publish review required/,
  );

  const changed = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  changed.metrics["stocks.nvda.price"].numericValue += 1;
  await writeFile(paths.candidatePath, JSON.stringify(changed));
  await assert.rejects(() => promoteCandidate(paths), /review candidate hash does not match/);
});

test("validates through the candidate adapter without publishing it", async () => {
  const paths = await makeFixtureWorkspace();
  const before = await readFile(paths.currentPath, "utf8");

  const snapshot = await validateCandidate(paths);

  assert.equal(snapshot.runId, "2026-08-01-saturday");
  assert.equal(await readFile(paths.currentPath, "utf8"), before);
});

test("archives month-end snapshots once and rollback removes only its record", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.runId = "2026-07-31-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  await writePublishableReview(paths.candidatePath, paths.reviewPath);

  const promotion = await promoteCandidate(paths);
  const index = JSON.parse(await readFile(paths.monthlyIndexPath, "utf8")) as Record<string, MarketSnapshot>;
  assert.equal(promotion.monthlyArchiveMonth, "2026-07");
  assert.equal(index["2026-07"].runId, promotion.runId);

  await restoreCurrent(paths, promotion);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, "2026-07-25-saturday");
  assert.deepEqual(JSON.parse(await readFile(paths.monthlyIndexPath, "utf8")), {});
});

test("refuses rollback unless current is the promotion that produced the archive", async () => {
  const paths = await makeFixtureWorkspace();
  const promotion = await promoteCandidate(paths);
  const unrelatedCurrent = await readFile(promotion.archivedPath, "utf8");
  await writeFile(paths.currentPath, unrelatedCurrent);

  await assert.rejects(() => restoreCurrent(paths, promotion), /current snapshot identity does not match/);
});

test("prunes only old named weekly runs and reviews", async () => {
  const paths = await makeFixtureWorkspace();
  const oldRun = "2026-01-31-saturday.json";
  const oldReview = "2026-01-28-wednesday.json";
  const protectedMonthly = "2026-01-31-month-end.json";
  const unrelated = "notes.json";
  await Promise.all([
    writeFile(join(paths.runsDir, oldRun), "run"),
    writeFile(join(paths.runsDir, protectedMonthly), "monthly"),
    writeFile(join(paths.runsDir, unrelated), "notes"),
    writeFile(join(paths.root, "reviews", oldReview), "review"),
    writeFile(join(paths.root, "reviews", protectedMonthly), "monthly review"),
  ]);

  const removed = await pruneRuns(paths.root, new Date("2026-05-02T00:00:00.000Z"));

  assert.deepEqual(removed.sort(), [join(paths.runsDir, oldRun), join(paths.root, "reviews", oldReview)].sort());
  assert.deepEqual((await readdir(paths.runsDir)).sort(), [protectedMonthly, unrelated]);
  assert.deepEqual((await readdir(join(paths.root, "reviews"))).sort(), ["2026-08-01-saturday.json", protectedMonthly].sort());
});

test("rejects duplicate month archive keys before changing current", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.runId = "2026-07-31-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  await writeFile(paths.monthlyIndexPath, JSON.stringify({ "2026-07": candidate }));
  await writeFile(paths.reviewPath, JSON.stringify(autoPublishReview(candidate)));
  const before = await readFile(paths.currentPath, "utf8");

  await assert.rejects(() => promoteCandidate(paths), /monthly archive already exists/);

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
});
