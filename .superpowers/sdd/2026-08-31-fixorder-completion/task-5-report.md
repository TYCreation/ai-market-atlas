Status: complete
Commit: recorded in the Task 5 handoff commit
Subject: finish T12 evidence balance and stance accountability

Implemented directional stance enforcement for new candidates, with explicit changed-page and thesisMetricIds accountability for stance transitions. Added one-item supporting and opposing evidence floors for every page; /models and /sic starved reports are blocked while MISSING_OPPOSING_EVIDENCE remains blocking. Legacy published-read validation and defensive empty-section rendering remain unchanged.

Tests: focused schema/quality-gate tests pass; npm run test:market passes (325/325); npm run test passes (20/20).
Concerns: none identified.
