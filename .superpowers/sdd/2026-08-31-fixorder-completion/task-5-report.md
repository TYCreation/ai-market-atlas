Status: complete
Commit: recorded in the Task 5 handoff commit
Subject: finish T12 evidence balance and stance accountability

Implemented directional stance enforcement for new candidates, with explicit changed-page and thesisMetricIds accountability for stance transitions. Added one-item supporting and opposing evidence floors for every page; /models and /sic starved reports are blocked while MISSING_OPPOSING_EVIDENCE remains blocking. Legacy published-read validation and defensive empty-section rendering remain unchanged.

Tests: focused schema/quality-gate tests pass; npm run test:market passes (325/325); npm run test passes (20/20).
Concerns: none identified.

Fix round 1 RED: focused tests exposed that stance transitions could pass on the transition alone, seed output bypassed evidence balance, archive `from` trusted candidate self-declaration, and previous-stance mismatches were accepted.
Fix round 1 GREEN: stance citations now require same-page IDs, changed supporting/opposing evidence, and a real current/prior metric delta; seed runs schema plus quality gates before writing; archive projection and gate use the trusted prior snapshot; legacy neutral fixture/read validation is restored.
Tests: focused gate/schema/seed/storage/export/monthly tests pass (98/98); npm run test:market passes (328/328); npm run test passes (20/20).
Concerns: none identified.

Fix round 2 RED: regressions showed metric A could change while changed evidence cited B, and as-of-only refreshes could satisfy stance causality; new metrics were rejected because prior absence was treated as no change.
Fix round 2 GREEN: stance causality now requires the same page/thesis metric ID in changed evidence plus numeric delta or trusted-prior absence; metadata-only refreshes cannot justify a transition.
Tests: focused quality-gate tests pass (42/42); npm run test:market passes (331/331); npm run test passes (20/20).
Concerns: none identified.
