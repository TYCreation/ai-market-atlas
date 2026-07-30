# Task 6: Public Monthly Archive — Report

## Status

Complete. The public archive index and permanent July 2026 detail route render from the tracked monthly snapshot data, with bilingual presentation and retained source provenance.

## Files

- Created `market-data/monthly.ts`, `app/archive/page.tsx`, `app/archive/[month]/page.tsx`, `app/components/ArchiveReport.tsx`, and `tests/market-data/monthly.test.ts`.
- Updated `data/market/monthly/index.json` with a complete deterministic `2026-07` record copied from the approved `current.json` snapshot.
- Updated `app/components/MarketDashboard.tsx`, `app/globals.css`, and `tests/rendered-html.test.mjs`.

## Commit

`Add monthly AI market archives`

## RED / GREEN evidence

- RED: `npm run test:market -- --test-name-pattern='archive'` failed as expected with `ERR_MODULE_NOT_FOUND` for `market-data/monthly.ts`.
- GREEN lookup: the same command passed after the archive view and permanent July snapshot were added: `tests 89`, `pass 89`, `fail 0`.
- RED routes: `npm test` initially returned `404 !== 200` for `/archive` and `/archive/2026-07`.
- GREEN routes: `npm test` passed after adding the archive routes and report: `tests 8`, `pass 8`, `fail 0`.

## Verification outputs

- `npm run test:market` — exit 0; `tests 89`, `pass 89`, `fail 0`.
- `npm test` — exit 0; build completed and rendered-route tests reported `tests 8`, `pass 8`, `fail 0`.
- `npm run lint` — exit 0; no lint findings.
- `git diff --check` — exit 0.
- `jq -e '."2026-07" == input' data/market/monthly/index.json data/market/current.json` — exit 0, confirming the seed is an exact approved structured snapshot rather than invented market data.

## Self-review

- The monthly index remains compatible with Task 4: it is a `Record<YYYY-MM, MarketSnapshot>`. The new domain module validates each permanent snapshot then derives the requested `MonthlyArchive` shape.
- Archive month validation stays framework-independent. Only the `[month]` route translates invalid or absent data to `notFound()`.
- `generateStaticParams()` is built from the tracked archive index.
- Detail pages render the data cutoff, monthly basket and equity changes, thesis changes, catalysts, risks, and permanent source records. Source links use the retained per-snapshot URLs.
- The dashboard’s archive link is in the footer, outside the six-route primary navigation.

## Concerns

- `npx tsc --noEmit` is not a project verification command and currently fails on existing repository-wide configuration/type issues (notably `.ts` extension imports without `allowImportingTsExtensions`, Cloudflare worker globals, and existing `MarketDashboard` locale typing). Build, market tests, rendered tests, and lint all pass.

---

## Review Fix Round 1

### Status

Complete. The archive reader and writer now share `MonthlyArchiveRecord` from `market-data/monthly-record.ts`, re-exported by `market-data/storage.ts`. The record includes immutable complete source records and either the approved `AutomatedReview` for new month-end promotions or an explicit typed legacy migration provenance.

### RED / GREEN evidence

- RED: `npm run test:market -- --test-name-pattern='month-end promotion|archive'` failed because `parseMonthlyArchiveIndex` was not exported by `market-data/monthly.ts`.
- GREEN: after the record-contract refactor, the same command passed: `tests 90`, `pass 90`, `fail 0`. The new compatibility test promotes a month-end candidate into a temporary index, parses that actual record shape, and verifies NVIDIA’s immutable source record plus the approved automated review provenance.

### Verification outputs

- `npm run test:market` — exit 0; `tests 90`, `pass 90`, `fail 0`.
- `npm test` — exit 0; build completed and rendered-route tests reported `tests 8`, `pass 8`, `fail 0`.
- `npm run lint` — exit 0; no lint findings.

### Self-review

- The public reader no longer dereferences `pages`, `metrics`, or `sources` from a snapshot. It parses only persisted `MonthlyArchiveRecord` fields.
- Future promotions retain the exact auto-publish review already validated before publication and write a sorted, cloned source-record list alongside `sourceIds`.
- The `2026-07` seed keeps its market facts exactly derived from `current.json`, but declares `legacy-migration` / `approved-current-snapshot` provenance instead of inventing an automated review.
- Archive routes retain their existing domain validation and route-layer `notFound()` behavior.

### Concerns

- The existing repository-wide `npx tsc --noEmit` configuration/type failures remain outside the requested verification surface; required market tests, rendered tests/build, and lint pass.

---

## Review Fix Round 2

### Status

Complete. Archived source records now use the same complete validation exported by `market-data/schema.ts`. Archived automated reviews use the self-contained integrity validator exported by `market-data/review.ts`; it verifies only facts retained by the archive, without claiming to recompute the original candidate hash.

### RED / GREEN evidence

- RED: `npm run test:market -- --test-name-pattern='forged automated review|month-end promotion'` failed with `Missing expected exception.` because the parser accepted incomplete sources and forged review data.
- GREEN: the same focused market command passed after validation hardening. Negative cases cover missing source timestamps, a secret-bearing URL, a wrong review run ID, empty checks, failed checks, and malformed hash/review IDs. Normal auto-publish and typed legacy records still parse.

### Verification outputs

- Focused monthly/storage tests — exit 0; `tests 91`, `pass 91`, `fail 0`.
- `npm run test:market` — exit 0; `tests 91`, `pass 91`, `fail 0`.
- `npm test` — exit 0; build completed and rendered-route tests reported `tests 8`, `pass 8`, `fail 0`.
- `npm run lint` — exit 0; no lint findings.

### Self-review

- `assertSourceRecord` is exported from the snapshot schema and checks source ID, allowed kind, publisher/title, safe optional public URL, valid timestamps, and bilingual scope. The archive reader therefore cannot supply missing source fields to `ArchiveReport`.
- `assertArchivedAutoPublishReview` requires a safe matching run ID, SHA-256-shaped candidate hash, canonical review ID, auto-publish decision, valid timestamp, positive safe counts, the full required check set with only pass/warn statuses, consistent issue codes, sorted deterministic warning-only issues, and no block severity.
- The archive validator does not recompute a candidate hash from a distilled record; it validates all review invariants that are still self-contained.

### Concerns

- The existing repository-wide `npx tsc --noEmit` configuration/type failures remain outside the requested verification surface; all required checks pass.
