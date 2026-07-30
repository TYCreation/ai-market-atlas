# Task 7 Fix Round 3: Weekly Market Brief Publishing

## Status

Complete. All three Important round-three findings are addressed without deployment.

Implementation commit: `2f1058f97db17a05b3a4a04e82aa601c5a3cbc1a` (`Finish weekly brief replay and ordering checks`).

## Fixes

1. Wednesday comparison now reports two independent facts: whether the ordered key-signal envelope changed, and which signal records were genuinely added/replaced or changed in value, kind, page, or source binding. Order changes still invalidate full-content reuse, but only genuine record changes affect featured-signal priority.
2. The exact reverse-order regression no longer promotes four `/sic` metrics merely because their positions changed. It publishes the fresh Wednesday content with a page-balanced cut. The late genuinely new `/sic` replacement regression remains green and still features the new signal.
3. The real replay browser case no longer manufactures an end state with `seek(duration()).pause()`. It lets the live GSAP timeline advance under accelerated `timeScale`, observes intermediate progression, waits for real completion, clicks the actual outer React replay button, verifies a new iframe/remounted timeline starts near zero, observes progression again, and waits for the replayed timeline to complete.
4. Browser asset paths now pass file URLs through `fileURLToPath`, including the shared static-composition helper and real-app replay route. A path containing spaces is regression-tested without relying on URL-encoded pathname behavior.
5. Vinext is spawned portably through `process.execPath` and its JavaScript CLI rather than a platform-specific `.bin` wrapper. Cleanup sends `SIGTERM`, awaits a bounded grace period, escalates to `SIGKILL`, awaits a second bounded period, and fails explicitly if the child still does not exit. Startup-timeout cleanup uses the same path.

## TDD and Probe Evidence

The focused RED runs showed:

- reversing otherwise identical key-signal IDs produced the false cut `sic.ev_penetration`, `sic.packaging_watts`, `sic.wafer_frontier_mm`, `sic.market_2030_usd_b`, and one model signal;
- converting a file URL with a space returned an encoded `%20` pathname instead of the local filesystem path;
- cleanup returned after its grace timeout while a real Node child that ignored `SIGTERM` was still running.

Each RED failed on its intended consumer-visible assertion. After the minimal fixes:

- reorder-only, genuinely added `/sic`, and record-change cases pass together;
- the path-with-spaces and real stubborn-child tests pass;
- focused generator coverage passes 29 tests/subtests;
- focused browser-runtime coverage passes 2 tests;
- the actual Chromium behavior matrix passes 24 tests/subtests.

The replay finding concerned test adequacy rather than a broken production replay implementation, so its replacement was treated as a real-browser probe: it passed only after observing two actual accelerated completions and contains no synthetic seek-to-end operation.

## Verification

- `npm run market:brief` — passed.
- Canonical/public HTML and JSON — byte-identical.
- `npm run test:market` — 147 tests/subtests passed, 0 failed. Its setup installed/probed the pinned Playwright Chromium successfully.
- Actual Chromium matrix — 24 tests/subtests passed, including natural accelerated completion before replay and after the real replay remount.
- Focused path-with-spaces and stubborn-child cleanup — 2 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- `npm test` — build passed; 8 rendered-route tests passed.
- `npx --yes hyperframes@0.7.84 upgrade --check` — already current at `0.7.84`.
- HyperFrames lint — 0 errors; one reviewed file-size advisory.
- HyperFrames validate — no console errors; 46/46 text elements pass WCAG AA.
- HyperFrames inspect with `--samples 7 --max-issues 20` — 0 layout issues across 7 bounded samples.
- HyperFrames check — passed: runtime 0 errors/warnings, layout 0 issues across 9 samples, motion 0 errors/warnings, contrast 46/46 WCAG AA.
- `git diff --check` — clean before the implementation commit.

## Reviewed Advisory and Deferred Minor Findings

HyperFrames retains the existing `composition_file_too_large` advisory. The composition itself was not changed in this round, and all runtime, layout, motion, contrast, and real-browser gates pass.

The previously accepted Minor findings remain deferred:

- Hard-coded visual bar widths remain unchanged.
- The four generated output writes remain concurrent rather than staged/atomic.

No deployment was performed. The progress ledger and automation configuration were not edited.
