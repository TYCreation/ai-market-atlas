# Task 9: Automation Contract, End-to-End Checks, and Handoff

## Status

Complete locally.

Implementation commit: `7c86323caa1d8372e13a1c0e17f552f882a07b9e`
(`Document and verify weekly market automation`).

External automation and production deployment were intentionally not changed;
the controller owns those follow-up actions.

## Delivered

- `runFixturePipeline()` runs real review, persisted-review promotion, brief
  generation, build, and static export inside a disposable temporary project.
  It never calls deployment and always reports `deploymentAttempted: false`.
  Manual-review fixtures stop before promotion, build, and export.
- End-to-end tests prove the approved fixture exports all current routes,
  `/archive/2026-07`, and `/market-brief/` without changing tracked current or
  monthly storage. The source-conflict fixture returns `manual_review`.
- `docs/automation/weekly-market-update-prompt.md` is the exact
  source-controlled Wednesday/Saturday contract, including cadence, free-source
  policy, candidate-only editing, gates, deploy/restore behavior, post-success
  pruning, and complete reporting requirements.
- `README.md` now documents candidate/source policy, blocked reviews, local
  checks, promotion, 90-day retention, permanent monthly archives, export,
  production deployment/restoration, transition recovery, and the paid-adapter
  boundary.
- Rendered HTML acceptance now checks current navigation, metric/source
  bindings, the embedded brief, archive navigation, the permanent archive run,
  and its public source markers.

## TDD Evidence

The fixture test first failed because `market-data/pipeline.ts` did not exist.
After implementation, the approved and blocked paths passed `2/2`. The rendered
publication contract also caught an incorrect stock marker in its first RED run;
the assertion was corrected to the actual published KPI binding and then passed
`9/9`.

## Verification

- Focused end-to-end fixture tests: `2/2`.
- Full `npm run test:market`: `245/245`, including Chromium behavior checks.
- `npm test`: production build and rendered HTML acceptance `9/9`.
- `npm run check:hyperframes`: passed runtime, layout, motion, and WCAG AA
  contrast checks; the pre-existing composition-size advisory remained the only
  warning.
- Explicit isolated fixture inspection: `auto_publish`,
  `2026-08-01-saturday`, nine routes including all current routes,
  `/archive/2026-07`, and `/market-brief/`; `deploymentAttempted: false`.
- `npm run lint` and `git diff --check`: passed.
- No generated fixture workspace or `work/` artifact remains.
