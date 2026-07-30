# Task 7 Fix Round 1: Weekly Market Brief Publishing

## Status

Complete. All eight Important review findings are addressed without deployment.

Implementation commit: `875fb31cc5cd2acd1a5b1f4ab9177c7b58daa86d` (`Harden weekly market brief publishing`).

## Fixes

1. Wednesday selection now prioritizes key-signal metrics from changed pages before filling page-balanced slots. A `/sic`-only value change is regression-tested and represented in the featured cut.
2. Wednesday reuse now compares the ordered key-signal IDs plus each signal's localized values, page, kind, and source bindings to the prior complete brief. Unchanged runs reuse editorial content only while stamping the current run ID, Wednesday cadence, cutoff, signal/source envelope, bounded featured cut, and empty observation list.
3. Featured cuts enforce unique cadence bounds: Wednesday 3–5; Saturday and month-end 5–8. Snapshot key signals must be unique and numerous enough to satisfy the cadence. Invalid prior lower-bound, upper-bound, and duplicate cuts are rejected from reuse. Month-end generation and browser behavior are covered.
4. Both generator-side and shipped-browser payload validation now cover cadence, parseable cutoff, supported page/kind values, signal IDs, signal source bindings, exact top-level source coverage, uniqueness, featured cadence bounds, bilingual content, and cadence-specific observation rules. Each malformed fetched-field mutation falls back to the embedded payload without corrupting the rendered DOM.
5. Embedded valid data renders before any fetch, the GSAP timeline is still constructed synchronously, and embedded playback/reduced-motion startup no longer awaits the relative request. The request has a 1.5-second abort bound and is non-critical; hanging and unreachable requests are browser-tested.
6. Wednesday hides the next-week observations panel and expands the signal board instead of fabricating substitute observations. Saturday and month-end retain the semantically correct panel.
7. Checked-in tests assert canonical/public HTML and JSON byte identity and embedded/data payload identity. The actual composition is exercised in Chromium for desktop English, 390px Chinese, replay, reduced motion, month-end, Wednesday, malformed fetch variants, hanging fetch, and unreachable fetch.
8. CLI parsing accepts both `--snapshot <path>` and `--snapshot=<path>`, and rejects unknown or misspelled flags, duplicate flags, missing values, and stray positionals before generation can write outputs. Subprocess tests run the real copied CLI and verify sentinel outputs remain untouched on rejection.

## TDD Evidence

Adversarial tests were added before each behavioral implementation. The focused RED runs showed:

- stale Saturday metadata/content reuse instead of the current Wednesday envelope;
- `/sic`-only and ID/value/kind/source-binding changes returning the stale prior run;
- missing lower-bound and duplicate-key-signal errors;
- duplicate prior featured IDs being reused;
- `--snapshot=...` being ignored and unknown/duplicate/positional CLI inputs exiting successfully or failing for the wrong downstream reason;
- malformed same-run data being returned and rendered;
- the Wednesday observation panel remaining visible;
- a hanging fetch leaving the real GSAP timeline at time `0`.

The focused GREEN suite passes 44 tests/subtests across generator, CLI, asset identity, and actual-browser behavior.

## Verification

- `npm run market:brief` — passed.
- Canonical/public HTML — byte-identical.
- Canonical/public JSON — byte-identical.
- Embedded JSON — structurally identical to checked-in `data.json`.
- `npm run check:hyperframes` — passed: runtime 0 errors/warnings, layout 0 issues across 9 samples, motion 0 errors/warnings, contrast 46/46 WCAG AA.
- `npx --yes hyperframes@0.7.84 lint --verbose` — 0 errors; one reviewed file-size advisory.
- `npx --yes hyperframes@0.7.84 validate --json` — passed with no errors or warnings and no contrast failures.
- `npx --yes hyperframes@0.7.84 inspect --json --at 16.72,16.78,16.92,23.32` — passed with 0 issues and an explicitly bounded four-sample transition inspection.
- `npm run test:market` — 136 tests/subtests passed, 0 failed.
- Actual Chromium matrix — all desktop/mobile/locales/replay/reduced-motion/cadence/fetch cases passed.
- `npm run build` — passed.
- `npm test` — build passed; 8 rendered-route tests passed.
- `npm run lint` — passed.
- `git diff --check` — clean before the implementation commit.

The mandatory HyperFrames upgrade probe found the project one patch behind. The pin was upgraded from `0.7.83` to `0.7.84`, and the full HyperFrames check passed on `0.7.84`.

## Reviewed Advisory

HyperFrames retains the existing `composition_file_too_large` advisory. Splitting the established single-file five-scene composition into sub-compositions is outside this focused correctness fix; runtime, layout, motion, contrast, transition, and browser checks all pass.

## Deferred Minor Findings

- Hard-coded visual bar widths remain unchanged.
- The four generated output writes remain concurrent rather than staged/atomic.

No deployment was performed. The progress ledger was not edited.
