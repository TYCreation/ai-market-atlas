# Task 9 release rehearsal checklist

Run this checklist from the repository root before the final production release checkpoint. It validates the generated site and the publication/deployment contracts without publishing or mutating Cloudflare.

## Local rehearsal

- [x] `node --test tests/lint-generated-artifacts.test.mjs` — 1/1 passed.
- [x] `npm run lint` — 0 errors; two existing unused-variable warnings in `market-data/freshness.ts` and `market-data/storage.ts`.
- [x] `npm run test:market` — 364/364 passed, including market-data, export, deployment, browser market-brief, discovery-feed, newsletter, and fixture pipeline coverage.
- [x] `npm run test:readability` — 1/1 passed.
- [x] `npm run test` — 21/21 passed.
- [x] Focused release tests: `node --experimental-strip-types --test tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts tests/market-data/deploy-pages.test.ts tests/market-data/end-to-end.test.ts` — 100/100 passed.
- [x] `npm run market:export` — local export passed for the current published fixture (`2026-08-08-saturday`), producing 81 routes and `/rss.xml`, `/news-sitemap.xml`, and `/llms.txt`.
- [x] Local HTTP deployment verification — `verifyDeployment` passed against the exported tree; unknown route returned HTTP 404; `/market-brief/` was noindex; dated brief and entity identity routes returned 200 with alternate hreflang links.

The exported manifest must continue to bind route HTML to the run/cutoff/source identity, keep all canonical and alternate URLs trailing-slash normalized, and retain historical sitemap `lastmod` values. The market brief remains a noindex presentation artifact and is excluded from `sitemap.xml`; RSS contains permanent dated briefs, while the news sitemap is limited to the explicit recent-publication window.

## Production-only release checkpoint

These checks require release authority and must be completed separately. They were intentionally not run in Task 9:

- [ ] Confirm the reviewed branch and candidate/review hashes at the scheduled runtime checkout.
- [ ] Deploy the candidate to its hash-authorized preview branch with the fixed Wrangler argument vector.
- [ ] Run deployment verification against the real preview URL, including route identities, real 404 behavior, trailing-slash canonicals/hreflang, historical sitemap lastmods, all discovery artifact content types, market-brief `data.json` identity, and newsletter disabled/configured behavior.
- [ ] Obtain the explicit production release approval, deploy `main`, wait for propagation, and run production verification.
- [ ] Confirm rollback/last-good anchor state and record the production deployment URL, commit, candidate hash, artifact-tree hash, and manifest hash.

Do not push, merge, or deploy as part of this checklist's local rehearsal.

## Environment note

`npx wrangler pages dev work/pages-candidate --local --port 8788` could not start in this environment because the generated worker requested Wrangler's unavailable `wrangler:modules-watch` module. The local HTTP server plus `verifyDeployment` rehearsal above exercises the exported artifact and deployment verifier without requiring that optional Wrangler dev runtime. Re-run the Pages runtime check in the release environment before production approval.
