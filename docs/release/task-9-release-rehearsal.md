# Task 9 release rehearsal checklist

Run this checklist from the repository root before the final production release checkpoint. It validates the generated site and the publication/deployment contracts without publishing or mutating Cloudflare.

## Local rehearsal

- [x] `node --test tests/lint-generated-artifacts.test.mjs` — 1/1 passed.
- [x] `npm run lint` — 0 errors; two existing unused-variable warnings in `market-data/freshness.ts` and `market-data/storage.ts`.
- [x] `npm run test:market` — 365/365 passed, including market-data, export, deployment, browser market-brief, discovery-feed, newsletter, and fixture pipeline coverage.
- [x] `npm run test:readability` — 1/1 passed.
- [x] `npm run test` — 21/21 passed.
- [x] Focused release tests: `node --experimental-strip-types --test tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts tests/market-data/deploy-pages.test.ts tests/market-data/end-to-end.test.ts` — 100/100 passed.
- [x] `npm run market:export` — local export passed for the current published fixture (`2026-08-08-saturday`), producing 81 routes and `/rss.xml`, `/news-sitemap.xml`, and `/llms.txt`.
- [x] `npm run market:release:verify -- --base-url <base-url> --manifest work/pages-candidate/.market-deployment.json --expected-manifest-sha256 <reviewed-manifest-sha256>` — executable fail-closed endpoint checklist. It loads the manifest only through the trusted deployment-manifest validator, then verifies real 404, unique trailing-slash canonicals/hreflang (including `x-default`), exact sitemap route+`lastmod` parity, market-brief noindex and `data.json` identity, dated brief/entity identities, discovery content types, and newsletter mode (`--newsletter=enabled` when configured; disabled is the default).
- [ ] `npm run market:pages:rehearse` — BLOCKED in this environment: the real Pages runtime exits before readiness with `No such module "wrangler:modules-watch"` (or Wrangler's generated middleware facade). The command is fail-closed and does not substitute a static server.

The exported manifest must continue to bind route HTML to the run/cutoff/source identity, keep all canonical and alternate URLs trailing-slash normalized, and retain historical sitemap `lastmod` values. The market brief remains a noindex presentation artifact and is excluded from `sitemap.xml`; RSS contains permanent dated briefs, while the news sitemap is limited to the explicit recent-publication window.

For local rehearsal, `npm run market:pages:rehearse` computes a hash from the
local `work/pages-candidate/.market-deployment.json` only to prove the exact
artifact under rehearsal. Preview and production must instead pass the reviewed
manifest SHA-256 recorded at approval time; do not recompute a fresh hash on the
target environment and treat it as review authorization.

## Production-only release checkpoint

These checks require release authority and must be completed separately. They were intentionally not run in Task 9:

- [ ] Confirm the reviewed branch and candidate/review hashes at the scheduled runtime checkout.
- [ ] Record the reviewed manifest SHA-256 from the approved export and pass that exact value to every `market:release:verify` invocation.
- [ ] Deploy the candidate to its hash-authorized preview branch with the fixed Wrangler argument vector.
- [ ] Run deployment verification against the real preview URL, including route identities, real 404 behavior, trailing-slash canonicals/hreflang, historical sitemap lastmods, all discovery artifact content types, market-brief `data.json` identity, and newsletter disabled/configured behavior.
- [ ] Obtain the explicit production release approval, deploy `main`, wait for propagation, and run production verification.
- [ ] Confirm rollback/last-good anchor state and record the production deployment URL, commit, candidate hash, artifact-tree hash, and manifest hash.

Do not push, merge, or deploy as part of this checklist's local rehearsal.

## Environment note

`npm run market:pages:rehearse` runs `npx wrangler pages dev work/pages-candidate --local --port <free-port> --show-interactive-dev-session=false`, exercises the generated `_worker.js` with real `env.ASSETS`, redirects, discovery headers, 404 behavior, and then runs the endpoint checklist. It requires `npm ci`, the repository-pinned Wrangler/workerd runtime, `dist/server/wrangler.json`, and `work/pages-candidate`. In this checkout Wrangler 4.118.0 injected `wrangler:modules-watch` that workerd could not resolve; newer Wrangler 4.127.1 instead failed on its generated middleware facade. The gate remains unchecked until a runtime with those modules starts successfully.
