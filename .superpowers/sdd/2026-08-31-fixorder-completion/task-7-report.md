# Task 7 Report

Date: 2026-09-01

## Summary

- Completed deterministic entity hub generation from retained metric taxonomy evidence in `market-data/entity-pages.ts`.
- Added bilingual entity routes and page rendering for `/entity/[slug]/` and `/en/entity/[slug]/`, backed by `EntityHubPage`.
- Extended export/deployment verification so entity routes are emitted, carried in the deployment manifest, checked in sitemap lastmod output, and fail closed when an entity page or identity is missing.
- Normalized structured-data URLs to the same trailing-slash canonical form used by page metadata.

## Verification

- Focused red/green cycle:
  - Initial failing coverage showed export omitted entity routes and deployment verification treated entity pages like current dashboards.
  - After implementation, `npm test -- tests/rendered-html.test.mjs tests/market-data/entity-pages.test.ts tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts` passed with 96/96 tests.
- Required broader commands:
  - `npm run test:market` passed with 349/349 tests.
  - `npm run test` passed with 21/21 tests.

## Self-review

- Confirmed retained entity set is deterministic and currently yields 29 bilingual hubs, meeting the “roughly 20 per locale” target without invented slugs.
- Confirmed export now includes entity pages in `routes`, `routeIdentities`, `sitemap.xml`, and invalid entity slugs return HTTP 404 during export verification.
- No remaining functional concerns found in the staged Task 7 diff.

## September 1, 2026 follow-up fix: corpus-driven discovery completeness

### RED

- `npm test -- tests/rendered-html.test.mjs tests/market-data/entity-pages.test.ts tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts`
  - failed because `market-data/entity-pages.ts` did not export `discoverEligibleEntityRecords`
  - failed because `/entity/sharon-ai` rendered HTTP 404
- First implementation pass of the same command exposed two additional gaps:
  - false-positive slug `frontier`
  - `/entity/announced-power/` export 404 from compound-slug normalization

### GREEN

- Replaced the curated entity allowlist with deterministic discovery from report-referenced metric IDs, source IDs, and source publisher/title identifiers.
- Added a separate export completeness contract so every discovered eligible entity must produce both locale routes, `entity-detail` identities, and sitemap lastmod entries.
- Hand-checked retained eligible corpus snapshot now pinned by test coverage to 29 slugs, including `tsmc`, `vistra`, and `sharon-ai`, while rejecting thin or boilerplate candidates such as `gemini`, `stanford`, `2026`, and `results`.
- `npm test -- tests/rendered-html.test.mjs tests/market-data/entity-pages.test.ts tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts` → 98/98 passing
- `npm run test:market` → 351/351 passing
- `npm test` → 21/21 passing

### Follow-up self-review

- Entity evidence now counts dated brief coverage plus cited source references, which keeps the floor explicit while allowing same-source multi-brief entities such as Sharon AI to remain evidence-bound.
- Source-derived company entities are corroborated through retained source identifiers/publishers instead of a hand-maintained inventory; locale routes, canonicals, hreflang, robots, structured data, and 404 behavior remained intact in verification.
- No open functional concerns found after the final September 1, 2026 verification runs.
