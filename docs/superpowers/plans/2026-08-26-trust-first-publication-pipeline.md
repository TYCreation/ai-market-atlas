# Trust-First Publication Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stale current metrics, unlabeled market-like models, and one-sided theses impossible to auto-publish while preserving the existing fail-closed deployment system.

**Architecture:** Freshness policy is code-owned and resolved by metric id. The existing quality gate emits new deterministic issues; review maps them into the existing nine-check schema for archive compatibility. Optional run history supplies three-edition stagnation detection without changing snapshot schema.

**Tech Stack:** TypeScript 5.9, Node test runner, JSON market snapshots, vinext build/export pipeline.

**Spec:** `docs/superpowers/specs/2026-08-26-trust-first-site-upgrade-design.md`

## Global Constraints

- Preserve the nine existing automated-review check ids so archived reviews remain valid.
- Do not weaken schema, completed-session, source-health, hash, promotion, lock, manifest, deployment, or restoration checks.
- Freshness policy is code-owned; candidate JSON cannot alter its own expiration.
- No paid provider, API key, guessed metric, or fabricated opposing evidence.
- Do not hand-edit `data/market/current.json`; promotion remains the only way to replace it.
- Keep `sources/` read-only.
- Stage only files named by the current task.

---

## File map

- `market-data/freshness.ts`: policy types, policy resolution, age calculation, and freshness state.
- `market-data/catalog.ts`: complete required-metric policy coverage.
- `market-data/history.ts`: safe recent-run loading and ordering for stagnation checks.
- `market-data/quality-gate.ts`: freshness, stagnation, editorial-balance, and modeled-presentation issues.
- `market-data/review.ts`: issue-code validation and mapping into existing review checks.
- `market-data/types.ts`: optional session metadata for non-market models; snapshot schema stays version 1.
- `market-data/schema.ts`: conditional session-field validation with backward-compatible historical reads.
- `market-data/session.ts`: completed-session checks only for published market observations.
- `scripts/market-review.ts`: load recent history from the sibling runs directory.
- `docs/automation/weekly-market-update-prompt.md`: authoritative path and research/editorial contract.
- `README.md`: matching operator documentation.
- `tests/market-data/freshness.test.ts`: policy boundary tests.
- `tests/market-data/history.test.ts`: deterministic history loading tests.
- `tests/market-data/quality-gate.test.ts`: issue behavior.
- `tests/market-data/review.test.ts`: decision and archived-review compatibility.
- `tests/fixtures/market/*.json`: complete synthetic opposing-evidence and freshness fixtures.

### Task 1: Code-owned metric freshness policies

**Files:**
- Create: `market-data/freshness.ts`
- Modify: `market-data/catalog.ts`
- Create: `tests/market-data/freshness.test.ts`

**Interfaces:**
- Produces: `FreshnessPolicy`, `FreshnessState`, `freshnessPolicyFor(metricId, metricKind)`, and `evaluateMetricFreshness(metric, dataCutoff)`.
- Consumed by: quality gate and reader-facing view model.

- [ ] **Step 1: Write failing policy and boundary tests**

Create `tests/market-data/freshness.test.ts` with concrete cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { evaluateMetricFreshness, freshnessPolicyFor } from "../../market-data/freshness.ts";
import { REQUIRED_METRIC_IDS, REQUIRED_STOCK_METRIC_IDS } from "../../market-data/catalog.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const snapshot = candidate as unknown as MarketSnapshot;

test("every required metric has one code-owned policy", () => {
  for (const id of [...REQUIRED_METRIC_IDS, ...REQUIRED_STOCK_METRIC_IDS]) {
    assert.ok(freshnessPolicyFor(id, snapshot.metrics[id].kind));
  }
});

test("weekly Atlas metrics expire after eight days", () => {
  const metric = { ...snapshot.metrics["pulse.power_queue"], asOf: "2026-07-24T01:00:00.000Z" };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T01:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-01T01:00:01.000Z").state, "stale");
});

test("a Friday US close remains current through Monday", () => {
  const metric = { ...snapshot.metrics["stocks.nvda.price"], asOf: "2026-07-31T20:00:00.000Z" };
  assert.equal(evaluateMetricFreshness(metric, "2026-08-03T20:00:00.000Z").state, "current");
  assert.equal(evaluateMetricFreshness(metric, "2026-08-05T20:00:00.000Z").state, "stale");
});
```

- [ ] **Step 2: Run the freshness test and verify failure**

Run: `node --experimental-strip-types --test tests/market-data/freshness.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `market-data/freshness.ts`.

- [ ] **Step 3: Implement the policy interface**

Create these public types in `market-data/freshness.ts`:

```ts
export type FreshnessPolicy =
  | { class: "market-close"; maxCompletedTradingDays: 2; stagnationEditions: 3 }
  | { class: "weekly"; maxAgeHours: 192; stagnationEditions: 3 }
  | { class: "periodic"; maxAgeHours: number }
  | { class: "event-driven" }
  | { class: "atlas-model"; maxAgeHours: 192; stagnationEditions: 3 };

export type FreshnessState = {
  state: "current" | "stale" | "dated";
  ageHours: number;
  policy: FreshnessPolicy;
};
```

Resolve all stock price/return ids as `market-close` and all required non-stock KPI ids as
`atlas-model`. Use a 110-day `periodic` window for these quarterly ids:

```text
compute.amd_data_center_growth
compute.amd_data_center_revenue
compute.cisco_ai_infrastructure_orders
energy.vertiv_q2_revenue_growth
pulse.amd_data_center_revenue
pulse.cisco_ai_infrastructure_orders
sic.onsemi_q2_revenue
stocks.amd_q2_revenue_growth
```

Classify the remaining known optional published ids as `event-driven`. Throw for an
unknown required id. Count completed US trading weekdays between `asOf` and `dataCutoff`;
weekends do not consume the two-session allowance.

- [ ] **Step 4: Run the focused test**

Run: `node --experimental-strip-types --test tests/market-data/freshness.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the policy unit**

```bash
git add market-data/freshness.ts market-data/catalog.ts tests/market-data/freshness.test.ts
git commit -m "feat: define metric freshness policies"
```

### Task 2: Blocking freshness, balance, and modeled-presentation issues

**Files:**
- Modify: `market-data/types.ts`
- Modify: `market-data/schema.ts`
- Modify: `market-data/session.ts`
- Modify: `market-data/quality-gate.ts`
- Modify: `market-data/review.ts`
- Modify: `tests/market-data/normalize.test.ts`
- Test: `tests/market-data/quality-gate.test.ts`
- Test: `tests/market-data/review.test.ts`
- Modify: `tests/fixtures/market/valid-candidate.json`

**Interfaces:**
- Consumes: `evaluateMetricFreshness(metric, current.dataCutoff)`.
- Produces issue codes: `STALE_REQUIRED_METRIC`, `STALE_OPTIONAL_METRIC`, `METRIC_STAGNATION`, `NARRATIVE_STAGNATION`, `MISSING_OPPOSING_EVIDENCE`, and `MODELED_MARKET_PRESENTATION`.

- [ ] **Step 1: Make the valid synthetic candidate truthfully modeled**

In `tests/fixtures/market/valid-candidate.json`, remove `market`, `marketTimezone`,
`primaryListing`, `securityType`, and `sessionState` from every metric whose `kind` is
`modeled`. Add one non-numeric, cited opposing-evidence item to each page so the valid
fixture represents the new contract. Do not change its metric values merely to satisfy a
test.

- [ ] **Step 2: Write failing gate tests**

Append focused cases to `tests/market-data/quality-gate.test.ts`:

```ts
test("blocks stale required current metrics", () => {
  const stale = structuredClone(valid);
  stale.dataCutoff = "2026-08-20T01:00:00.000Z";
  stale.metrics["pulse.power_queue"].asOf = "2026-08-01T01:00:00.000Z";
  assert.ok(evaluateQualityGate(stale, previousSnapshot).issues.some(
    (issue) => issue.code === "STALE_REQUIRED_METRIC" && issue.metricId === "pulse.power_queue",
  ));
});

test("warns without blocking on stale optional metrics", () => {
  const stale = structuredClone(valid);
  stale.dataCutoff = "2026-12-01T01:00:00.000Z";
  const id = "compute.amd_data_center_revenue";
  stale.metrics[id].asOf = "2026-08-01T01:00:00.000Z";
  const issue = evaluateQualityGate(stale, previousSnapshot).issues.find(
    (candidate) => candidate.code === "STALE_OPTIONAL_METRIC" && candidate.metricId === id,
  );
  assert.equal(issue?.severity, "warn");
});

test("blocks a page without opposing evidence", () => {
  const oneSided = structuredClone(valid);
  oneSided.pages["/compute"].report.opposingEvidence = [];
  assert.ok(evaluateQualityGate(oneSided, previousSnapshot).issues.some(
    (issue) => issue.code === "MISSING_OPPOSING_EVIDENCE" && issue.page === "/compute",
  ));
});

test("blocks modeled metrics carrying quote furniture", () => {
  const modeledQuote = structuredClone(valid);
  modeledQuote.metrics["stocks.nvda.price"].market = "US";
  modeledQuote.metrics["stocks.nvda.price"].sessionState = "closed";
  assert.ok(evaluateQualityGate(modeledQuote, previousSnapshot).issues.some(
    (issue) => issue.code === "MODELED_MARKET_PRESENTATION" && issue.metricId === "stocks.nvda.price",
  ));
});
```

- [ ] **Step 3: Run the gate test and verify failure**

Run: `node --experimental-strip-types --test tests/market-data/quality-gate.test.ts`

Expected: FAIL because the new issue codes do not exist.

- [ ] **Step 4: Make session metadata conditional without breaking history**

Change `MetricRecord.sessionState` to optional. `assertMarketSnapshot` must continue
accepting historical modeled records that contain `sessionState`, but a published record
with market/listing fields must still provide a supported `closed` or `holiday` value.
Update `assertCompletedSession` so an individual modeled stock metric with no market
metadata is accepted, while a published individual stock metric still requires complete
market, timezone, listing, security, and session metadata. Add this regression test to
`tests/market-data/normalize.test.ts`:

```ts
test("modeled stock estimates do not require exchange-session metadata", () => {
  const modeled = marketMetric({
    kind: "modeled",
    market: undefined,
    marketTimezone: undefined,
    primaryListing: undefined,
    securityType: undefined,
    sessionState: undefined,
  });
  assert.doesNotThrow(() => assertCompletedSession(modeled, runStart));
});
```

- [ ] **Step 5: Extend the deterministic issue union and gate loop**

Add the five issue codes to `GateIssue["code"]`. For each metric:

```ts
const freshness = evaluateMetricFreshness(metric, current.dataCutoff);
if (metric.required && freshness.state === "stale") {
  issues.push(issueForMetric(
    "STALE_REQUIRED_METRIC",
    "block",
    metric,
    `Required metric is stale under ${freshness.policy.class} policy.`,
  ));
}
if (!metric.required && freshness.state === "stale") {
  issues.push(issueForMetric(
    "STALE_OPTIONAL_METRIC",
    "warn",
    metric,
    `Optional metric is stale under ${freshness.policy.class} policy.`,
  ));
}

const marketFurniture = [
  metric.market,
  metric.marketTimezone,
  metric.primaryListing,
  metric.securityType,
  metric.sessionState,
].some((value) => value !== undefined);
if (metric.kind === "modeled" && marketFurniture) {
  issues.push(issueForMetric(
    "MODELED_MARKET_PRESENTATION",
    "block",
    metric,
    "Modeled metrics cannot carry exchange-market presentation fields.",
  ));
}
```

For every page, emit blocking `MISSING_OPPOSING_EVIDENCE` when `report.opposingEvidence.length === 0`.

- [ ] **Step 6: Preserve the nine-check review schema**

Add the issue codes to `GATE_ISSUE_CODES` and map them without adding check ids:

```ts
"required-data": [
  "MISSING_REQUIRED",
  "LOW_CONFIDENCE",
  "STALE_REQUIRED_METRIC",
  "STALE_OPTIONAL_METRIC",
  "MODELED_MARKET_PRESENTATION",
],
anomaly: [
  "UNEXPLAINED_PRICE_MOVE",
  "FINANCIAL_DELTA",
  "FORECAST_DELTA",
  "THESIS_REVERSAL",
  "METRIC_STAGNATION",
  "NARRATIVE_STAGNATION",
],
"narrative-evidence": ["MISSING_OPPOSING_EVIDENCE"],
```

Build the narrative check from both sources:

```ts
const editorialIssues = gateIssues.filter(
  (issue) => issue.code === "MISSING_OPPOSING_EVIDENCE",
);
directCheck("narrative-evidence", [...narrativeIssues, ...editorialIssues]);
```

Archived reviews with nine passing check ids must continue validating.

- [ ] **Step 7: Run focused schema, gate, and review tests**

```bash
node --experimental-strip-types --test tests/market-data/quality-gate.test.ts
node --experimental-strip-types --test tests/market-data/review.test.ts
node --experimental-strip-types --test tests/market-data/normalize.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the blocking trust gates**

```bash
git add market-data/types.ts market-data/schema.ts market-data/session.ts market-data/quality-gate.ts market-data/review.ts tests/market-data/normalize.test.ts tests/market-data/quality-gate.test.ts tests/market-data/review.test.ts tests/fixtures/market/valid-candidate.json
git commit -m "feat: block stale and one-sided market briefs"
```

### Task 3: Three-edition stagnation detection

**Files:**
- Create: `market-data/history.ts`
- Modify: `market-data/quality-gate.ts`
- Modify: `market-data/review.ts`
- Modify: `scripts/market-review.ts`
- Create: `tests/market-data/history.test.ts`
- Modify: `tests/market-data/quality-gate.test.ts`
- Modify: `tests/market-data/review.test.ts`

**Interfaces:**
- Produces: `loadRecentSnapshots(directory, beforeCutoff, limit): Promise<MarketSnapshot[]>`.
- Extends: `evaluateQualityGate(current, previous, externalIssues?, history?)` and `reviewCandidate(candidate, previous, fetcher, resolver?, history?)`.

- [ ] **Step 1: Write failing history-order tests**

Create `tests/market-data/history.test.ts` that writes three valid snapshots with distinct `dataCutoff` values into a temporary runs directory, plus a non-JSON file, then asserts:

```ts
const recent = await loadRecentSnapshots(root, "2026-08-26T01:00:00.000Z", 2);
assert.deepEqual(recent.map((item) => item.runId), [
  "2026-08-22-saturday",
  "2026-08-19-wednesday",
]);
```

- [ ] **Step 2: Run the history test and verify failure**

Run: `node --experimental-strip-types --test tests/market-data/history.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement safe history loading**

`loadRecentSnapshots` must read only direct-child `.json` files, reject symlinks, validate with `assertMarketSnapshot`, filter `dataCutoff < beforeCutoff`, sort newest first, and return at most `limit`. Invalid direct-child JSON fails closed with its filename in the error.

- [ ] **Step 4: Add three-edition warning tests**

In `quality-gate.test.ts`, pass an older snapshot as history and assert:

```ts
const prior = structuredClone(valid);
const older = structuredClone(valid);
older.dataCutoff = "2026-07-26T01:00:00.000Z";
const issues = evaluateQualityGate(valid, prior, [], [older]).issues;
assert.ok(issues.some((issue) => issue.code === "METRIC_STAGNATION"));
assert.ok(issues.some((issue) => issue.code === "NARRATIVE_STAGNATION"));
assert.equal(issues.some((issue) =>
  ["METRIC_STAGNATION", "NARRATIVE_STAGNATION"].includes(issue.code) && issue.severity === "block"
), false);
```

The metric warning applies only to market-close, weekly, and Atlas-model policies. Periodic and event-driven metrics do not warn merely because they are unchanged.

- [ ] **Step 5: Thread history through review and CLI**

Add the optional parameters with these signatures:

```ts
export function evaluateQualityGate(
  current: MarketSnapshot,
  previous: MarketSnapshot,
  externalIssues: GateIssue[] = [],
  history: readonly MarketSnapshot[] = [],
): GateResult;

export async function reviewCandidate(
  candidate: unknown,
  previous: MarketSnapshot,
  fetcher: SourceFetcher,
  resolver: HostnameResolver = resolveHostname,
  history: readonly MarketSnapshot[] = [],
): Promise<AutomatedReview>;
```

`scripts/market-review.ts` loads one snapshot older than `previous.dataCutoff` from the runs
directory beside `current.json` and passes it into review. The three editions are therefore
candidate, previous, and history[0], with no duplicate run id. Tests may pass history
explicitly and remain deterministic.

- [ ] **Step 6: Run history, gate, and review tests**

```bash
node --experimental-strip-types --test tests/market-data/history.test.ts
node --experimental-strip-types --test tests/market-data/quality-gate.test.ts
node --experimental-strip-types --test tests/market-data/review.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit stagnation detection**

```bash
git add market-data/history.ts market-data/quality-gate.ts market-data/review.ts scripts/market-review.ts tests/market-data/history.test.ts tests/market-data/quality-gate.test.ts tests/market-data/review.test.ts
git commit -m "feat: warn on three-edition publication stagnation"
```

### Task 4: Scheduled research and editorial contract

**Files:**
- Modify: `docs/automation/weekly-market-update-prompt.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: new gate behavior from Tasks 1-3.
- Produces: a scheduled workflow that researches enough data and narrative balance to pass without bypasses.

- [ ] **Step 1: Update the authoritative path**

The prompt's first line must use:

```text
/Volumes/2TB_Micron/Claude/web/ai-market-atlas
```

Remove the old `.codex/.chatgpt-projects/...` path entirely.

- [ ] **Step 2: Replace the carry-forward rule**

Use this exact policy in the prompt and README:

```text
If a free source is unavailable, retain the last observation only when it remains inside
its code-owned freshness window. Otherwise mark the metric waiting and stop publication
when it is required. Never present an expired or modeled replacement as current.
```

- [ ] **Step 3: Add the editorial review requirements**

Require the scheduled researcher to re-examine every page thesis, publish at least one cited opposing-evidence item per page, make risks falsifiable rather than methodological, and mark a page changed when an evidenced thesis or stance revision occurs. Do not require a non-neutral stance when evidence does not support one.

- [ ] **Step 4: Update operator reporting**

The final run report must list freshness failures, stagnation warnings, modeled-presentation failures, opposing-evidence coverage, changed/retained theses, and the authoritative workspace path.

- [ ] **Step 5: Verify the documentation contract**

Run:

```bash
rg -n '/Users/tonyyang/.codex/.chatgpt-projects|retain the last verified value' docs/automation/weekly-market-update-prompt.md README.md
rg -n 'opposingEvidence|freshness|stagnation|/Volumes/2TB_Micron/Claude/web/ai-market-atlas' docs/automation/weekly-market-update-prompt.md README.md
```

Expected: the first search returns no obsolete instruction; the second finds every new contract term and the authoritative path.

- [ ] **Step 6: Commit the operator contract**

```bash
git add docs/automation/weekly-market-update-prompt.md README.md
git commit -m "docs: align scheduled publishing with trust gates"
```

### Task 5: Complete remaining synthetic fixtures and full pipeline verification

**Files:**
- Modify: `tests/fixtures/market/valid-candidate.json`
- Modify: other `tests/fixtures/market/*.json` files only where they are intended to remain otherwise valid.
- Modify: `tests/market-data/helpers.ts`
- Modify: `tests/market-data/end-to-end.test.ts`

**Interfaces:**
- Consumes: all trust-gate interfaces.
- Produces: deterministic valid, stale, one-sided, and modeled-presentation fixture paths.

- [ ] **Step 1: Keep each negative fixture single-purpose**

Propagate the valid fixture's modeled-field cleanup and opposing-evidence contract into
`conflicting-prices.json`, `missing-required.json`, and `thesis-reversal.json` without
removing each file's named defect. Use these existing page metrics for opposing evidence:

```text
/         -> pulse.power_queue
/stocks   -> stocks.positive_breadth
/compute  -> compute.packaging_lead_weeks
/energy   -> energy.committed_power_gw
/models   -> models.production_agents
/sic      -> sic.wafer_frontier_mm
```

Each item must have non-empty English and Traditional Chinese text and must not introduce a numeric claim absent from its cited metric.

- [ ] **Step 2: Derive new trust failures in test code**

Derive stale, missing-opposing-evidence, and modeled-market-presentation cases with `structuredClone(valid)` inside tests. Do not duplicate the full snapshot into three new JSON files.

- [ ] **Step 3: Update helper-generated reviews without changing the nine ids**

`autoPublishReview()` must still emit the same nine sorted, passing check ids. Add a regression assertion that `assertAutoPublishReview(autoPublishReview(candidate), candidate)` succeeds for the valid fixture.

- [ ] **Step 4: Run the full market suite**

Run: `npm run test:market`

Expected: PASS with freshness, history, quality-gate, review, storage, export, deployment, and end-to-end tests green.

- [ ] **Step 5: Run the isolated fixture publication rehearsal**

Run the existing end-to-end fixture test:

```bash
node --experimental-strip-types --test tests/market-data/end-to-end.test.ts
```

Expected: a valid candidate reviews, promotes, builds, and exports inside a temporary workspace with `deploymentAttempted: false`; blocked fixtures stop before promotion.

- [ ] **Step 6: Commit fixture completion**

```bash
git add tests/fixtures/market tests/market-data/helpers.ts tests/market-data/end-to-end.test.ts
git commit -m "test: cover trust-first publication gates"
```

### Task 6: Prepare a real fresh candidate without hand-editing current state

**Files:**
- Create through the documented workflow: `data/market/candidate.json`
- Generated by review: `data/market/reviews/<run-id>.json`
- Generated only after authorization: brief and export artifacts.

**Interfaces:**
- Consumes: updated scheduled prompt and all trust checks.
- Produces: an `auto_publish` candidate ready for the reader-experience release rehearsal.

- [ ] **Step 1: Research the current scheduled edition**

Use first-party and free public sources. Refresh every required market-close and Atlas-model metric inside its policy window. For each page, write one genuinely opposing cited observation and re-evaluate the thesis. If a required observation cannot be refreshed, leave it waiting and stop; do not change its value or as-of date merely to pass.

- [ ] **Step 2: Write only the candidate**

Write the complete normalized bilingual snapshot to `data/market/candidate.json`. Do not edit `current.json`, run archives, reviews, generated brief assets, or deployment files by hand.

- [ ] **Step 3: Validate and review**

```bash
npm run market:validate -- --candidate data/market/candidate.json
npm run market:review -- --candidate data/market/candidate.json --previous data/market/current.json --reviews-directory data/market/reviews
```

Expected: schema validation succeeds and the persisted review decision is `auto_publish`. Any other decision stops this task and reports every issue without promotion.

- [ ] **Step 4: Do not promote yet**

Leave the reviewed candidate intact for the reader-experience plan. Promotion and production deployment occur only after the UI, build, export, and preview checks pass.
