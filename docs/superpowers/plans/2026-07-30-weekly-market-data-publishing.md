# Weekly Market Data Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guarded Wednesday/Saturday pipeline that turns sourced market facts into bilingual AI Market Atlas updates, monthly archives, validated HyperFrames briefs, and recoverable Cloudflare Pages deployments.

**Architecture:** A structured market snapshot becomes the single numeric source of truth. A source adapter produces a candidate, normalization and quality-gate modules decide whether it may be promoted, presentation adapters feed the existing dashboard and HyperFrames surfaces, and a publishing runner exports, deploys, verifies, and restores the last-known-good static site when needed.

**Tech Stack:** Node.js 22.13+, TypeScript 5.9, Node test runner, Next.js 16/Vinext, React 19, static JSON snapshots, HyperFrames HTML, Cloudflare Pages/Wrangler.

## Global Constraints

- Schedule in `Asia/Taipei`: Wednesday and Saturday at 09:00.
- Use the most recent completed market session; do not add intraday prices.
- U.S. AI equities are primary; Taiwan, Korea, and Europe supply-chain listings remain in scope.
- Start with free public and first-party sources; keep the source-adapter interface open for future paid APIs.
- Normal updates publish automatically; source conflict, missing data, anomalous movement, thesis reversal, or failed validation requires approval.
- Never invent a missing value. Keep the last verified value, original date, and `waiting` status.
- Every changed public number needs a source, period, and retrieval timestamp.
- English and Traditional Chinese must use one shared numeric snapshot.
- Preserve “not investment advice.”
- Public history consists of the latest report plus one archive on the final Saturday of each month.
- Retain ordinary run snapshots for 90 days and monthly snapshots permanently.
- Preserve all existing routes, bilingual switching, source panels, and HyperFrames behavior.
- Do not add a paid dependency or data service in this implementation.

## File Structure

- `market-data/types.ts`: shared snapshot, metric, source, gate, and archive contracts.
- `market-data/catalog.ts`: exact required metric IDs and page/KPI mappings.
- `market-data/schema.ts`: runtime validation for untrusted candidate JSON.
- `market-data/adapters/types.ts`: stable free/paid source-adapter boundary.
- `market-data/adapters/json-candidate.ts`: initial adapter for an agent-authored candidate.
- `market-data/normalize.ts`: canonical dates, ordering, confidence, and completed-session rules.
- `market-data/source-health.ts`: injected, timeout-bounded source-link checks.
- `market-data/quality-gate.ts`: all automatic-publish and manual-review rules.
- `market-data/storage.ts`: candidate loading, promotion, 90-day pruning, and monthly archive writes.
- `market-data/view-model.ts`: dashboard/source-panel values derived from the current snapshot.
- `market-data/monthly.ts`: archive index and archive lookup helpers.
- `market-data/deployment.ts`: publishing and last-known-good restoration interfaces.
- `data/market/current.json`: promoted source of truth used by the website.
- `data/market/monthly/index.json`: permanent public monthly archive records.
- `data/market/candidate.json`: ignored automation output awaiting validation.
- `scripts/seed-market-snapshot.ts`: one-time converter from the current illustrative dashboard.
- `scripts/market-update.ts`: `validate`, `promote`, and `prune` commands.
- `scripts/generate-market-brief.ts`: HyperFrames data generation and canonical-copy synchronization.
- `scripts/export-pages.ts`: render every static route, including archive routes.
- `scripts/deploy-pages.ts`: Cloudflare deployment, verification, and restoration.
- `app/components/EditionStatus.tsx`: update cutoff, verification state, and no-change presentation.
- `app/components/ArchiveReport.tsx`: bilingual monthly archive view.
- `app/archive/page.tsx`: archive index.
- `app/archive/[month]/page.tsx`: `/archive/YYYY-MM` report.
- `docs/automation/weekly-market-update-prompt.md`: source-controlled automation instructions.
- `tests/market-data/*.test.ts`: unit and integration coverage for the pipeline.
- `tests/fixtures/market/*.json`: deterministic candidate, previous, conflict, and missing-data inputs.

---

### Task 1: Structured Market Snapshot Contract

**Files:**
- Create: `market-data/types.ts`
- Create: `market-data/catalog.ts`
- Create: `market-data/schema.ts`
- Create: `market-data/adapters/types.ts`
- Create: `market-data/adapters/json-candidate.ts`
- Create: `scripts/seed-market-snapshot.ts`
- Create: `tests/market-data/schema.test.ts`
- Create: `tests/market-data/adapters.test.ts`
- Create: `tests/market-data/helpers.ts`
- Create: `tests/fixtures/market/valid-candidate.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `MarketSnapshot`, `MetricRecord`, `MetricObservation`, `PageReport`, `SourceRecord`, `assertMarketSnapshot(value)`, `KPI_CATALOG`, `REQUIRED_METRIC_IDS`, `SourceAdapter`, `jsonCandidateAdapter`, `makeFixtureWorkspace()`, `makeBlockedFixtureWorkspace()`, and `pathsFor(root)`.
- Consumes: current exports from `app/content.ts`, `app/content-zh.ts`, and `app/sources.ts` only in the one-time seed script.

- [ ] **Step 1: Add a failing runtime-schema test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { assertMarketSnapshot } from "../../market-data/schema.ts";

test("accepts a complete bilingual candidate", () => {
  assert.doesNotThrow(() => assertMarketSnapshot(candidate));
});

test("rejects a required metric without sources", () => {
  const broken = structuredClone(candidate);
  broken.metrics["pulse.infrastructure_spend"].sourceIds = [];
  assert.throws(
    () => assertMarketSnapshot(broken),
    /pulse\.infrastructure_spend must have at least one source/,
  );
});
```

- [ ] **Step 2: Run the schema test and verify the missing-module failure**

Run: `node --experimental-strip-types --test tests/market-data/schema.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `market-data/schema.ts`.

- [ ] **Step 3: Define the complete shared contracts**

```ts
export type Locale = "zh" | "en";
export type RunCadence = "wednesday" | "saturday" | "month-end";
export type MetricKind = "published" | "modeled";
export type Confidence = "high" | "medium" | "low";
export type MetricStatus = "verified" | "waiting";
export type SessionState = "closed" | "holiday";
export type PageSlug = "/" | "/stocks" | "/compute" | "/energy" | "/models" | "/sic";
export type ThesisStance = "bullish" | "neutral" | "bearish";
export type BilingualText = Record<Locale, string>;

export type SourceRecord = {
  id: string;
  kind: "official" | "company" | "research" | "pricing" | "market" | "atlas";
  publisher: string;
  title: string;
  url?: string;
  publishedAt: string;
  retrievedAt: string;
  scope: Record<Locale, string>;
};

export type MetricObservation = {
  sourceId: string;
  numericValue: number;
  asOf: string;
};

export type MetricRecord = {
  id: string;
  page: PageSlug;
  required: boolean;
  kind: MetricKind;
  numericValue: number;
  previousNumericValue?: number;
  display: Record<Locale, string>;
  unit: string;
  currency?: string;
  market?: string;
  marketTimezone?: string;
  primaryListing?: string;
  securityType?: "primary" | "adr" | "not-applicable";
  asOf: string;
  sessionState: SessionState;
  sourceIds: string[];
  observations: MetricObservation[];
  confidence: Confidence;
  status: MetricStatus;
};

export type PageReport = {
  eyebrow: BilingualText;
  title: BilingualText;
  summary: BilingualText;
  signal: BilingualText;
  thesis: {
    title: BilingualText;
    body: BilingualText;
    tags: Record<Locale, string[]>;
  };
  supportingEvidence: Array<{ text: BilingualText; metricIds: string[] }>;
  opposingEvidence: Array<{ text: BilingualText; metricIds: string[] }>;
  catalysts: BilingualText[];
  risks: BilingualText[];
  nextObservations: BilingualText[];
};

export type PageState = {
  changed: boolean;
  changeReasons: Array<
    "first-party-event" | "rounded-value-change" | "gate-worthy-movement" | "conclusion-changing-evidence"
  >;
  verifiedAt: string;
  thesisStance: ThesisStance;
  previousThesisStance: ThesisStance;
  thesisMetricIds: string[];
  report: PageReport;
};

export type MarketSnapshot = {
  schemaVersion: 1;
  runId: string;
  cadence: RunCadence;
  generatedAt: string;
  dataCutoff: string;
  pages: Record<PageSlug, PageState>;
  sources: Record<string, SourceRecord>;
  metrics: Record<string, MetricRecord>;
  keySignalIds: string[];
};
```

Define the adapter boundary without performing network I/O inside the schema layer:

```ts
export type CollectionContext = {
  runId: string;
  cadence: RunCadence;
  runStartedAt: string;
  previous: MarketSnapshot;
};

export interface SourceAdapter {
  id: string;
  collect(context: CollectionContext): Promise<MarketSnapshot>;
}

export class AdapterError extends Error {
  constructor(
    public code: "FORMAT_CHANGED" | "UNAVAILABLE" | "RATE_LIMITED" | "NO_DATA",
    message: string,
  ) {
    super(message);
  }
}
```

`jsonCandidateAdapter` reads a path supplied by the caller, parses it as untrusted JSON, runs `assertMarketSnapshot`, and returns the typed snapshot. The scheduled agent is the initial producer; a future paid API adapter must implement this same interface without changing storage, gates, views, or deployment.

- [ ] **Step 4: Add the exact required KPI catalog**

```ts
export const KPI_CATALOG = [
  ["/", 0, "pulse.infrastructure_spend", "$B"],
  ["/", 1, "pulse.accelerator_market", "$B"],
  ["/", 2, "pulse.power_queue", "GW"],
  ["/", 3, "pulse.enterprise_agents", "programs"],
  ["/stocks", 0, "stocks.basket_30d", "%"],
  ["/stocks", 1, "stocks.positive_breadth", "%"],
  ["/stocks", 2, "stocks.median_forward_pe", "x"],
  ["/stocks", 3, "stocks.catalyst_count", "events"],
  ["/compute", 0, "compute.accelerator_pool", "$B"],
  ["/compute", 1, "compute.hbm_demand", "%"],
  ["/compute", 2, "compute.packaging_lead_weeks", "weeks"],
  ["/compute", 3, "compute.inference_cost_change", "%"],
  ["/energy", 0, "energy.announced_power_gw", "GW"],
  ["/energy", 1, "energy.committed_power_gw", "GW"],
  ["/energy", 2, "energy.interconnection_years", "years"],
  ["/energy", 3, "energy.liquid_cooling_share", "%"],
  ["/models", 0, "models.production_agents", "programs"],
  ["/models", 1, "models.software_spend_growth", "%"],
  ["/models", 2, "models.managed_tokens", "T tokens"],
  ["/models", 3, "models.api_deployment_share", "%"],
  ["/sic", 0, "sic.market_2030_usd_b", "$B"],
  ["/sic", 1, "sic.wafer_frontier_mm", "mm"],
  ["/sic", 2, "sic.packaging_watts", "W"],
  ["/sic", 3, "sic.ev_penetration", "%"],
] as const;

export const REQUIRED_METRIC_IDS = new Set(
  KPI_CATALOG.map((entry) => entry[2]),
);
```

Add stock observation IDs with the factory `stockMetricId(ticker, field)` for `price`, `weekReturn`, and `monthReturn`; every equity currently in `equityDive.equities` is `required`.

- [ ] **Step 5: Implement strict runtime validation**

`assertMarketSnapshot` must reject:

- unsupported `schemaVersion`;
- a malformed ISO timestamp;
- a catalog ID missing from `metrics`;
- a required metric with no source;
- a source ID absent from `sources`;
- an observation whose source is absent from both `sourceIds` and `sources`;
- a published price with fewer than two independent observations;
- a public source URL containing credentials, private-file schemes, or secret-like query parameters;
- different numeric and display identities, represented by missing `display.zh` or `display.en`;
- a `low`-confidence required metric marked `verified`;
- a `keySignalId` or `thesisMetricId` that does not resolve to a sourced metric;
- duplicate source or metric IDs.

Use explicit type guards and descriptive errors; do not add a schema dependency.

- [ ] **Step 6: Implement and run the one-time seed converter**

`scripts/seed-market-snapshot.ts` must map every `KPI_CATALOG` tuple to the existing English and Chinese KPI at the same slug/index, copy `sourceBundles[slug].kpiSources[index]`, and mark all seeded values `kind: "modeled"` because the current website labels them illustrative.

Run: `node --experimental-strip-types scripts/seed-market-snapshot.ts`
Expected: creates `data/market/current.json` and prints `Seeded 24 required KPIs plus equity metrics`.

Run: `node --experimental-strip-types scripts/seed-market-snapshot.ts --output tests/fixtures/market/valid-candidate.json --run-id 2026-08-01-saturday`
Expected: creates the deterministic complete fixture from the same converter. `tests/market-data/helpers.ts` loads fixtures and creates isolated temporary candidate/current/runs/monthly directory trees for later tests.

- [ ] **Step 7: Test the adapter boundary**

Verify that `jsonCandidateAdapter.collect(context)` accepts the valid fixture, rejects malformed JSON as `FORMAT_CHANGED`, rejects a schema-invalid candidate before normalization, and maps absent/rate-limited fixture outcomes to the stable adapter error codes. Future network adapters must use the same codes.

- [ ] **Step 8: Add unit-test scripts and verify**

```json
{
  "scripts": {
    "test:market": "node --experimental-strip-types --test tests/market-data/*.test.ts",
    "market:seed": "node --experimental-strip-types scripts/seed-market-snapshot.ts"
  }
}
```

Run: `npm run test:market`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json market-data data/market/current.json scripts/seed-market-snapshot.ts tests/market-data tests/fixtures/market
git commit -m "Add structured market snapshot contract"
```

---

### Task 2: Normalization and Completed-Session Rules

**Files:**
- Create: `market-data/normalize.ts`
- Create: `market-data/session.ts`
- Create: `tests/market-data/normalize.test.ts`
- Create: `tests/fixtures/market/previous-snapshot.json`

**Interfaces:**
- Consumes: `MarketSnapshot`, `MetricRecord` from Task 1.
- Produces: `normalizeCandidate(candidate, previous, now): MarketSnapshot`, `assertCompletedSession(metric, runStart): void`, `normalizeUnit(value, from, to): number`.

- [ ] **Step 1: Write failing normalization tests**

```ts
test("sorts sources and metrics and keeps the prior value", () => {
  const normalized = normalizeCandidate(candidate, previous, new Date("2026-08-01T01:00:00Z"));
  assert.equal(
    normalized.metrics["stocks.nvda.price"].previousNumericValue,
    previous.metrics["stocks.nvda.price"].numericValue,
  );
  assert.deepEqual(Object.keys(normalized.sources), Object.keys(normalized.sources).sort());
});

test("rejects a future or incomplete market session", () => {
  const future = structuredClone(candidate);
  future.metrics["stocks.nvda.price"].asOf = "2026-08-01T20:00:00Z";
  assert.throws(
    () => normalizeCandidate(future, previous, new Date("2026-08-01T01:00:00Z")),
    /stocks\.nvda\.price is not a completed session/,
  );
});

test("normalizes comparable units but preserves local-currency prices", () => {
  assert.equal(normalizeUnit(2.8, "trillion-usd", "billion-usd"), 2800);
  const normalized = normalizeCandidate(candidate, previous, new Date("2026-08-01T01:00:00Z"));
  assert.equal(normalized.metrics["stocks.2330.tw.price"].currency, "TWD");
  assert.equal(normalized.metrics["stocks.2330.tw.price"].primaryListing, "2330.TW");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="sorts sources|future"`
Expected: FAIL because `normalizeCandidate` is not defined.

- [ ] **Step 3: Implement deterministic normalization**

```ts
export function normalizeCandidate(
  candidate: MarketSnapshot,
  previous: MarketSnapshot,
  now: Date,
): MarketSnapshot {
  assertMarketSnapshot(candidate);
  const metrics = Object.fromEntries(
    Object.entries(candidate.metrics)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, metric]) => {
        assertCompletedSession(metric, now);
        return [
          id,
          {
            ...metric,
            previousNumericValue: previous.metrics[id]?.numericValue,
            sourceIds: [...metric.sourceIds].sort(),
          },
        ];
      }),
  );
  return {
    ...candidate,
    sources: Object.fromEntries(
      Object.entries(candidate.sources).sort(([a], [b]) => a.localeCompare(b)),
    ),
    metrics,
  };
}
```

`assertCompletedSession` accepts `sessionState: "holiday"` only when the metric keeps the last verified `asOf`; it rejects `asOf > runStart`, invalid market/time-zone labels, and a `closed` session whose timestamp is later than the run start. Normalize published percentages and report units through an explicit conversion table, preserve local-currency stock prices, and use percentage returns—not absolute prices—for cross-market comparison. Validate primary listing and ADR metadata rather than silently inferring it.

- [ ] **Step 4: Test weekend, holiday, U.S., Taiwan, Korea, and Europe fixtures**

Run: `npm run test:market`
Expected: PASS for all normalization tests.

- [ ] **Step 5: Commit**

```bash
git add market-data/normalize.ts market-data/session.ts tests/market-data/normalize.test.ts tests/fixtures/market/previous-snapshot.json
git commit -m "Normalize completed market sessions"
```

---

### Task 3: Guarded Quality Gate

**Files:**
- Create: `market-data/source-health.ts`
- Create: `market-data/quality-gate.ts`
- Create: `tests/market-data/source-health.test.ts`
- Create: `tests/market-data/quality-gate.test.ts`
- Create: `tests/fixtures/market/conflicting-prices.json`
- Create: `tests/fixtures/market/missing-required.json`
- Create: `tests/fixtures/market/thesis-reversal.json`

**Interfaces:**
- Consumes: normalized current and previous `MarketSnapshot`.
- Produces: `checkSourceHealth(snapshot, fetcher): Promise<GateIssue[]>`, `evaluateQualityGate(current, previous, externalIssues?): GateResult`.

```ts
export type GateIssue = {
  code:
    | "SOURCE_CONFLICT"
    | "UNEXPLAINED_PRICE_MOVE"
    | "FINANCIAL_DELTA"
    | "FORECAST_DELTA"
    | "MISSING_REQUIRED"
    | "LOW_CONFIDENCE"
    | "THESIS_REVERSAL"
    | "BILINGUAL_MISMATCH"
    | "MATERIAL_CHANGE_MISMATCH"
    | "SOURCE_UNREACHABLE";
  severity: "block" | "warn";
  metricId?: string;
  page?: PageSlug;
  message: string;
  oldValue?: number;
  newValue?: number;
  sourceIds: string[];
};

export type GateResult = {
  publishable: boolean;
  issues: GateIssue[];
};
```

- [ ] **Step 1: Write failing threshold tests**

```ts
test("blocks prices that disagree by more than one percent", () => {
  const result = evaluateQualityGate(conflicting, previous);
  assert.equal(result.publishable, false);
  assert.equal(result.issues[0].code, "SOURCE_CONFLICT");
});

test("blocks when more than twenty percent of required metrics wait", () => {
  const result = evaluateQualityGate(missingRequired, previous);
  assert.equal(result.publishable, false);
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_REQUIRED"));
});

test("blocks a thesis stance reversal", () => {
  const result = evaluateQualityGate(thesisReversal, previous);
  assert.ok(result.issues.some((issue) => issue.code === "THESIS_REVERSAL"));
});

test("blocks an unreachable sole source for a required metric", async () => {
  const issues = await checkSourceHealth(candidate, async () => new Response("", { status: 503 }));
  assert.ok(issues.some((issue) => issue.code === "SOURCE_UNREACHABLE"));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="blocks"`
Expected: FAIL because the quality-gate module is missing.

- [ ] **Step 3: Implement every approved rule**

Implement:

- source price spread `> 1%`, computed from `MetricRecord.observations`;
- weekly absolute equity return `> 20%` without an official/company corroborating source;
- revenue-growth or valuation movement `> 10` percentage points without a new financial source;
- market-size or long-range forecast movement `> 10%` without a new research source;
- waiting status on `> 20%` of required metrics;
- required metric with `confidence: "low"`;
- bullish↔bearish or prior-thesis-negating stance change;
- missing English or Chinese display value;
- `changed: false` with rewritten report/thesis content, or `changed: true` with no new first-party event, rounded-value change, gate-worthy movement, or conclusion-changing evidence;
- non-required missing metrics as warnings.

Return all issues in stable `code`, `metricId`, `page` order so reports and tests remain deterministic.

`checkSourceHealth` receives an injected fetch-compatible function, uses a 10-second timeout, follows redirects, and accepts 2xx/3xx results. It checks the exact URLs cited by required, thesis, and key-signal metrics, caching each URL result for the duration of the run so no source is requested twice. A 403/405 response is a warning only when a second reachable high-confidence source covers that metric; otherwise it blocks. Merge its issues into `evaluateQualityGate` before deciding `publishable`.

- [ ] **Step 4: Run the complete gate suite**

Run: `npm run test:market`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add market-data/source-health.ts market-data/quality-gate.ts tests/market-data/source-health.test.ts tests/market-data/quality-gate.test.ts tests/fixtures/market
git commit -m "Add guarded market quality gate"
```

---

### Task 4: Candidate Validation, Promotion, and Retention CLI

**Files:**
- Create: `market-data/storage.ts`
- Create: `scripts/market-update.ts`
- Create: `tests/market-data/storage.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `normalizeCandidate`, `checkSourceHealth`, `evaluateQualityGate`.
- Produces: `validateCandidate(paths): Promise<GateResult>`, `promoteCandidate(paths): Promise<PromotionResult>`, `restoreCurrent(paths, promotion): Promise<void>`, `pruneRuns(root, now): Promise<string[]>`.

```ts
export type PromotionResult = {
  promoted: true;
  runId: string;
  archivedPath: string;
  monthlyArchiveMonth?: string;
};
```

- [ ] **Step 1: Write a failing promotion test**

```ts
test("promotes only a publishable candidate and archives the previous snapshot", async () => {
  const root = await makeFixtureWorkspace();
  const result = await promoteCandidate({
    candidatePath: `${root}/candidate.json`,
    currentPath: `${root}/current.json`,
    runsDir: `${root}/runs`,
    monthlyIndexPath: `${root}/monthly/index.json`,
  });
  assert.equal(result.promoted, true);
  assert.equal(JSON.parse(await readFile(`${root}/current.json`, "utf8")).runId, "2026-08-01-saturday");
  assert.equal((await readdir(`${root}/runs`)).length, 1);
});

test("does not change current.json when the gate blocks", async () => {
  const root = await makeBlockedFixtureWorkspace();
  const before = await readFile(`${root}/current.json`, "utf8");
  await assert.rejects(() => promoteCandidate(pathsFor(root)), /manual approval required/);
  assert.equal(await readFile(`${root}/current.json`, "utf8"), before);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="promotes only|does not change"`
Expected: FAIL because `market-data/storage.ts` is absent.

- [ ] **Step 3: Implement atomic promotion and retention**

`validateCandidate` loads through the selected `SourceAdapter`, normalizes against current, checks source health, and passes those issues into the quality gate. Write candidate/current files through a sibling temporary filename, validate the written file, then rename it into place. Never remove a broad directory. `pruneRuns` deletes only files whose names match `^\d{4}-\d{2}-\d{2}-(wednesday|saturday)\.json$` and whose parsed date is older than 90 days. Monthly records are never pruned.

For `cadence: "month-end"`, append a complete archive record to `data/market/monthly/index.json`, keyed by `YYYY-MM`, and reject duplicate month keys.

`restoreCurrent` atomically restores `current.json` from the exact `archivedPath` returned by that promotion and removes only the monthly index entry whose `runId` matches the failed promotion. This gives the deployment layer a scoped rollback operation without accepting arbitrary delete targets.

- [ ] **Step 4: Add exact CLI commands**

```json
{
  "scripts": {
    "market:validate": "node --experimental-strip-types scripts/market-update.ts validate",
    "market:promote": "node --experimental-strip-types scripts/market-update.ts promote",
    "market:prune": "node --experimental-strip-types scripts/market-update.ts prune"
  }
}
```

`validate` prints JSON with `publishable` and `issues`; it exits `0` only when publishable. `promote` re-runs validation and refuses blocked candidates. `prune` prints the exact removed run filenames.

- [ ] **Step 5: Ignore only ephemeral inputs and deploy work**

```gitignore
/data/market/candidate.json
/data/market/runs/
/work/pages-candidate/
/work/pages-last-good/
/.superpowers/
```

Keep `data/market/current.json` and `data/market/monthly/index.json` tracked.

- [ ] **Step 6: Verify and commit**

Run: `npm run test:market && npm run market:validate -- --candidate tests/fixtures/market/valid-candidate.json`
Expected: all tests PASS and validation prints `"publishable": true`.

```bash
git add .gitignore package.json market-data/storage.ts scripts/market-update.ts tests/market-data/storage.test.ts
git commit -m "Add guarded snapshot promotion CLI"
```

---

### Task 5: Feed the Existing Dashboard from the Promoted Snapshot

**Files:**
- Create: `market-data/view-model.ts`
- Create: `app/components/EditionStatus.tsx`
- Create: `tests/market-data/view-model.test.ts`
- Modify: `app/content.ts`
- Modify: `app/content-zh.ts`
- Modify: `app/sources.ts`
- Modify: `app/components/MarketDashboard.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `data/market/current.json`, `KPI_CATALOG`.
- Produces: `getKpi(slug, index, locale)`, `getEditionMeta(locale)`, `getPageReport(slug, locale)`, `buildSourceBundles(snapshot)`, `EditionStatus`.

- [ ] **Step 1: Write failing view-model tests**

```ts
test("returns both locales from one metric record", () => {
  assert.deepEqual(getKpi("/", 0, "en"), {
    metricId: "pulse.infrastructure_spend",
    value: "$2.8T",
    sourceIds: ["atlas-model", "stanford-economy"],
  });
  assert.equal(getKpi("/", 0, "zh").metricId, "pulse.infrastructure_spend");
});

test("marks an unchanged page without replacing its thesis", () => {
  const meta = getPageMeta("/energy", "zh");
  assert.equal(meta.changeLabel, "本期無重大變化");
  assert.equal(meta.changed, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="returns both locales|marks an unchanged"`
Expected: FAIL because the view-model module is missing.

- [ ] **Step 3: Implement the view-model boundary**

```ts
export function getKpi(
  slug: PageSlug,
  index: number,
  locale: Locale,
): { metricId: string; value: string; sourceIds: string[] } {
  const catalog = KPI_CATALOG.find(
    ([page, kpiIndex]) => page === slug && kpiIndex === index,
  );
  if (!catalog) throw new Error(`No KPI mapping for ${slug} index ${index}`);
  const metric = currentSnapshot.metrics[catalog[2]];
  return {
    metricId: metric.id,
    value: metric.display[locale],
    sourceIds: metric.sourceIds,
  };
}
```

`buildSourceBundles` groups only sources referenced by a page, uses `retrievedAt` for `reviewed`, and maps KPI source IDs directly from the snapshot.

The server-side loader reads `process.env.MARKET_SNAPSHOT_PATH` when explicitly supplied for an isolated preview build; otherwise it reads tracked `data/market/current.json`. It resolves and validates the path before use, and client bundles receive only the validated public snapshot—not a filesystem path.

- [ ] **Step 4: Replace duplicated KPI values and weekly report copy**

Keep the existing `DashboardConfig` layout structure. Add `metricId` to each KPI and replace `value` and source mappings with `getKpi`. Do the same for equity price, week return, and month return fields through `stockMetricId`.

Move the weekly eyebrow, title, summary, signal, thesis, supporting/opposing evidence, catalysts, risks, and next-observation copy into `PageState.report`; render it with `getPageReport`. The scheduled agent writes both locales into the candidate, and the schema ensures that every evidence and `thesisMetricId` is sourced. Keep stable labels, table headers, navigation, deep-dive layouts, and unrelated CSS in the existing content modules.

- [ ] **Step 5: Add edition and no-change UI**

`EditionStatus` renders:

- localized cadence;
- `dataCutoff`;
- `verifiedAt`;
- `本期無重大變化` / `No material change` when `pages[slug].changed === false`;
- `等待更新` / `Awaiting update` beside stale values.

Replace the hard-coded July 2026 topbar status, issue label, source review date, footer edition, and prototype method note with current snapshot metadata. Preserve the not-investment-advice statement.

- [ ] **Step 6: Extend server-render tests**

Assert every route contains:

- current `runId`;
- localized cutoff label;
- a source anchor for each of four required KPI IDs;
- no “July 2026 illustrative dataset” copy after promotion;
- no-change label on the fixture page.

Run: `npm run test:market && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add market-data/view-model.ts app/content.ts app/content-zh.ts app/sources.ts app/components/EditionStatus.tsx app/components/MarketDashboard.tsx app/globals.css tests
git commit -m "Drive dashboard metrics from market snapshots"
```

---

### Task 6: Public Monthly Archive

**Files:**
- Create: `market-data/monthly.ts`
- Create: `app/components/ArchiveReport.tsx`
- Create: `app/archive/page.tsx`
- Create: `app/archive/[month]/page.tsx`
- Create: `tests/market-data/monthly.test.ts`
- Modify: `app/components/MarketDashboard.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `data/market/monthly/index.json`.
- Produces: `MonthlyArchive`, `listMonthlyArchives()`, `getMonthlyArchive(month): MonthlyArchive | undefined`, archive index and detail routes.

```ts
export type MonthlyArchive = {
  month: string;
  runId: string;
  dataCutoff: string;
  summary: BilingualText;
  basketChange: MetricRecord;
  equityChanges: MetricRecord[];
  thesisChanges: Array<{
    page: PageSlug;
    from: ThesisStance;
    to: ThesisStance;
    explanation: BilingualText;
    metricIds: string[];
  }>;
  catalysts: BilingualText[];
  risks: BilingualText[];
  sourceIds: string[];
};
```

- [ ] **Step 1: Write failing archive lookup tests**

```ts
test("returns a permanent YYYY-MM archive", () => {
  const archive = getMonthlyArchive("2026-07");
  assert.ok(archive);
  assert.equal(archive.month, "2026-07");
  assert.ok(archive.sourceIds.length > 0);
});

test("rejects an invalid month path", () => {
  assert.throws(() => getMonthlyArchive("../2026-07"), /Invalid archive month/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="archive"`
Expected: FAIL because `market-data/monthly.ts` is absent.

- [ ] **Step 3: Implement archive lookup and route generation**

```ts
export function getMonthlyArchive(month: string): MonthlyArchive | undefined {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Invalid archive month: ${month}`);
  }
  return archiveIndex.find((item) => item.month === month);
}

export function generateStaticParams() {
  return listMonthlyArchives().map(({ month }) => ({ month }));
}
```

The route calls `notFound()` when `getMonthlyArchive(params.month)` returns `undefined`; the domain helper stays framework-independent.

- [ ] **Step 4: Build the bilingual archive presentation**

`ArchiveReport` displays monthly summary, basket/equity monthly changes, thesis changes, catalysts, risks, and the permanent source list. Add an Archive link to the dashboard footer without crowding the primary six-route navigation.

- [ ] **Step 5: Test rendered archive routes**

Add `/archive` and `/archive/2026-07` to the rendered worker tests and assert both Chinese copy and source links.

Run: `npm run test:market && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add market-data/monthly.ts app/archive app/components/ArchiveReport.tsx app/components/MarketDashboard.tsx app/globals.css tests
git commit -m "Add monthly AI market archives"
```

---

### Task 7: Snapshot-Driven HyperFrames Brief

**Files:**
- Create: `scripts/generate-market-brief.ts`
- Create: `tests/market-data/market-brief.test.ts`
- Create: `hyperframes/weekly-ai-market-brief/data.json`
- Create: `public/market-brief/data.json`
- Modify: `hyperframes/weekly-ai-market-brief/index.html`
- Modify: `public/market-brief/index.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: promoted `MarketSnapshot.keySignalIds` and referenced metrics/sources.
- Produces: `MarketBriefPayload`, `buildMarketBrief(snapshot): MarketBriefPayload`, `generateMarketBriefAssets(paths): Promise<void>`, identical canonical and public `data.json`, plus synchronized HTML.

The CLI defaults to `data/market/current.json` for manual regeneration and accepts `--snapshot <validated-path>` for preview generation before promotion.

- [ ] **Step 1: Write a failing generator test**

```ts
test("generates one bilingual brief from the promoted snapshot", async () => {
  const brief = buildMarketBrief(currentSnapshot);
  assert.equal(brief.runId, currentSnapshot.runId);
  assert.equal(brief.signals.length, currentSnapshot.keySignalIds.length);
  assert.ok(brief.signals.every((signal) => signal.zh && signal.en));
});

test("keeps canonical and public HyperFrames assets synchronized", async () => {
  await generateMarketBriefAssets(fixturePaths);
  assert.equal(
    await readFile(fixturePaths.canonicalData, "utf8"),
    await readFile(fixturePaths.publicData, "utf8"),
  );
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="brief|HyperFrames"`
Expected: FAIL because the generator is missing.

- [ ] **Step 3: Implement deterministic brief generation**

The generated payload contains `runId`, `cadence`, `dataCutoff`, source IDs, bilingual labels, methodology copy for modeled values, and `notInvestmentAdvice`. It contains 3–5 signals on Wednesday and 5–8 signals plus next-week observations on Saturday or month-end. Wednesday generation reuses the existing full brief when no key signal changed; Saturday and month-end produce the complete 30-second brief.

- [ ] **Step 4: Make HyperFrames load `data.json` safely**

Add `loadBrief()` to the canonical HTML. It fetches relative `data.json`, verifies `runId` and bilingual signals, and falls back to the last embedded valid brief if the request fails. Keep playback, replay, embedded query parameters, and reduced-motion behavior unchanged.

- [ ] **Step 5: Add generation commands and validate**

```json
{
  "scripts": {
    "market:brief": "node --experimental-strip-types scripts/generate-market-brief.ts",
    "check:hyperframes": "npm --prefix hyperframes/weekly-ai-market-brief run check"
  }
}
```

Run: `npm run market:brief && npm run check:hyperframes && npm run test:market && npm test`
Expected: all commands PASS and canonical/public HTML and JSON are byte-identical.

The HyperFrames check must also exercise 390px mobile layout, desktop layout, replay, both locales, and `prefers-reduced-motion`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-market-brief.ts hyperframes/weekly-ai-market-brief public/market-brief package.json tests/market-data/market-brief.test.ts
git commit -m "Generate HyperFrames brief from market snapshots"
```

---

### Task 8: Static Export, Verification, and Last-Known-Good Restore

**Files:**
- Create: `market-data/deployment.ts`
- Create: `scripts/export-pages.ts`
- Create: `scripts/deploy-pages.ts`
- Create: `tests/market-data/deployment-helpers.ts`
- Create: `tests/market-data/deployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: built Vinext worker, current archive index, Cloudflare project `ai-market-atlas`.
- Produces: `exportPages(options)`, `verifyDeployment(baseUrl, routes)`, `publishWithRestore(deps)`.

```ts
export type PublishDependencies = {
  deploy(directory: string, branch: string): Promise<string>;
  verify(baseUrl: string, routes: string[]): Promise<void>;
  copyDirectory(from: string, to: string): Promise<void>;
  promote(): Promise<PromotionResult>;
  restoreSnapshot(promotion: PromotionResult): Promise<void>;
};
```

- [ ] **Step 1: Write a failing restoration test**

```ts
test("redeploys last-known-good assets when production verification fails", async () => {
  const deployments: Array<{ directory: string; branch: string }> = [];
  const deps = fakeDependencies({
    onDeploy: (directory, branch) => deployments.push({ directory, branch }),
    verificationResults: [undefined, new Error("missing source marker"), undefined],
  });
  await assert.rejects(() => publishWithRestore(deps, publishOptions));
  assert.deepEqual(deployments, [
    { directory: "work/pages-candidate", branch: "market-update-2026-08-01-saturday" },
    { directory: "work/pages-candidate", branch: "main" },
    { directory: "work/pages-last-good", branch: "main" },
  ]);
  assert.equal(deps.snapshotRestored, true);
});
```

`tests/market-data/deployment-helpers.ts` exports the typed `fakeDependencies` and `publishOptions` used above; it records deployments, queues verification outcomes, and performs no network or filesystem writes.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="last-known-good"`
Expected: FAIL because the deployment module is absent.

- [ ] **Step 3: Implement static export without a development server**

`export-pages.ts` builds with `MARKET_SNAPSHOT_PATH` set to the validated candidate, imports `dist/server/index.js`, renders `/`, the six topic routes, `/archive`, every archive detail route, and copies `dist/client` assets. It passes `x-forwarded-host: aimarket.tycreation.online` and `x-forwarded-proto: https` so Open Graph URLs are correct.

- [ ] **Step 4: Implement verification**

For every route, require HTTP 200 after redirects and assert:

- current `runId`;
- localized data-cutoff copy;
- `source-atlas-model` or another required source marker;
- archive month on archive routes;
- `AI MARKET ATLAS` in `/market-brief/`.

Retry only temporary network failures, at most twice. A content mismatch fails immediately.

- [ ] **Step 5: Implement publish and restore**

Before the first automated publication, seed `work/pages-last-good` from a verified export of the current production version. Deploy the candidate first to Cloudflare branch `market-update-<runId>` and verify the returned preview URL. Only then promote the snapshot and deploy the same assets to `main`. On each successful production verification, replace last-known-good assets with the verified candidate.

If production deployment or verification fails, atomically restore `current.json` with `restoreCurrent`, deploy `work/pages-last-good` to `main`, verify it, and return an error describing candidate failure, snapshot restoration, and site restoration. A preview failure never promotes or touches production.

Use:

```ts
await runCommand("npx", [
  "wrangler",
  "pages",
  "deploy",
  directory,
  "--project-name",
  "ai-market-atlas",
  "--branch",
  branch,
]);
```

- [ ] **Step 6: Add scripts and run dry export**

```json
{
  "scripts": {
    "market:export": "node --experimental-strip-types scripts/export-pages.ts",
    "market:deploy": "node --experimental-strip-types scripts/deploy-pages.ts"
  }
}
```

Run: `npm run build && npm run market:export`
Expected: `work/pages-candidate` contains every route and asset, with no localhost metadata.

Run: `npm run test:market && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add market-data/deployment.ts scripts/export-pages.ts scripts/deploy-pages.ts package.json tests/market-data/deployment.test.ts
git commit -m "Add recoverable Cloudflare Pages publishing"
```

---

### Task 9: Automation Contract, End-to-End Checks, and Handoff

**Files:**
- Create: `market-data/pipeline.ts`
- Create: `docs/automation/weekly-market-update-prompt.md`
- Create: `tests/market-data/end-to-end.test.ts`
- Modify: `README.md`
- Modify: `tests/rendered-html.test.mjs`
- Update externally: Codex automation `AI 市場週三／週六更新`

**Interfaces:**
- Consumes: every command and gate from Tasks 1–8.
- Produces: `runFixturePipeline(candidatePath): Promise<FixturePipelineResult>`, one source-controlled automation contract, and a verified scheduled workflow.

`market-data/pipeline.ts` composes injected storage, brief, test/build/export, and deployment dependencies. Its fixture mode always writes to an isolated temporary workspace and sets `deploymentAttempted: false`; production deployment remains available only through `scripts/deploy-pages.ts`.

- [ ] **Step 1: Write a failing end-to-end dry-run test**

```ts
test("validates, promotes, generates, builds, and exports a Saturday fixture", async () => {
  const result = await runFixturePipeline("tests/fixtures/market/valid-candidate.json");
  assert.equal(result.gate.publishable, true);
  assert.equal(result.promotedRunId, "2026-08-01-saturday");
  assert.ok(result.exportedRoutes.includes("/stocks"));
  assert.ok(result.exportedRoutes.includes("/archive/2026-07"));
});

test("stops before promotion when a fixture requires approval", async () => {
  const result = await runFixturePipeline("tests/fixtures/market/conflicting-prices.json");
  assert.equal(result.gate.publishable, false);
  assert.equal(result.promotedRunId, undefined);
  assert.equal(result.deploymentAttempted, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:market -- --test-name-pattern="fixture"`
Expected: FAIL because the end-to-end harness is missing.

- [ ] **Step 3: Write the exact automation contract**

The prompt must direct the scheduled agent to:

1. determine Wednesday, Saturday, or final-Saturday cadence;
2. research first-party and free public sources;
3. write only `data/market/candidate.json`, including both report locales and per-source observations;
4. run `npm run market:validate`;
5. stop and report all gate issues when blocked;
6. run `npm run market:brief -- --snapshot data/market/candidate.json`, `npm run test:market`, `npm test`, `npm run build`, and `npm run market:export -- --snapshot data/market/candidate.json` when publishable;
7. run `npm run market:deploy`, which verifies a preview, promotes, publishes production, verifies production, and restores both snapshot and site on failure;
8. run `npm run market:prune` only after successful production verification;
9. report cutoff, changed/unchanged pages, sources, issues, preview, tests, deployment, restoration state, and next observations;
10. never invent missing data, bypass a failed gate, or include credentials/private source details in the report.

- [ ] **Step 4: Update the existing automation**

Discover and use the app’s `automation_update` tool to update automation ID `ai`, preserve its active Wednesday/Saturday 09:00 Asia/Taipei schedule, and replace its prompt with the source-controlled contract. Read it back after the update. Do not create a second automation.

- [ ] **Step 5: Document operator commands**

Update `README.md` with:

- candidate format and source policy;
- local validation and blocked-run interpretation;
- promotion and 90-day retention;
- monthly archive rule;
- preview/export;
- production deployment and restoration;
- future paid-adapter boundary.

- [ ] **Step 6: Run the full verification matrix**

Run:

```bash
npm run market:seed
npm run market:validate -- --candidate tests/fixtures/market/valid-candidate.json
npm run test:market
npm run market:brief -- --snapshot tests/fixtures/market/valid-candidate.json
npm run check:hyperframes
npm test
npm run market:export -- --snapshot tests/fixtures/market/valid-candidate.json
```

Expected: every command exits 0; blocked fixtures remain blocked in their tests; export contains all current and archive routes.

- [ ] **Step 7: Perform one guarded production rehearsal**

Create a candidate that reproduces the current public values with refreshed timestamps, validate it, and run `npm run market:deploy`. Verify `https://aimarket.tycreation.online/`, all six topic routes, `/archive`, the seeded archive route, and `/market-brief/`.

If any production check fails, verify that the last-known-good site is restored before ending the task.

- [ ] **Step 8: Commit**

```bash
git add README.md market-data/pipeline.ts docs/automation/weekly-market-update-prompt.md tests/market-data/end-to-end.test.ts tests/rendered-html.test.mjs
git commit -m "Document and verify weekly market automation"
```

## Final Acceptance Checklist

- [ ] Wednesday cadence changes only pages with material evidence and reports 3–5 signals.
- [ ] Saturday cadence checks all six pages and reports 5–8 signals plus next-week observations.
- [ ] Final-Saturday cadence creates exactly one permanent `/archive/YYYY-MM` record.
- [ ] Every required public number resolves to a source or explicitly documented Atlas method.
- [ ] Free-source failures keep last verified values and never invent replacements.
- [ ] Every approved gate rule blocks promotion and deployment.
- [ ] English and Chinese use the same numeric record.
- [ ] HyperFrames HTML/data canonical and public copies remain synchronized.
- [ ] Static export includes current routes and every monthly archive.
- [ ] Production verification can restore last-known-good assets.
- [ ] The existing single automation remains active at the approved cadence.
