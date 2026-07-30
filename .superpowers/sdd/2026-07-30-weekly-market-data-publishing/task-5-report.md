# Task 5 Report: Feed the Existing Dashboard from the Promoted Snapshot

## Status

Complete. All six bilingual routes now receive validated snapshot-derived KPIs, equity metrics, page reports, source bundles, and edition metadata through a server component boundary. The client receives public snapshot values only; neither `MARKET_SNAPSHOT_PATH` nor its resolved filesystem path is serialized into client assets.

## Commit

- Message: `Drive dashboard metrics from market snapshots`
- Commit: this task commit (final hash reported to the parent task after creation)

## Files

- Created `market-data/view-model.ts`
- Created `app/components/EditionStatus.tsx`
- Created `app/components/MarketDashboardPage.tsx`
- Created `tests/market-data/view-model.test.ts`
- Modified `app/content.ts`
- Modified `app/content-zh.ts`
- Modified `app/sources.ts`
- Modified `app/components/MarketDashboard.tsx`
- Modified `app/components/EquityMarketDeepDive.tsx`
- Modified `app/components/SourcePanel.tsx`
- Modified `app/components/WeeklyMarketBrief.tsx`
- Modified `app/globals.css`
- Modified all six route entrypoints under `app/`
- Modified `tests/rendered-html.test.mjs`
- Modified `vite.config.ts`
- Modified `package.json`

## RED evidence

Command:

`npm run test:market -- --test-name-pattern="returns both locales|marks an unchanged"`

Result: exit 1. Node reported `ERR_MODULE_NOT_FOUND` for `market-data/view-model.ts`; the suite summary was 82 passed, 1 failed. This was the expected feature-missing failure before production code existed.

## GREEN evidence

Focused view-model command:

`npm run test:market -- --test-name-pattern="returns both locales|marks an unchanged|builds each page|loads and validates"`

Result: exit 0; all four new view-model behaviors passed.

Preview build proof:

`MARKET_SNAPSHOT_PATH=tests/fixtures/market/valid-candidate.json npm run build`

Then the built worker rendered `/` with status 200, contained `2026-08-01-saturday`, and did not contain the tracked snapshot run `2026-07-25-saturday`.

Final verification:

- `npm run test:market` — exit 0; 86 tests passed, 0 failed.
- `npm test` — exit 0; Vinext build completed and 6 server-render route tests passed, 0 failed.
- `npm run lint` — exit 0; no warnings or errors.
- `git diff --check` — exit 0.
- Client bundle path scan — clean; no preview environment variable, fixture path, or resolved snapshot path appeared in `dist/client`.

## Self-review

- Matched the public `getKpi` return contract exactly: `metricId`, localized `value`, and snapshot `sourceIds`.
- Preserved the six routes, bilingual switch, stable labels and layouts, source panel, HyperFrames brief, and investment-advice disclaimers.
- Replaced the previous state-setting locale effect with `useSyncExternalStore`, resolving the in-scope React lint finding without changing local-storage persistence.
- Confirmed KPI values and stock price/week/month fields are hydrated through the snapshot view model and `stockMetricId`.
- Confirmed report headline, summary, signal, thesis, risks, next observations, and conditional evidence/catalyst sections come from `PageState.report`.
- Confirmed source bundles include only sources referenced by page metrics, KPI mappings use snapshot source IDs directly, and review metadata derives from `retrievedAt`.
- Confirmed cadence, cutoff, verification time, run ID, no-change state, and waiting metric state are localized and rendered.
- Confirmed `MARKET_SNAPSHOT_PATH` is realpath-resolved, regular-file checked, parsed as untrusted JSON, schema-validated, and selected at build time so Cloudflare runtime does not depend on a local filesystem.

## Concerns

None blocking. Vinext continues to print its existing “Unknown” route classification advisory during build, but the build exits 0 and every route is exercised successfully through the generated worker.
