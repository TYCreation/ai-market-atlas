import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import conflictingCandidate from "../fixtures/market/conflicting-prices.json" with { type: "json" };
import previous from "../fixtures/market/previous-snapshot.json" with { type: "json" };
import {
  assertAutoPublishReview,
  hashCandidate,
  reviewCandidate,
} from "../../market-data/review.ts";
import type { SourceFetcher } from "../../market-data/source-health.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";
import { runMarketReview } from "../../scripts/market-review.ts";

const valid = candidate as unknown as MarketSnapshot;
const conflicting = conflictingCandidate as unknown as MarketSnapshot;
const previousSnapshot = previous as unknown as MarketSnapshot;
const reachableFetcher = async () => new Response("", { status: 200 });
const publicResolver = async () => ["93.184.216.34"];

function reviewableCandidate(): MarketSnapshot {
  const snapshot = structuredClone(valid);
  snapshot.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  snapshot.metrics["stocks.wolf.weekReturn"].display = { en: "-19.9%", zh: "-19.9%" };
  return withoutNumericNarrative(snapshot);
}

function withoutNumericNarrative(snapshot: MarketSnapshot): MarketSnapshot {
  const redact = (text: { en: string; zh: string }) => ({
    ...text,
    en: text.en.replaceAll(/\d/g, "x"),
    zh: text.zh.replaceAll(/\d/g, "x"),
  });
  for (const page of Object.values(snapshot.pages)) {
    page.report.eyebrow = redact(page.report.eyebrow);
    page.report.title = redact(page.report.title);
    page.report.summary = redact(page.report.summary);
    page.report.signal = redact(page.report.signal);
    page.report.thesis.title = redact(page.report.thesis.title);
    page.report.thesis.body = redact(page.report.thesis.body);
    page.report.thesis.tags = {
      en: page.report.thesis.tags.en.map((tag) => tag.replaceAll(/\d/g, "x")),
      zh: page.report.thesis.tags.zh.map((tag) => tag.replaceAll(/\d/g, "x")),
    };
    for (const collection of ["supportingEvidence", "opposingEvidence"] as const) {
      page.report[collection] = page.report[collection].map((evidence) => ({
        ...evidence,
        text: redact(evidence.text),
      }));
    }
    for (const collection of ["catalysts", "risks", "nextObservations"] as const) {
      page.report[collection] = page.report[collection].map(redact);
    }
  }
  return snapshot;
}

function withOpposingEvidence(snapshot: MarketSnapshot): MarketSnapshot {
  for (const [page, state] of Object.entries(snapshot.pages) as Array<[keyof MarketSnapshot["pages"], MarketSnapshot["pages"][keyof MarketSnapshot["pages"]]]>) {
    state.report.opposingEvidence = structuredClone(valid.pages[page].report.opposingEvidence);
  }
  return snapshot;
}

function reviewSnapshot(
  snapshot: unknown,
  prior: MarketSnapshot = previousSnapshot,
  fetcher: SourceFetcher = reachableFetcher,
) {
  return reviewCandidate(snapshot, prior, fetcher, publicResolver);
}

test("hashes recursively key-sorted candidate content deterministically", () => {
  assert.equal(
    hashCandidate({ z: 1, nested: { beta: 2, alpha: [3, { y: 4, x: 5 }] }, a: true }),
    "7550167b9f35675a5fc2647d25764a71389f2e75f85cd3fe178dd2e3dcf40906",
  );
  assert.equal(hashCandidate({ b: 2, a: 1 }), hashCandidate({ a: 1, b: 2 }));
});

test("creates an auto-publish review bound to the exact candidate", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewSnapshot(snapshot);

  assert.equal(review.decision, "auto_publish");
  assert.equal(review.candidateSha256, hashCandidate(snapshot));
  assert.equal(review.checks.length, 9);
  assert.doesNotThrow(() => assertAutoPublishReview(review, snapshot));
});

test("rejects a passed review after candidate content changes", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewSnapshot(snapshot);
  const changed = structuredClone(snapshot);
  changed.metrics["stocks.nvda.price"].numericValue += 1;

  assert.throws(
    () => assertAutoPublishReview(review, changed),
    /review candidate hash does not match/,
  );
});

test("rejects a review whose persisted identity was altered", async () => {
  const snapshot = reviewableCandidate();
  const review = await reviewSnapshot(snapshot);
  review.reviewId = "altered";

  assert.throws(
    () => assertAutoPublishReview(review, snapshot),
    /review identity does not match/,
  );
});

test("routes a source conflict to manual review", async () => {
  const snapshot = withoutNumericNarrative(withOpposingEvidence(structuredClone(conflicting)));
  snapshot.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  const review = await reviewSnapshot(snapshot);

  assert.equal(review.decision, "manual_review");
  assert.ok(review.issues.some((issue) => issue.code === "SOURCE_CONFLICT"));
});

test("routes freshness, modeled-presentation, and balance gate issues through existing checks", async () => {
  const stale = reviewableCandidate();
  stale.dataCutoff = "2026-08-20T01:00:00.000Z";
  stale.metrics["pulse.power_queue"].asOf = "2026-08-01T01:00:00.000Z";
  stale.metrics["stocks.nvda.price"].market = "US";
  stale.metrics["stocks.nvda.price"].sessionState = "closed";
  stale.pages["/compute"].report.opposingEvidence = [];

  const review = await reviewSnapshot(stale);

  assert.deepEqual(
    review.checks.find((check) => check.id === "required-data")?.issueCodes,
    ["MODELED_MARKET_PRESENTATION", "STALE_REQUIRED_METRIC"],
  );
  assert.deepEqual(
    review.checks.find((check) => check.id === "narrative-evidence")?.issueCodes,
    ["MISSING_OPPOSING_EVIDENCE"],
  );
});

test("threads history into warning-only three-edition stagnation checks", async () => {
  const snapshot = reviewableCandidate();
  const prior = structuredClone(snapshot);
  const older = structuredClone(snapshot);
  prior.runId = "2026-07-29-wednesday";
  prior.dataCutoff = "2026-07-29T01:00:00.000Z";
  older.runId = "2026-07-25-saturday";
  older.dataCutoff = "2026-07-25T01:00:00.000Z";

  const review = await reviewSnapshot(snapshot, prior, reachableFetcher);
  const withHistory = await reviewCandidate(snapshot, prior, reachableFetcher, publicResolver, [older]);

  assert.equal(review.issues.some((issue) => issue.code === "METRIC_STAGNATION"), false);
  assert.ok(withHistory.issues.some((issue) => issue.code === "METRIC_STAGNATION" && issue.severity === "warn"));
  assert.ok(withHistory.issues.some((issue) => issue.code === "NARRATIVE_STAGNATION" && issue.severity === "warn"));
  assert.ok(withHistory.checks.find((check) => check.id === "anomaly")?.issueCodes.includes("METRIC_STAGNATION"));
  assert.ok(withHistory.checks.find((check) => check.id === "anomaly")?.issueCodes.includes("NARRATIVE_STAGNATION"));
  assert.notEqual(withHistory.decision, "reject");
});

test("CLI loads one older run from the sibling runs directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-review-history-"));
  try {
    const candidatePath = join(root, "candidate.json");
    const previousPath = join(root, "current.json");
    const reviewsDirectory = join(root, "reviews");
    const snapshot = reviewableCandidate();
    snapshot.dataCutoff = "2026-08-01T01:00:00.000Z";
    snapshot.generatedAt = snapshot.dataCutoff;
    const prior = structuredClone(snapshot);
    prior.runId = "2026-07-29-wednesday";
    prior.dataCutoff = "2026-07-29T01:00:00.000Z";
    prior.generatedAt = prior.dataCutoff;
    const older = structuredClone(snapshot);
    older.runId = "2026-07-25-saturday";
    older.dataCutoff = "2026-07-25T01:00:00.000Z";
    older.generatedAt = older.dataCutoff;
    await mkdir(join(root, "runs"));
    await writeFile(candidatePath, JSON.stringify(snapshot));
    await writeFile(previousPath, JSON.stringify(prior));
    await writeFile(join(root, "runs", `${older.runId}.json`), JSON.stringify(older));

    const result = await runMarketReview({
      candidatePath,
      previousPath,
      reviewsDirectory,
      fetcher: reachableFetcher,
      resolver: publicResolver,
    });
    assert.ok(result.review.issues.some((issue) => issue.code === "METRIC_STAGNATION"));
    assert.ok(result.review.issues.some((issue) => issue.code === "NARRATIVE_STAGNATION"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects incomplete sessions and unreachable sources without backups", async () => {
  const incomplete = reviewableCandidate();
  incomplete.metrics["stocks.nvda.price"].asOf = "2026-08-02T01:00:00.000Z";
  const incompleteReview = await reviewSnapshot(incomplete);
  assert.equal(incompleteReview.decision, "reject");
  assert.equal(incompleteReview.checks.find((check) => check.id === "completed-session")?.status, "fail");

  const sourceUrl = valid.sources["stanford-economy"].url;
  const unreachableReview = await reviewSnapshot(
    reviewableCandidate(),
    previousSnapshot,
    async (input) => new Response("", { status: String(input) === sourceUrl ? 503 : 200 }),
  );
  assert.equal(unreachableReview.decision, "reject");
  assert.equal(unreachableReview.checks.find((check) => check.id === "source-health")?.status, "fail");
});

test("auto-publishes when source-health issues are warnings only", async () => {
  const forbiddenUrl = valid.sources["broadcom-q2-fy26"].url;
  const review = await reviewSnapshot(
    reviewableCandidate(),
    previousSnapshot,
    async (input) => new Response("", { status: String(input) === forbiddenUrl ? 403 : 200 }),
  );

  assert.equal(review.decision, "auto_publish");
  assert.equal(review.checks.find((check) => check.id === "source-health")?.status, "warn");
});

test("rejects an unmatched numeric narrative claim", async () => {
  const snapshot = reviewableCandidate();
  snapshot.pages["/compute"].report.supportingEvidence.push({
    text: {
      en: "Accelerator supply rose to 999.",
      zh: "加速器供應升至 999。",
    },
    metricIds: ["compute.accelerator_pool"],
  });

  const review = await reviewSnapshot(snapshot);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.find((check) => check.id === "narrative-evidence")?.status, "fail");
});

test("rejects a no-change integrity failure", async () => {
  const prior = reviewableCandidate();
  const rewritten = structuredClone(prior);
  rewritten.pages["/models"].report.thesis.body.en += " Rewritten without a declared change.";

  const review = await reviewSnapshot(rewritten, prior);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.find((check) => check.id === "no-change-integrity")?.status, "fail");
});

test("rejects schema-invalid content but still emits every review check", async () => {
  const invalid = structuredClone(reviewableCandidate()) as unknown as Record<string, unknown>;
  delete (invalid.metrics as Record<string, unknown>)["pulse.infrastructure_spend"];

  const review = await reviewSnapshot(invalid);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.length, 9);
  assert.equal(review.checks.find((check) => check.id === "schema")?.status, "fail");
});

test("persists the full review atomically and maps all CLI decision exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-review-"));
  const candidatePath = join(root, "candidate.json");
  const previousPath = join(root, "previous.json");
  const reviewsDirectory = join(root, "reviews");
  await writeFile(previousPath, JSON.stringify(previousSnapshot));

  await writeFile(candidatePath, JSON.stringify(reviewableCandidate()));
  const accepted = await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
    resolver: publicResolver,
  });
  assert.equal(accepted.exitCode, 0);
  assert.deepEqual(JSON.parse(await readFile(accepted.outputPath, "utf8")), accepted.review);

  const manual = withoutNumericNarrative(withOpposingEvidence(structuredClone(conflicting)));
  manual.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  await writeFile(candidatePath, JSON.stringify(manual));
  assert.equal((await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
    resolver: publicResolver,
  })).exitCode, 2);

  await writeFile(candidatePath, "{not-json");
  assert.equal((await runMarketReview({
    candidatePath,
    previousPath,
    reviewsDirectory,
    fetcher: reachableFetcher,
    resolver: publicResolver,
  })).exitCode, 3);
});

test("rejects unsupported numeric claims across general bilingual report fields", async () => {
  const mutations: Array<(snapshot: MarketSnapshot) => void> = [
    (snapshot) => {
      snapshot.pages["/compute"].report.title = { en: "Compute 999", zh: "算力 999" };
    },
    (snapshot) => {
      snapshot.pages["/compute"].report.summary = { en: "Summary 999", zh: "摘要 999" };
    },
    (snapshot) => {
      snapshot.pages["/compute"].report.thesis.body = { en: "Thesis 999", zh: "論點 999" };
    },
    (snapshot) => {
      snapshot.pages["/compute"].report.risks = [{ en: "Risk 999", zh: "風險 999" }];
    },
  ];

  for (const mutate of mutations) {
    const snapshot = reviewableCandidate();
    mutate(snapshot);
    const review = await reviewSnapshot(snapshot);
    assert.equal(review.decision, "reject");
    assert.equal(review.checks.find((check) => check.id === "narrative-evidence")?.status, "fail");
  }
});

test("accepts numeric claims matched by the page citation set", async () => {
  const snapshot = reviewableCandidate();
  snapshot.pages["/compute"].report.title = {
    en: "Accelerator pool 242",
    zh: "加速器市場 242",
  };
  snapshot.pages["/compute"].report.risks = [{
    en: "Accelerator pool remains 242",
    zh: "加速器市場維持 242",
  }];

  assert.equal((await reviewSnapshot(snapshot)).decision, "auto_publish");
});

test("the deterministic candidate fixture is explicitly narrative-safe", async () => {
  const snapshot = structuredClone(valid);
  snapshot.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  snapshot.metrics["stocks.wolf.weekReturn"].display = { en: "-19.9%", zh: "-19.9%" };

  const review = await reviewSnapshot(snapshot);

  assert.equal(review.checks.find((check) => check.id === "narrative-evidence")?.status, "pass");
});

test("rejects a source publication year that does not match a cited metric", async () => {
  const snapshot = reviewableCandidate();
  snapshot.pages["/compute"].report.title = {
    en: "Compute outlook 2026",
    zh: "算力展望 2026",
  };

  const review = await reviewSnapshot(snapshot);

  assert.equal(review.decision, "reject");
  assert.equal(review.checks.find((check) => check.id === "narrative-evidence")?.status, "fail");
});

test("keeps review output inside the review directory for unsafe run IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-review-path-"));
  const candidatePath = join(root, "candidate.json");
  const previousPath = join(root, "previous.json");
  const reviewsDirectory = join(root, "reviews");
  await writeFile(previousPath, JSON.stringify(previousSnapshot));
  const unsafeRunIds = [
    "../current",
    "2026-08-01-saturday/../current",
    "2026-08-01-saturday%2F..%2Fcurrent",
    "2026-08-01-saturday\\..\\current",
    "C:\\windows\\current",
    "2026-02-30-saturday",
    "2026-08-01-wednesday",
    "2026-08-15-month-end",
    "2026-07-31-month-end",
    resolve(root, "escaped"),
  ];

  for (const runId of unsafeRunIds) {
    const snapshot = reviewableCandidate();
    snapshot.runId = runId;
    if (runId.endsWith("-wednesday")) snapshot.cadence = "wednesday";
    if (runId.endsWith("-month-end")) snapshot.cadence = "month-end";
    await writeFile(candidatePath, JSON.stringify(snapshot));
    const result = await runMarketReview({
      candidatePath,
      previousPath,
      reviewsDirectory,
      fetcher: reachableFetcher,
      resolver: publicResolver,
    });
    assert.equal(result.exitCode, 3);
    assert.equal(dirname(result.outputPath), resolve(reviewsDirectory));
  }
});

test("accepts only scheduled safe run IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-review-runs-"));
  const candidatePath = join(root, "candidate.json");
  const previousPath = join(root, "previous.json");
  const reviewsDirectory = join(root, "reviews");
  await writeFile(previousPath, JSON.stringify(previousSnapshot));
  const runs = [
    ["2026-07-29-wednesday", "wednesday"],
    ["2026-08-01-saturday", "saturday"],
    ["2026-07-25-month-end", "month-end"],
  ] as const;

  for (const [runId, cadence] of runs) {
    const snapshot = reviewableCandidate();
    snapshot.runId = runId;
    snapshot.cadence = cadence;
    await writeFile(candidatePath, JSON.stringify(snapshot));
    const result = await runMarketReview({
      candidatePath,
      previousPath,
      reviewsDirectory,
      fetcher: reachableFetcher,
      resolver: publicResolver,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.outputPath, resolve(reviewsDirectory, `${runId}.json`));
  }
});
