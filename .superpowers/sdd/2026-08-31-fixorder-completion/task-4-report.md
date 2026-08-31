# Task 4 report — T11 analyst notes, falsifiable risks, and observations

Status: complete

Commit: `a40e86b feat: require falsifiable market editorial payloads`

## Delivered

- Added strict candidate editorial types: `analystNotes`, cited falsifiable risk
  objects (`condition`, `metricIds`), and structured next observations (`what`,
  `by`, `threshold`, `metricIds`).
- Strict candidate validation now requires non-empty editorial collections, a
  valid ISO timestamp or calendar date for each observation deadline, bilingual
  threshold prose, and cited metric IDs. Counts are minimum-based, not fixed.
- Published-read validation intentionally continues to accept the former
  bilingual-string risks and observations. The view model explicitly presents
  legacy risks as analyst notes and marks legacy observation thresholds and
  deadlines unavailable; this does not relax candidate validation.
- Updated narrative evidence review, fixture pipeline redaction, seed data,
  monthly archive projection, automation prompt, fixtures, and hash-bound
  brief generation. The brief payload carries structured observations and
  validates them in its embedded browser runtime.
- Updated both locale reader UIs: analyst notes are evidence items, risk cards
  show falsification conditions, and strict observation deadlines render as
  semantic Taipei-time `<time>` values with localized threshold prose. Archives
  preserve legacy analyst notes and show new falsification risks separately.
- Regenerated synchronized public/canonical market-brief assets from the
  legacy published current snapshot without editing `data/market/current.json`
  or any historical run.

## Test-first coverage

- Schema: strict/legacy boundary, missing deadline, missing threshold, cited
  fields, meaningful minimums, and variable editorial counts.
- View model: English and Chinese strict localization plus explicit legacy
  unavailable presentation.
- Review/pipeline: numerical claim checking across new fields and deterministic
  fixture normalization that preserves structural dates and metric IDs.
- Brief/UI/prompt: structured payload validation, flexible tag cardinality,
  browser fallback behavior, semantic dates, and automation instructions.

## Verification

- `npm run test:market` — 318 passing, 0 failing.
- `npm test` — 20 passing, 0 failing.
- `git diff --check` — clean before commit.

## Self-review

- Kept the strict candidate and historical published-read validation paths
  separate; no historical compatibility branch is reachable from candidate
  validation.
- Preserved deterministic review ordering, candidate hashing, matching-review
  promotion, and existing source/evidence gates.
- No known concerns. The generated brief assets contain an explicit legacy
  observation representation because the checked-in published snapshot remains
  intentionally unchanged.

## Fix round 1 takeover — 2026-09-01

Status: complete; one non-blocking HyperFrames file-size warning remains.

### RED evidence

- The inherited partial patch made the fixture pipeline fail before export with
  `Unexpected token x` because digit redaction corrupted numeric comparison
  values in JSON.
- The inherited HyperFrames/browser path timed out against the old fixed-slot
  validator/rendering contract; the brief tests also lacked coverage for a
  timestamp observation with no structural comparison.
- The brief generator still selected only the first observation per page, and
  the HyperFrames template still had three static observation and tag slots.

### Fixes delivered

- Strict candidate risks now require a bilingual condition, dated `by`, a
  cited `{ metricId, operator, value, unit, currency? }` comparison compatible
  with the metric, and a bilingual thesis consequence. The same structural
  contract is carried through seed fixtures, pipeline redaction, review
  evidence, view models, dashboard/archive UI, and automation instructions.
- Brief generation now retains every observation and tag. HyperFrames builds
  event and theme nodes from the payload at runtime, including nonuniform
  counts and counts above three; no static three-item assumption remains.
- `isMarketBriefPayload` groups timestamp/calendar-date validation before the
  comparison guard, with a regression test rejecting timestamp observations
  without `metricId`/comparison structure. Calendar-date validation is also
  deterministic in the browser validator.
- Canonical and public brief assets were regenerated and remain byte-identical;
  historical `data/market/*.json` files were not modified.

### GREEN evidence

- Focused schema/view-model/brief/pipeline/browser/end-to-end tests:
  **66 passing, 0 failing**.
- Automation/storage focused tests: **20 passing, 0 failing**.
- `npm run test:market`: **321 passing, 0 failing**.
- `npm run test`: build plus rendered HTML **20 passing, 0 failing**.
- `npm run check:hyperframes`: **0 errors, 0 runtime/layout/motion/contrast
  issues**; only the existing 715-line composition-size warning remains.
- `git diff --check`: clean.

### Self-review

- Confirmed no diff under `data/market`; the strict candidate path remains
  separate from legacy published-read compatibility.
- Confirmed generated `hyperframes/weekly-ai-market-brief/data.json` and
  `public/market-brief/data.json`, plus both HTML assets, are synchronized.
