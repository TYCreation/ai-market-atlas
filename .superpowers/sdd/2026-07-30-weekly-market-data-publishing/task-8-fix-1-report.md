# Task 8 Fix Round 1: Recoverable Pages Publishing

## Status

Complete. The one Critical and four Important review findings are fixed locally.

Implementation commit: `a74b35baaf4796927fb37062ef3032fe97a5cb9a` (`Harden recoverable Pages publication identities`).

No Cloudflare, Sites, or other external deployment or network publication was performed. The progress ledger, automation configuration, and `.openai/hosting.json` were not edited.

## Fixes

1. Persisted publication reviews now pass through the same complete canonical validator used for archived automated-review provenance. Publication rejects malformed timestamps, unsupported or duplicate checks, incomplete required checks, noncanonical warning bindings, nondeterministic issues, forged counts, manual decisions, and candidate-hash or identity mismatches before a dependency call.
2. The real `market:deploy` orchestration authorizes the candidate and direct named review before last-known-good seeding, building, exporting, fetching, or publishing. The authorized canonical candidate SHA-256 is carried into export and immediately revalidated again before the first deployment.
3. Export manifests now bind every route to its exact route-specific identity. Current routes require exact run ID, full cutoff timestamp, and complete source-card set. Archive index and detail routes require their exact months; detail routes also require exact archived run ID, full cutoff timestamp, and complete archive source-card set. The market brief requires exact embedded run ID, cutoff, source set, and canonical payload hash. Copied `data.json` and embedded brief JSON are rejected if stale.
4. Month-end candidate export uses the same pure `projectMonthlyArchive` projection later persisted by promotion. A temporary monthly-index alias is supplied only to the fresh candidate build, so `/archive/YYYY-MM` and the archive index are present in both preview and production candidate artifacts before promotion without changing tracked storage.
5. Rollback verification now loads the manifest from the directory actually redeployed. Last-known-good recovery therefore verifies its own route set and identities, not the failed candidate's newly added routes. Recovery errors separately report snapshot and site restoration outcomes and never claim a restoration whose verification failed.
6. Export mutation tests now use isolated temporary project copies. This preserves full parallel test coverage without allowing a prospective-build fixture to replace the live market-brief iframe while the browser suite is exercising replay.

## Adversarial RED to GREEN Evidence

### Critical: persisted-review bypass

The forged-review table initially demonstrated three real bypasses: an invalid `reviewedAt`, an unsupported check status, and a warning issue without its canonical check binding all reached publication dependencies. The remaining forged variants were retained as defensive coverage. After delegating to the canonical validator, all six forged variants reject before any dependency call.

### Important 1: orchestration authorization

A fake orchestration runtime initially recorded the full build/export/fetch/publish pipeline for missing, forged, and manual reviews. After moving authorization to the orchestration entry point, all three cases reject with an empty action log. A second RED showed candidate export lacked the authorization hash; GREEN binds it to the persisted review SHA and immediate predeploy revalidation rejects a post-export candidate change.

### Important 2: exact route and brief identities

Verification initially accepted a current route with only one of two required sources, an archive route with only one of two required sources, and a stale market brief whose title marker remained present. It also accepted an archive cutoff with the right date but a different timestamp. GREEN requires exact sets and full identities, including the complete archive timestamp exposed in rendered HTML. Export REDs for stale copied brief JSON and stale embedded JSON now both reject.

### Important 3: prospective month-end archive

The storage RED failed because no pure archive projection existed. After extracting `projectMonthlyArchive`, promotion persists that exact value. A real month-end build/export RED omitted `/archive/2026-08`; GREEN renders that route and its archive-index entry from a temporary projected index while both isolated and repository tracked monthly-index bytes remain unchanged.

### Important 4: last-known-good route context

Rollback initially called verification with the candidate route list, including a newly added archive route absent from last-known-good. GREEN records candidate directories for preview/production and the last-good directory for rollback; the real dependency loads each directory's own manifest. A last-good verification failure is now reported as a site-restoration failure.

Focused GREEN:

```sh
node --experimental-strip-types --test tests/market-data/deployment.test.ts tests/market-data/deploy-pages.test.ts tests/market-data/export-pages.test.ts tests/market-data/storage.test.ts tests/market-data/review.test.ts
```

Output before the final timestamp/isolation additions: `tests 82`, `pass 82`, `fail 0`. The complete suite below includes all final coverage.

## Fresh Verification

```sh
npm run test:market
```

Output: `tests 198`, `pass 198`, `fail 0`. The pinned Chromium probe and 24-test browser behavior matrix passed.

Two earlier full-suite probes exposed a test-isolation race as `frame.waitForFunction: Frame was detached`: the new prospective export test was rebuilding/restoring shared brief assets while the browser suite ran in parallel. The isolated browser suite passed `24/24`; after moving export fixtures into temporary project copies, the unchanged parallel full suite passed `198/198`.

```sh
npm test
```

Output: the production Vinext build completed and all 8 rendered-route tests passed.

```sh
npm run lint
git diff --check
```

Both completed with no findings.

```sh
npm run market:export
```

The real local build/export completed with 9 routes and candidate SHA-256:

```text
84ec759f681d9a987f81cac435bc20daf528402e21117399cc7395f4f0366eed
```

Bounded inspection confirmed:

- 9 manifest routes and 9 route identities;
- no symlinks in `work/pages-candidate`;
- no `localhost` or `127.0.0.1` in exported HTML;
- the archive HTML contains its full manifest cutoff timestamp;
- copied brief run ID and cutoff match its route identity;
- the manifest contains exact current, archive-index, archive-detail, and market-brief identities.

## Self-review

- Authorization precedes any external-capable dependency and is repeated immediately before deployment against the exported manifest hash.
- Preview and production deploy the same candidate directory; no post-preview rebuild can create byte drift.
- The temporary prospective monthly index is created with exclusive write, supplied through a validated Vite alias, and removed in `finally`.
- Verification retries only network failures. HTTP, content, identity, and configuration mismatches fail immediately.
- Last-known-good seeding and rollback both verify the manifest belonging to the directory actually bound to the deployed URL.
- Copied market-brief data is validated structurally and by canonical full-payload hash, not only by a title or partial marker.

## Remaining Concerns

None within this fix round. External deployment was intentionally excluded, so live Cloudflare behavior was not exercised.
