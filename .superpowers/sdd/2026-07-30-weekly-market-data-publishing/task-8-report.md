# Task 8 Report: Static Export, Verification, and Last-Known-Good Restore

## Status

Complete and committed as `ce610dc Add recoverable Cloudflare Pages publishing`.

No Cloudflare, Sites, or other external deployment was performed. The work stopped at a verified local static export as required.

## Files

- Created `market-data/deployment.ts`.
- Created `scripts/export-pages.ts`.
- Created `scripts/deploy-pages.ts`.
- Created `tests/market-data/deployment-helpers.ts`.
- Created `tests/market-data/deployment.test.ts`.
- Created `tests/market-data/deploy-pages.test.ts`.
- Created `tests/market-data/export-pages.test.ts`.
- Updated `package.json` with `market:export` and `market:deploy`.

## TDD evidence

Initial restoration RED:

```sh
npm run test:market -- --test-name-pattern="last-known-good"
```

Exited 1 with `ERR_MODULE_NOT_FOUND` for `market-data/deployment.ts`, the expected missing-module failure.

Verification RED:

```sh
node --experimental-strip-types --test --test-name-pattern='verification' tests/market-data/deployment.test.ts
```

Failed because `verifyDeployment` was not exported. The focused deployment suite then passed after implementing final-200, redirect, marker, and retry behavior.

Exporter RED:

```sh
node --experimental-strip-types --test tests/market-data/export-pages.test.ts
```

Failed with `ERR_MODULE_NOT_FOUND` for `scripts/export-pages.ts`. The integration test then passed against the built Vinext worker and real tracked market snapshot.

Deploy-wrapper RED:

```sh
node --experimental-strip-types --test tests/market-data/deploy-pages.test.ts
```

Failed with `ERR_MODULE_NOT_FOUND` for `scripts/deploy-pages.ts`. The focused suite passed after implementing the fixed Wrangler argument vector, path/branch validation, and atomic last-good copy.

Final focused GREEN:

```sh
node --experimental-strip-types --test tests/market-data/deploy-pages.test.ts tests/market-data/export-pages.test.ts tests/market-data/deployment.test.ts
```

Output: `tests 25`, `pass 25`, `fail 0`.

## Fresh verification

```sh
npm run test:market
```

Output: `tests 172`, `pass 172`, `fail 0`.

```sh
npm test
```

Output: production Vinext build completed; rendered-route tests `8/8` passed.

```sh
npm run lint
```

Output: exit 0 with no findings.

```sh
npm run build && npm run market:export
```

Both builds and the local export completed. The exporter produced these nine publication routes:

```text
/
/stocks
/compute
/energy
/models
/sic
/archive
/archive/2026-07
/market-brief/
```

The final inspection confirmed every route HTML file, `market-brief/data.json`, public assets, and `.market-deployment.json`; no symlink was present; rendered HTML contained no `localhost` or `127.0.0.1` metadata; and the manifest carried the exact run ID, cutoff, archive month, current source IDs, and per-archive source IDs.

`git diff --check` was clean before commit.

## Self-review

- The exporter validates a direct `data/market/current.json` or `candidate.json` regular file, builds with `MARKET_SNAPSHOT_PATH`, imports `dist/server/index.js`, and never starts a development server.
- Vinext rendering receives `https://aimarket.tycreation.online` requests plus the forwarded host and protocol headers. The complete client tree and market-brief public assets are copied to a sibling temporary directory and atomically installed.
- The deployment manifest binds the exported route list to the exact run ID, data cutoff, current source IDs, archive months, and each archive's own source IDs. Rollback verification therefore checks the last-good version's identity instead of the failed candidate's identity.
- Publication authorization happens before the first Wrangler call. It rejects unsafe run IDs, paths, routes, production URLs, directory/file symlinks, malformed snapshots, missing or renamed reviews, non-`auto_publish` decisions, and candidate content whose canonical SHA-256 no longer matches its persisted review.
- Wrangler is invoked with `shell: false` and a fixed argument vector. The only accepted branches are `main` and `market-update-<scheduled-runId>`. Build and deployment subprocesses have bounded termination with SIGTERM followed by SIGKILL.
- Preview deployment and verification complete before promotion. A preview failure cannot promote, deploy to `main`, restore, or update last-known-good assets.
- A production upload or verification failure independently attempts authenticated snapshot restoration and last-good site deployment/verification. The returned error distinguishes candidate, snapshot-restoration, and site-restoration outcomes and never claims recovery for a failed step.
- Last-known-good assets are replaced atomically only after successful production verification. Copying rejects unsafe directory names, different work roots, final-directory symlinks, and any symlink inside the candidate tree.
- Initial last-good seeding exports the current snapshot, verifies the live production routes against that exact export identity, and removes the seed if verification fails.
- Verification follows redirects, requires final HTTP 200, validates exact current and archive source IDs, run ID, localized cutoff marker and timestamp, archive month, and the `AI MARKET ATLAS` brief marker. Content/HTTP/configuration failures are immediate; only network errors receive at most two retries.

## Concerns

- `npx tsc --noEmit` is not a configured project verification command. It reports broad pre-existing repository issues, including `.ts` extension import configuration, Cloudflare ambient types, and existing app locale typing. The required executable tests, build, lint, and real exporter checks all pass.
- The generated client runtime contains Vinext's internal `http://localhost` URL fallbacks inside minified JavaScript. They are library implementation strings, not page metadata. Every exported HTML document was scanned and confirmed free of localhost metadata.
