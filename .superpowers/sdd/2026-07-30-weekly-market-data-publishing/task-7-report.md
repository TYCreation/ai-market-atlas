# Task 7 Report: Snapshot-Driven HyperFrames Brief

## Status

Complete. The 30-second HyperFrames brief now derives its bilingual story, featured values, sources, methodology, cutoff, cadence, and run identity from the validated promoted snapshot. Canonical and public HTML/JSON are byte-identical, and the HTML retains a validated embedded fallback when relative `data.json` cannot be loaded safely.

## Files

- Created `scripts/generate-market-brief.ts`.
- Created `tests/market-data/market-brief.test.ts`.
- Created canonical and public `data.json`.
- Updated canonical and public HyperFrames HTML.
- Added `market:brief` and `check:hyperframes` package commands.

## TDD evidence

Initial RED:

```text
npm run test:market -- --test-name-pattern="brief|HyperFrames"
```

Exited 1 with `ERR_MODULE_NOT_FOUND` for `scripts/generate-market-brief.ts`; suite summary was 92 passed and 1 failed. This was the expected missing-generator failure.

The focused GREEN suite passes 6/6 and protects:

- full key-signal/source preservation plus an eight-signal Saturday cut;
- synchronized canonical/public HTML and JSON;
- parsed embedded fallback equality with `data.json`, including removal of stale issue/date/copy/numbers;
- unchanged-Wednesday full-brief reuse and changed-Wednesday five-signal generation;
- correct 390px embedded centering;
- reduced-motion seeking to the closing thesis.

A live 390px browser probe then exposed a second RED case: the root transformed to `translate(0px, 1537.538…px)` instead of the expected `312.3125px`. The regression failed with that exact mismatch before the minimal offset correction and passed afterward.

Dense transition inspection initially reported two errors at the intentional diagonal-split and blur-crossfade seams. After those transition zones were explicitly marked as allowing occlusion/overlap, the bounded recheck passed with zero issues.

## Verification

- `npm run market:brief` — passed.
- `npm run check:hyperframes` — passed: runtime 0 errors/warnings, layout 0 issues across 9 samples, motion 0 errors/warnings, contrast 46/46 WCAG AA.
- `npx hyperframes@0.7.83 lint --verbose` — 0 errors; one reviewed file-size advisory.
- `npx hyperframes@0.7.83 validate --json` — passed; 64/64 contrast checks in the explicit validation run.
- `npx hyperframes@0.7.83 inspect --json --at 16.72,16.78,16.92,23.32` — passed with 0 issues.
- `npm run test:market` — 98 passed, 0 failed.
- `npm test` — build passed; 8 rendered-route tests passed.
- `npm run lint` — passed.
- Canonical/public HTML comparison — byte-identical.
- Canonical/public JSON comparison — byte-identical.
- `git diff --check` — clean.

Browser verification used a local static preview:

- English desktop rendering loaded the embedded/current run and localized edition.
- Chinese at 390×844 rendered a 390×219.375 canvas centered at y=312.3125.
- `playback=1` restarted the composition and completed the first push transition (`scene-1` at −1920px, `scene-2` at 0px).
- Relative `data.json` returned 200 for both locales and replay requests.

## Self-review

- `buildMarketBrief` schema-validates input, keeps every promoted key signal and referenced source, and chooses a page-balanced five/eight-signal motion cut by cadence.
- Saturday/month-end include next-week observations; Wednesday omits them. An unchanged Wednesday reuses only a validated complete Saturday/month-end brief.
- The CLI defaults to tracked `current.json`, supports `--snapshot`, resolves a real regular file, and schema-validates it before generation.
- Runtime loading uses a same-origin relative URL, rejects non-matching run IDs or malformed bilingual payloads, and falls back to the last valid embedded payload.
- Query parameters, bilingual rendering, iframe replay, finite GSAP playback, the existing push/vertical-push/diagonal-split/blur-crossfade choreography, and final-scene-only exits are preserved.
- The stale embedded issue metadata, unsupported score `79`, hard-coded equities, dates, and market numbers are no longer present.
- The generated `.thumbnails/` preview artifact was removed and is not committed.

## Limitations

- HyperFrames 0.7.83 labels standalone `validate` and `inspect` deprecated in favor of `check`; both commands were still available and were run successfully.
- HyperFrames retains one advisory that the existing single-file composition is large. Splitting all five established scenes into sub-compositions would be a broad unrelated rewrite, so the warning was reviewed rather than acted on.
- The connected browser exposes viewport control but not `prefers-reduced-motion` media emulation. The exact reduced-motion branch from the shipped HTML was therefore executed in the automated regression with `matchMedia(...).matches === true`, verifying `seek(27).pause()` and no playback call.
