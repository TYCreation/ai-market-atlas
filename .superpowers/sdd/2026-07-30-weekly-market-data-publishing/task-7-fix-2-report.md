# Task 7 Fix Round 2: Weekly Market Brief Publishing

## Status

Complete. All four Important round-two findings are addressed without deployment.

Implementation commit: `8da076d5bc07954301ebb3d73437b9ed8a0a7026` (`Close weekly brief publishing review gaps`).

## Fixes

1. Wednesday key-signal comparison now distinguishes genuinely added IDs from unchanged retained IDs. A late replacement with a new `/sic` metric is treated as the actual change and is included in the bounded 3–5 featured cut; pure reordering still invalidates editorial reuse.
2. Generator and browser payload validators are fail-closed and return `false` for malformed nested values instead of throwing. Both require exactly three localized thesis tags because the composition renders exactly three slots. Saturday and month-end inputs require evidence-backed next-week observations before brief construction, generated output is validated again before any output read/write, and invalid input leaves all four outputs untouched.
3. Brief rendering is planned and target-checked before any DOM mutation. The commit phase snapshots affected text, language, visibility, accessibility, and layout state and restores it if mutation fails. A failed fetched render resolves to the embedded brief without attempting a second unsafe render or leaving partial fetched content in the DOM.
4. Replay coverage now starts the real vinext application, advances and pauses the actual embedded GSAP timeline near completion, clicks the real outer replay control, verifies that React remounts a new iframe with the incremented playback key, and verifies the new timeline starts near zero and continues progressing.
5. Browser verification is hermetic: Playwright is exactly pinned at `1.54.1`, the repository setup command installs its matching Chromium, a probe rejects machine-global Chrome paths and launches the pinned executable in `try/finally`, and browser tests use that executable with cleanup covering launch failure and normal completion.

## TDD Evidence

The new regression cases were observed failing before production changes:

- a Wednesday late-ID replacement featured only earlier `/`, `/stocks`, and related metrics, omitting the genuinely new `/sic` signal;
- `labels: null` threw from the TypeScript validator;
- Saturday input with no observations and input with only two tags completed generation and changed outputs;
- a fetched one-tag payload was accepted and partially replaced rendered values;
- removal of a required render target caused `briefReady` to reject after partial mutation/fallback failure;
- the original replay check only loaded a fabricated `playback=1` query and never exercised the outer control or remount;
- the initial pinned-runtime test failed cleanly because the Playwright Chromium executable had not yet been installed.

After the minimal implementation, the focused generator suite passes 28 tests/subtests and the actual-browser suite passes 24 tests/subtests.

## Fresh-install Browser Evidence

- `npm run market:browser:install` downloaded/located the Playwright-managed Chromium build without registry or network failure.
- `npm run market:browser:probe` launched Chromium `139.0.7258.5` from the Playwright cache and closed it in `finally`.
- `npm run test:market` runs install and probe automatically through `pretest:market`; it does not search for or fall back to a globally installed Chrome.
- The setup is portable through Playwright's own CLI and platform-specific cache selection; no absolute browser executable is checked into the repository.

## Verification

- `npm run market:brief` — passed.
- Canonical/public HTML and JSON — byte-identical.
- `npm run test:market` — 144 tests/subtests passed, 0 failed.
- Actual Chromium matrix — 24 tests/subtests passed, including desktop/mobile, both locales, real replay/remount/progression, reduced motion, Wednesday, month-end, malformed/empty/partial data, atomic render failure, hanging fetch, and unreachable fetch.
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

HyperFrames retains the existing `composition_file_too_large` advisory. Splitting the established five-scene single-file composition remains outside this correctness fix; runtime, layout, motion, contrast, and browser gates pass.

The two previously accepted Minor findings remain deferred:

- Hard-coded visual bar widths remain unchanged.
- The four generated output writes remain concurrent rather than staged/atomic.

No deployment was performed. The progress ledger and automation configuration were not edited.
