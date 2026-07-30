# Task 8 Fix Round 2: Race-Free Artifact and Brief Verification

## Status

Complete. All three Important review findings are fixed locally.

Implementation commit: `a2a8759a1ae8b3c339920c3b9a5b36c6c1537475` (`Harden weekly Pages publication`).

No Cloudflare, Sites, or other external deployment or network publication was performed. The progress ledger, automation configuration, and `.openai/hosting.json` were not edited.

## Fixes

1. Pages publication now owns an exclusive per-project lock from before the first export through preview, promotion, production verification, rollback handling, and last-known-good replacement. A second owner cannot enter concurrently. Malformed, symlinked, active, and stale lock files fail closed; a stale lock requires explicit operator cleanup rather than unsafe automatic deletion. Release verifies the random owner token and occurs on success or failure.
2. Promotion requires the exact candidate SHA-256 authorized before export. `promoteCandidate` rehashes the normalized candidate and rejects a changed candidate even if an attacker also replaces the persisted review with a newly valid one. The promotion result must report that same SHA before production can be touched.
3. Export computes a deterministic SHA-256 over sorted UTF-8 relative paths plus file bytes. The tree digest excludes only the root `.market-deployment.json` to avoid self-reference and rejects symlinks and non-files. The manifest binds the candidate SHA and tree digest; the export result separately binds the canonical manifest hash.
4. Candidate, review, live artifact tree, and manifest are revalidated before preview, after preview verification, before production, after production verification, and immediately before last-known-good replacement. Deploy and verify also reload the bound manifest and tree. Atomic last-good copying verifies both source and copied tree/manifest identities before rename.
5. Failures after promotion restore the snapshot. If production may have been touched, the flow redeploys and verifies last-known-good; failures before production accurately report that site restoration was not required. A mismatched promotion result cannot reach production.
6. Export no longer reconstructs a market brief from the snapshot with a default feature selection. It loads the canonical generated payload, validates its full snapshot semantics, requires canonical/public JSON and embedded payload agreement, and then copies that exact artifact. A real changed-`/sic` Wednesday build/export now succeeds with its cadence-specific featured subset.
7. Live market-brief verification fetches both `/market-brief/` and `/market-brief/data.json`. The JSON must return 200, parse, match the manifest payload hash, and match the embedded payload hash. Missing, stale, and corrupt JSON fail immediately without content retries.

## Adversarial RED to GREEN Evidence

### Important 1: publication TOCTOU and artifact binding

- A changed candidate plus a replacement valid review initially promoted despite the older authorization. GREEN requires and rechecks the authorized SHA in storage and the CLI/deploy callers.
- Concurrent orchestration initially allowed two exports to overlap. GREEN holds one exclusive publication lock around the complete orchestration and rejects the second owner.
- Candidate/review replacement after preview initially reached promotion and production. GREEN revalidates at all five irreversible boundaries.
- Artifact mutation at each boundary initially went undetected when the corresponding check was absent. The phase table now rejects before the next irreversible action and restores the snapshot/site where applicable.
- Valid-JSON manifest substitution initially passed because the tree digest intentionally excludes the manifest. GREEN separately binds the canonical manifest hash through revalidation, deployment verification, and last-good copying.
- A mismatched `PromotionResult` initially reached production. GREEN restores the snapshot and stops before production.
- A source mutation during last-good copy initially could poison the retained directory. GREEN validates the source identity before copy and the copied identity before atomic rename.

### Important 2: changed-Wednesday semantic export

A real isolated build changed `sic.market_2030_usd_b` for a scheduled Wednesday and generated the canonical five-feature brief:

```text
sic.market_2030_usd_b
sic.wafer_frontier_mm
sic.packaging_watts
sic.ev_penetration
pulse.infrastructure_spend
```

The old exporter rebuilt a different default subset and rejected the otherwise valid artifact. GREEN validates the generated payload against the snapshot without replacing its cadence-specific featured selection. Additional REDs prove disagreement in public `data.json` or either embedded canonical/public payload is rejected.

### Important 3: live canonical JSON

Verification initially fetched only the market-brief HTML. After adding the JSON request but before content binding, stale and corrupt JSON still passed. GREEN requires one successful JSON request and exact canonical hash agreement with both the route manifest and embedded HTML payload. Missing, stale, and corrupt cases all reject without retries.

## Fresh Verification

```sh
npm run test:market
```

Output: `tests 225`, `pass 225`, `fail 0`. This includes the pinned Chromium probe and the complete browser behavior matrix.

```sh
npm test
```

Output: the production Vinext build completed and all 8 rendered-route tests passed.

```sh
npm run lint
git diff --check
```

Both completed with no findings after the generated local export was moved out of the worktree.

Final focused regression:

```sh
node --experimental-strip-types --test \
  tests/market-data/deployment.test.ts \
  tests/market-data/deploy-pages.test.ts \
  tests/market-data/export-pages.test.ts \
  tests/market-data/market-brief.test.ts \
  tests/market-data/storage.test.ts \
  tests/market-data/monthly.test.ts
```

Output: `tests 126`, `pass 126`, `fail 0`.

```sh
npm run market:export
```

The real local build/export completed with 9 routes and these identities:

```text
candidate  84ec759f681d9a987f81cac435bc20daf528402e21117399cc7395f4f0366eed
tree       c3569863e3a24b267041c00518784da7294510ca41423eeb5c3e6faace637fd2
manifest   d21eb3bb23c91ac68f7418c69a94cae37a004525bda77bf89756e22106394002
brief      91f1455ce7f9c7f8fd173404b76e8ad845f62097fb0530a2c6a839651f35ddf7
```

Bounded inspection confirmed:

- 9 manifest routes;
- recomputed artifact-tree hash equals the manifest hash;
- recomputed canonical manifest hash equals the export result;
- `market-brief/data.json` equals the route payload hash;
- embedded brief JSON equals `data.json`;
- zero symlinks;
- zero `localhost` or `127.0.0.1` references.

The generated export was preserved outside the worktree at `/tmp/ai-market-atlas-task8-pages-candidate-019fb09f` for recoverability while leaving the branch clean.

## Self-review

- The artifact-tree serialization is unambiguous: every sorted path and byte payload is length-prefixed before hashing.
- The manifest exclusion policy is explicit and tested; a separate manifest hash closes substitution without circular hashing.
- The lock is project-wide rather than run-name-wide, so two different scheduled runs cannot mutate the shared candidate, production, or last-good state concurrently.
- Every deploy and verify operation is bound to the directory and identities recorded for its URL.
- Network failures retain bounded retries; HTTP and semantic content failures do not retry.
- The changed-Wednesday test uses an isolated project copy and does not mutate tracked canonical/public artifacts.
- Storage and month-end regression suites pass with the new required promotion authorization parameter.

## Remaining Concerns

External deployment was intentionally excluded, so live Cloudflare behavior was not exercised. The previously deferred Vite environment-path Minor was not changed in this round.
