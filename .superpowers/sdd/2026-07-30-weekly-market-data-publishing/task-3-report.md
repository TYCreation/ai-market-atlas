# Task 3 Report — Automated Review and Guarded Quality Gate

## Status

Completed and committed.

## Summary

- Added a deterministic, stable-order quality gate covering the approved source-conflict, anomaly, missing-data, low-confidence, thesis, bilingual, and material-change rules.
- Added injected source-health checks with exact-URL run caching, redirect support, a 10-second abort signal, 2xx/3xx acceptance, and guarded 403/405 warning behavior.
- Added a canonical recursive-key-order SHA-256 candidate binding and immutable automated-review checks.
- Added all nine required review check records and the fixed `auto_publish`, `manual_review`, and `reject` routing.
- Added atomic review persistence to `data/market/reviews/<runId>.json`, full JSON decision output, and CLI exit codes 0/2/3.
- Added deterministic network fakes and fixtures for conflicting prices, missing required data, and thesis reversal.

## Files

- `market-data/source-health.ts` (new)
- `market-data/quality-gate.ts` (new)
- `market-data/review.ts` (new)
- `scripts/market-review.ts` (new)
- `tests/market-data/source-health.test.ts` (new)
- `tests/market-data/quality-gate.test.ts` (new)
- `tests/market-data/review.test.ts` (new)
- `tests/fixtures/market/conflicting-prices.json` (new)
- `tests/fixtures/market/missing-required.json` (new)
- `tests/fixtures/market/thesis-reversal.json` (new)
- `package.json` (modified)

## Commits

- `6ba0cf60f7a34f0d1d2f637f9134390e27164da6 Add automated market review gate`
- The report itself is committed separately after the implementation commit so it can record the exact implementation hash.

## TDD evidence

### Initial RED

Command:

```text
npm run test:market -- --test-name-pattern="blocks"
```

Output: exit 1. The requested test run failed because `market-data/quality-gate.ts`, `market-data/review.ts`, and `market-data/source-health.ts` did not exist. TAP summary: `tests 21`, `pass 18`, `fail 3`.

### Focused RED/GREEN fixes

Command:

```text
node --experimental-strip-types --test --test-name-pattern="negates" tests/market-data/quality-gate.test.ts
```

RED output: exit 1, `AssertionError`, the expected `THESIS_REVERSAL` was absent for bullish → neutral. TAP: `tests 1`, `pass 0`, `fail 1`.

GREEN output after implementation: exit 0. TAP: `tests 1`, `pass 1`, `fail 0`.

Command:

```text
node --experimental-strip-types --test --test-name-pattern="exactly ten" tests/market-data/quality-gate.test.ts
```

RED output: exit 1, `AssertionError: true !== false`; floating-point noise incorrectly classified an exact 10% forecast boundary. TAP: `tests 1`, `pass 0`, `fail 1`.

GREEN output after epsilon-safe comparison: exit 0. TAP: `tests 1`, `pass 1`, `fail 0`.

Command:

```text
node --experimental-strip-types --test --test-name-pattern="no-change integrity" tests/market-data/review.test.ts
```

RED output: exit 1, expected `reject`, actual `manual_review`. TAP: `tests 1`, `pass 0`, `fail 1`.

GREEN output after fixed reject routing: exit 0. TAP: `tests 1`, `pass 1`, `fail 0`.

Command:

```text
node --experimental-strip-types --test --test-name-pattern="object key order" tests/market-data/quality-gate.test.ts
```

RED output: exit 1, `AssertionError: true !== false`; equivalent report objects with reordered keys were incorrectly treated as rewritten. TAP: `tests 1`, `pass 0`, `fail 1`.

GREEN output after semantic deep comparison: exit 0. TAP: `tests 1`, `pass 1`, `fail 0`.

Command:

```text
node --experimental-strip-types --test --test-name-pattern="persisted identity" tests/market-data/review.test.ts
```

RED output: exit 1, `AssertionError: Missing expected exception.` for an altered `reviewId`. TAP: `tests 1`, `pass 0`, `fail 1`.

GREEN output after identity/count/check-set integrity validation: exit 0. TAP: `tests 1`, `pass 1`, `fail 0`.

## Final verification

Command:

```text
npm run test:market
```

Exact final TAP summary:

```text
1..49
# tests 49
# suites 0
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 244.657583
```

Command:

```text
npm test
```

Output: exit 0. The five-stage production build completed, then the rendered HTML suite passed:

```text
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 227.618167
```

Command:

```text
npx eslint market-data/quality-gate.ts market-data/review.ts market-data/source-health.ts scripts/market-review.ts tests/market-data/quality-gate.test.ts tests/market-data/review.test.ts tests/market-data/source-health.test.ts
```

Output: exit 0 with no warnings or errors.

Command:

```text
git diff --cached --check
```

Output: exit 0 with no whitespace errors before the implementation commit.

## Self-review

- Confirmed all requested public signatures and Task 1/2 snapshot contracts remain compatible.
- Confirmed gate output order is deterministic by `code`, `metricId`, `page`, then message.
- Confirmed every cited URL is fetched at most once per run and tests use only injected deterministic fetchers.
- Confirmed exact 1%, 10%, and 20% boundaries do not block; only approved strict threshold crossings block.
- Confirmed source-conflict and anomaly decisions route to manual review, while schema/session/bilingual/narrative/source/no-change integrity failures reject.
- Confirmed warnings alone still auto-publish.
- Confirmed canonical hash ordering is independent of input object insertion order and lowercase SHA-256 output is bound to the persisted review identity.
- Confirmed `assertAutoPublishReview` rejects candidate hash changes, altered review identity/counts, missing checks, failed checks, and block issues.
- Confirmed CLI tests cover atomic persisted output and all three exit-code mappings.
- Confirmed no plan/spec or UI files were edited.

## Concerns

- Repo-wide `npm run lint -- --quiet` is still blocked by the pre-existing `react-hooks/set-state-in-effect` error at `app/components/MarketDashboard.tsx:98`. Focused lint for every Task 3 TypeScript/test file passes.
- Repo-wide `npx tsc --noEmit` is not a configured clean check: it reports pre-existing missing Cloudflare worker globals/modules and existing TS5097 `.ts` import-extension errors across prior market-data/tests. The production build and both required suites pass.
- Narrative numeric evidence is evaluated for the report fields that carry explicit per-field `metricIds` (`supportingEvidence` and `opposingEvidence`). Other report prose has no field-level citation list in the current snapshot contract, so it cannot be matched without an incompatible type extension.
- Sources without a URL (for example the internal atlas model) are not fetched; source-health evaluates the exact URL-bearing sources cited by required, thesis, and key-signal metrics.

## Review fix round 1

### Status

All five review findings were reproduced with focused failing tests, fixed, and verified.

### Exact changes

1. **Run-ID path containment**
   - Added exact `YYYY-MM-DD-(wednesday|saturday|month-end)` validation.
   - Wednesday and Saturday IDs must name the matching weekday; month-end IDs must name the final calendar day; the suffix must match snapshot cadence.
   - Unsafe IDs, separators, dot segments, encoded separators, Windows paths, absolute paths, impossible dates, and cadence/date mismatches produce reject decisions.
   - Rejected candidates use a SHA-bound safe filename.
   - The CLI resolves the review directory and proves the output's `dirname` and `basename` make it a direct child before the atomic write.

2. **Full bilingual narrative evidence**
   - Numeric claims are now checked in both locales across eyebrow, title, summary, signal, thesis title/body/tags, catalysts, risks, next observations, supporting evidence, and opposing evidence.
   - General page prose uses `page.thesisMetricIds`; evidence items continue to use their own `metricIds`.
   - Numeric tokenization is uniform for ordinary numbers, dates, and versions. Claims can match cited metric numeric/display values or numeric tokens from cited source publisher/title/URL/publication/retrieval/scope metadata.
   - Unsupported claims in any inspected field are reject-level narrative-evidence failures.
   - This supersedes the earlier report concern that only supporting/opposing evidence could be checked.

3. **No-change integrity**
   - A page marked `changed: false` must preserve report content, thesis stance, and the semantic set of thesis metric IDs.
   - Neutral → bullish and citation-set mutations now reject even when they are not directional stance reversals.

4. **Stable source provenance**
   - New-source evidence now compares a normalized provenance fingerprint: canonical URL, normalized publisher/title, and publication timestamp.
   - Re-keying identical source content no longer suppresses financial or forecast anomalies and no longer satisfies first-party changed-page evidence.
   - A genuinely new publication timestamp remains valid new evidence.

5. **SSRF and redirect guard**
   - Source-health now rejects local/single-label hostnames, loopback, private, carrier-grade NAT, link-local, reserved/documentation, multicast, and non-global IPv4/IPv6 targets.
   - Hostname resolution is injectable and cached; empty, private, or mixed public/private answers reject before fetch.
   - Redirects use `redirect: "manual"`, validate every target before connection, follow at most five hops, reject cycles, and cache every requested URL.
   - The production default uses `node:dns/promises.lookup`; tests inject deterministic hostname answers.

### RED evidence

Command:

```text
node --experimental-strip-types --test --test-name-pattern="unsafe run IDs|scheduled safe run IDs|general bilingual|page citation set|changed-false|re-keyed|genuinely new|loopback|private targets|public redirect" tests/market-data/review.test.ts tests/market-data/quality-gate.test.ts tests/market-data/source-health.test.ts
```

Output: exit 1. TAP summary:

```text
1..11
# tests 11
# pass 3
# fail 8
```

The failures reproduced:

- re-keyed sources bypassing `FINANCIAL_DELTA`;
- changed-false stance/citation changes producing no integrity issue;
- re-keyed first-party sources satisfying changed-page evidence;
- unsupported title/summary/thesis/risk numbers auto-publishing;
- unsafe run IDs exiting 0 and escaping the intended name contract;
- local/private/mixed-resolution targets being fetched;
- redirects to private targets being accepted;
- automatic redirect behavior preventing guarded public redirect handling.

### GREEN verification

Command:

```text
node --experimental-strip-types --test tests/market-data/quality-gate.test.ts tests/market-data/review.test.ts tests/market-data/source-health.test.ts
```

Exact final TAP summary:

```text
1..44
# tests 44
# suites 0
# pass 44
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 281.971125
```

Command:

```text
npm run test:market
```

Exact final TAP summary:

```text
1..62
# tests 62
# suites 0
# pass 62
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 345.121208
```

Command:

```text
npm test
```

Output: exit 0. The five-stage production build completed and rendered HTML passed:

```text
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 238.777959
```

Command:

```text
npx eslint market-data/quality-gate.ts market-data/review.ts market-data/source-health.ts scripts/market-review.ts tests/market-data/quality-gate.test.ts tests/market-data/review.test.ts tests/market-data/source-health.test.ts
```

Output: exit 0 with no warnings or errors.

Command:

```text
npx tsc --noEmit --allowImportingTsExtensions --target es2022 --module nodenext --moduleResolution nodenext --types node --skipLibCheck market-data/types.ts market-data/catalog.ts market-data/schema.ts market-data/session.ts market-data/quality-gate.ts market-data/source-health.ts market-data/review.ts scripts/market-review.ts
```

Output: exit 0 with no type errors.

### Self-review

- Verified all five findings have direct behavior tests, including unsafe path forms, safe schedules, unsupported and supported narrative claims, neutral stance changes, citation changes, source re-keying, new publication evidence, private literals, private/mixed DNS answers, guarded redirects, and redirect cycles.
- Verified the resolver parameter is an optional compatible extension to the existing source-health/review contracts.
- Verified source URLs and DNS results are validated before the injected fetcher is called.
- Verified no automatic redirects remain.
- Verified source and DNS caches are scoped to one health-check run.
- Verified no Task 1/2 interface, plan/spec, fixture contract, or UI file was changed.

### Concerns

- The original seeded report prose contains uncited numeric architecture labels such as `800V`; under the corrected full-field rule, such prose must cite a matching normalized metric/source number or the automated review correctly rejects it.
- The pre-existing repo-wide lint/typecheck concerns recorded above remain unchanged; focused lint and the isolated Task 3 typecheck pass.
