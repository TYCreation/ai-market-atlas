# Task 3 report — T10 thesis re-examination contract

## Result

Implemented the thesis re-examination contract. New candidates must
either include a cited bilingual `report.thesisSurvivalRationale` when their thesis
survives unchanged, or declare a material thesis rewrite with `changed: true`, the
exact `thesis-reexamined-restated` reason, and source-backed `thesisMetricIds`.

Historical snapshots were not rewritten. A published-snapshot validator preserves
their readability while candidate intake, normalization, review, authorization, and
candidate export remain strict.

## Inherited partial state

The takeover began with an uncommitted partial diff across the prompt, schema,
quality gate, review evidence, types, fixtures, and tests. Initial focused validation
was green:

```text
node --experimental-strip-types --test tests/market-data/schema.test.ts \
  tests/market-data/review.test.ts tests/market-data/quality-gate.test.ts \
  tests/market-data/automation-prompt.test.ts
60 passed, 0 failed
```

The first complete `npm run test:market` run found 34 failures: existing
current/archive snapshots were incorrectly being treated as newly authored candidates.
Subsequent focused runs also exposed the fixture pipeline's numeric-text masking of
the newly added rationale metric IDs and the seed script's missing rationale.

## Completed changes

- Added the exact `thesis-reexamined-restated` change reason and optional structured
  `thesisSurvivalRationale` type.
- Updated schema validation for strict new candidates, including bilingual rationale
  text, cited/source-backed metric IDs, and restatement `changed`/evidence invariants.
- Added `assertPublishedMarketSnapshot` for legacy published records; updated only
  persisted-snapshot readers to use it. No historical JSON was changed.
- Updated quality-gate material-change logic so restatements are evidence-bearing,
  unmarked rewrites remain blocked, and unchanged theses require a rationale even if
  the page changed for another reason.
- Included rationale citations in narrative-evidence review.
- Updated the scheduled prompt, README, deterministic fixtures, seed output, and
  fixture pipeline handling.
- Added tests for valid restatement, unmarked rewrite, missing rationale, missing
  rationale on an otherwise changed page, restatement missing `changed` or thesis
  metrics, historical-read compatibility, prompt instructions, and review rejection.

## Verification

```text
Focused schema/review/quality/prompt tests: 64 passed, 0 failed
npm run test:market:                    311 passed, 0 failed
npm test:                                20 passed, 0 failed
git diff --check:                        clean
```

## Self-review

- Checked the exact reason spelling in type, schema, quality gate, docs, prompt, and
  fixtures.
- Confirmed survival rationale is checked based on thesis equality rather than page
  `changed`, so other content changes cannot bypass it.
- Confirmed restatement is a valid page-change evidence path only with the exact
  reason, an actual thesis rewrite, and cited thesis metrics.
- Confirmed only published-snapshot read paths relaxed the missing field; candidate
  validation paths remain strict.

## Concerns

`npm run lint` passes with two pre-existing warnings in `market-data/freshness.ts`
and `market-data/storage.ts`; this task introduced no lint warnings. The static prompt
test is intentionally lightweight; behavioral enforcement is covered by schema,
review, quality-gate, pipeline, storage, export, and end-to-end tests.
