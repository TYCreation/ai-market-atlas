import assert from "node:assert/strict";
import { readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  promoteCandidate,
  pruneRuns,
  restoreCurrent,
  validateCandidate,
} from "../../market-data/storage.ts";
import { hashCandidate } from "../../market-data/review.ts";
import { runMarketReview } from "../../scripts/market-review.ts";
import {
  autoPublishReview,
  makeBlockedFixtureWorkspace,
  makeFixtureWorkspace,
  writePublishableReview,
} from "./helpers.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

type FixturePaths = Awaited<ReturnType<typeof makeFixtureWorkspace>>;

async function candidateSha(paths: FixturePaths): Promise<string> {
  return hashCandidate(
    JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot,
  );
}

async function reviewedSha(paths: FixturePaths): Promise<string> {
  return (
    JSON.parse(await readFile(paths.reviewPath, "utf8")) as {
      candidateSha256: string;
    }
  ).candidateSha256;
}

async function promoteReviewed(paths: FixturePaths) {
  return promoteCandidate(paths, await reviewedSha(paths));
}

test("promotes only a publishable candidate and archives the previous snapshot", async () => {
  const paths = await makeFixtureWorkspace();
  const previous = await readFile(paths.currentPath, "utf8");

  const result = await promoteReviewed(paths);

  assert.equal(result.promoted, true);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, "2026-08-01-saturday");
  assert.equal(await readFile(result.archivedPath, "utf8"), previous);
  assert.deepEqual(await readdir(paths.runsDir), ["2026-08-01-saturday.json"]);
});

test("does not change current.json when the gate blocks", async () => {
  const paths = await makeBlockedFixtureWorkspace();
  const before = await readFile(paths.currentPath, "utf8");

  await assert.rejects(
    async () => promoteCandidate(paths, await reviewedSha(paths)),
    /automated review decision is manual_review/,
  );

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
  assert.deepEqual(await readdir(paths.runsDir), []);
});

test("refuses promotion when review is missing or bound to another hash", async () => {
  const paths = await makeFixtureWorkspace();
  await rm(paths.reviewPath);
  await assert.rejects(
    async () => promoteCandidate(paths, await candidateSha(paths)),
    /matching auto_publish review required/,
  );
  await writePublishableReview(paths.candidatePath, paths.reviewPath);

  const changed = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  changed.metrics["stocks.nvda.price"].numericValue += 1;
  await writeFile(paths.candidatePath, JSON.stringify(changed));
  await assert.rejects(
    async () => promoteCandidate(paths, await candidateSha(paths)),
    /review candidate hash does not match/,
  );
});

test("publishes only the normalized snapshot that its persisted review hashes", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  const previous = structuredClone(candidate);
  previous.runId = "2026-07-25-saturday";
  previous.cadence = "saturday";
  await writeFile(paths.currentPath, JSON.stringify(previous));
  candidate.metrics["pulse.infrastructure_spend"].unit = "trillion-usd";
  candidate.metrics["pulse.infrastructure_spend"].numericValue = 2.8;
  for (const observation of candidate.metrics["pulse.infrastructure_spend"].observations) observation.numericValue = 2.8;
  candidate.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  candidate.metrics["stocks.wolf.weekReturn"].display = { en: "-19.9%", zh: "-19.9%" };
  await writeFile(paths.candidatePath, JSON.stringify(candidate));

  const review = await runMarketReview({
    candidatePath: paths.candidatePath,
    previousPath: paths.currentPath,
    reviewsDirectory: join(paths.root, "reviews"),
    fetcher: async () => new Response("", { status: 200 }),
    resolver: async () => ["93.184.216.34"],
  });
  assert.equal(review.exitCode, 0);
  const normalizedCandidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  assert.equal(review.review.candidateSha256, hashCandidate(normalizedCandidate));

  await promoteReviewed(paths);
  const published = JSON.parse(await readFile(paths.currentPath, "utf8")) as MarketSnapshot;
  assert.equal(hashCandidate(published), review.review.candidateSha256);
  assert.equal(published.metrics["pulse.infrastructure_spend"].numericValue, 2800);
  assert.equal(published.metrics["stocks.nvda.price"].previousNumericValue, previous.metrics["stocks.nvda.price"].numericValue);
});

test("blocks a normalized candidate that changes after review", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  candidate.metrics["stocks.nvda.price"].numericValue += 1;
  await writeFile(paths.candidatePath, JSON.stringify(candidate));

  await assert.rejects(
    async () => promoteCandidate(paths, await candidateSha(paths)),
    /review candidate hash does not match/,
  );
});

test("promotion rejects a changed candidate and replacement valid review when the authorized hash is older", async () => {
  const paths = await makeFixtureWorkspace();
  const originalReview = JSON.parse(
    await readFile(paths.reviewPath, "utf8"),
  ) as { candidateSha256: string };
  const before = await readFile(paths.currentPath, "utf8");
  const changed = JSON.parse(
    await readFile(paths.candidatePath, "utf8"),
  ) as MarketSnapshot;
  changed.pages["/"].report.title.en = "Replacement candidate";
  await writeFile(paths.candidatePath, `${JSON.stringify(changed)}\n`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);

  await assert.rejects(
    () => promoteCandidate(paths, originalReview.candidateSha256),
    /authorized candidate hash/i,
  );

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
  assert.deepEqual(await readdir(paths.runsDir), []);
});

test("promotion requires an authorized candidate hash", async () => {
  const paths = await makeFixtureWorkspace();
  const before = await readFile(paths.currentPath, "utf8");

  await assert.rejects(
    () => promoteCandidate(paths),
    /authorized candidate hash.*required/i,
  );

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
  assert.deepEqual(await readdir(paths.runsDir), []);
});

test("requires the direct, named regular review file", async () => {
  const wrongName = await makeFixtureWorkspace();
  const review = await readFile(wrongName.reviewPath, "utf8");
  const renamed = join(wrongName.root, "reviews", "wrong-name.json");
  await writeFile(renamed, review);
  await assert.rejects(
    async () =>
      promoteCandidate(
        { ...wrongName, reviewPath: renamed },
        await candidateSha(wrongName),
      ),
    /review path must be/,
  );

  const outside = await makeFixtureWorkspace();
  const outsidePath = join(outside.root, "outside-review.json");
  await writeFile(outsidePath, await readFile(outside.reviewPath, "utf8"));
  await assert.rejects(
    async () =>
      promoteCandidate(
        { ...outside, reviewPath: outsidePath },
        await candidateSha(outside),
      ),
    /review path must be/,
  );

  const linked = await makeFixtureWorkspace();
  const target = join(linked.root, "review-target.json");
  await writeFile(target, await readFile(linked.reviewPath, "utf8"));
  await rm(linked.reviewPath);
  await symlink(target, linked.reviewPath);
  await assert.rejects(
    async () => promoteCandidate(linked, await candidateSha(linked)),
    /review file must be a regular file/,
  );
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
  candidate.runId = "2026-07-25-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);

  const promotion = await promoteReviewed(paths);
  const index = JSON.parse(await readFile(paths.monthlyIndexPath, "utf8")) as Record<string, MarketSnapshot>;
  assert.equal(promotion.monthlyArchiveMonth, "2026-07");
  assert.equal(index["2026-07"].runId, promotion.runId);

  await restoreCurrent(paths, promotion);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, "2026-07-25-saturday");
  assert.deepEqual(JSON.parse(await readFile(paths.monthlyIndexPath, "utf8")), {});
});

test("month-end promotion persists exactly the pure prospective archive projection", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(
    await readFile(paths.candidatePath, "utf8"),
  ) as MarketSnapshot;
  candidate.runId = "2026-08-29-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, `${JSON.stringify(candidate)}\n`);
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writePublishableReview(paths.candidatePath, paths.reviewPath);
  const review = JSON.parse(await readFile(paths.reviewPath, "utf8"));
  const storage = await import("../../market-data/storage.ts");

  assert.equal(typeof storage.projectMonthlyArchive, "function");
  const projected = storage.projectMonthlyArchive(candidate, review);
  await promoteReviewed(paths);
  const index = JSON.parse(
    await readFile(paths.monthlyIndexPath, "utf8"),
  ) as Record<string, unknown>;

  assert.deepEqual(index["2026-08"], projected);
});

test("refuses rollback unless current is the promotion that produced the archive", async () => {
  const paths = await makeFixtureWorkspace();
  const promotion = await promoteReviewed(paths);
  const unrelatedCurrent = await readFile(promotion.archivedPath, "utf8");
  await writeFile(paths.currentPath, unrelatedCurrent);

  await assert.rejects(() => restoreCurrent(paths, promotion), /current snapshot identity does not match/);
});

test("rejects substituted and symlinked rollback archives", async () => {
  const substituted = await makeFixtureWorkspace();
  const promotion = await promoteReviewed(substituted);
  await writeFile(promotion.archivedPath, await readFile(substituted.currentPath, "utf8"));
  await assert.rejects(() => restoreCurrent(substituted, promotion), /promotion archive identity does not match/);

  const linked = await makeFixtureWorkspace();
  const linkedPromotion = await promoteReviewed(linked);
  const target = join(linked.root, "archive-target.json");
  await writeFile(target, await readFile(linkedPromotion.archivedPath, "utf8"));
  await rm(linkedPromotion.archivedPath);
  await symlink(target, linkedPromotion.archivedPath);
  await assert.rejects(() => restoreCurrent(linked, linkedPromotion), /promotion archive must be a regular file/);
});

test("reuses an authenticated rollback archive for a same-run retry", async () => {
  const paths = await makeFixtureWorkspace();
  const first = await promoteReviewed(paths);
  await restoreCurrent(paths, first);

  const retry = await promoteReviewed(paths);

  assert.equal(retry.archivedPath, first.archivedPath);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, first.runId);
});

test("rejects a stale same-run rollback result but accepts the newest result", async () => {
  const paths = await makeFixtureWorkspace();
  const first = await promoteReviewed(paths);
  await restoreCurrent(paths, first);

  const retryCandidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  retryCandidate.metrics["stocks.nvda.price"].numericValue += 1;
  await writeFile(paths.candidatePath, JSON.stringify(retryCandidate));
  await writePublishableReview(paths.candidatePath, paths.reviewPath);
  const newest = await promoteReviewed(paths);
  const beforeCurrent = await readFile(paths.currentPath, "utf8");
  const beforeIndex = await readFile(paths.monthlyIndexPath, "utf8");

  await assert.rejects(() => restoreCurrent(paths, first), /current snapshot identity does not match the promotion/);
  assert.equal(await readFile(paths.currentPath, "utf8"), beforeCurrent);
  assert.equal(await readFile(paths.monthlyIndexPath, "utf8"), beforeIndex);

  await restoreCurrent(paths, newest);
  assert.equal(JSON.parse(await readFile(paths.currentPath, "utf8")).runId, first.previousRunId);
});

test("rejects a mismatched existing archive before promotion", async () => {
  const paths = await makeFixtureWorkspace();
  const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8")) as MarketSnapshot;
  await writeFile(join(paths.runsDir, `${candidate.runId}.json`), JSON.stringify(candidate));

  await assert.rejects(
    async () => promoteCandidate(paths, await reviewedSha(paths)),
    /existing archive does not match expected prior snapshot/,
  );
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
  candidate.runId = "2026-07-25-month-end";
  candidate.cadence = "month-end";
  await writeFile(paths.candidatePath, JSON.stringify(candidate));
  await writeFile(paths.monthlyIndexPath, JSON.stringify({ "2026-07": candidate }));
  paths.reviewPath = join(paths.root, "reviews", `${candidate.runId}.json`);
  await writeFile(paths.reviewPath, JSON.stringify(autoPublishReview(candidate)));
  const before = await readFile(paths.currentPath, "utf8");

  await assert.rejects(
    async () => promoteCandidate(paths, await reviewedSha(paths)),
    /monthly archive already exists/,
  );

  assert.equal(await readFile(paths.currentPath, "utf8"), before);
});
