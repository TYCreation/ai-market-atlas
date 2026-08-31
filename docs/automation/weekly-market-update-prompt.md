# AI 市場週三／週六更新

Use `/Volumes/2TB_Micron/Claude/web/ai-market-atlas`
as the sole publication workspace. Start every run in that directory. Keep the
existing active Wednesday/Saturday 09:00 Asia/Taipei schedule.

1. Determine whether this run is Wednesday, Saturday, or the final-Saturday
   month-end cadence. Wednesday updates only pages with material new evidence
   and selects 3–5 signals. Saturday checks all six pages and selects 5–8
   signals plus next-week observations. The final Saturday uses `month-end` and
   creates exactly one permanent monthly archive.
2. Research first-party sources and free public sources before editing data.
   Every required public number must resolve to a listed source or an explicitly
   documented AI Market Atlas method.

   If a free source is unavailable, retain the last observation only when it remains inside
   its code-owned freshness window. Otherwise mark the metric waiting and stop publication
   when it is required. Never present an expired or modeled replacement as current.
3. Write only `data/market/candidate.json`. Include complete English and Chinese
   report fields, exact source metadata, and per-source metric observations. Do
   not change `current.json`, reviews, archives, generated brief assets, or
   deployment files by hand.
   Every page on every edition must satisfy the editorial contract: re-examine its thesis
   against new supporting and opposing evidence; restate, sharpen, or explicitly explain why
   it survives unchanged; and include at least one
   cited `opposingEvidence` item with the metric IDs that support that item. Preserve methodological
   commentary in `report.analystNotes`; do not place it in `report.risks`. Every risk must be a
   bilingual `{ condition, by, comparison, consequence }` object: state the observable condition
   that would disprove or materially weaken the thesis, give ISO timestamp or calendar-date deadline,
   and include `{ metricId, operator, value, unit, currency? }` with a cited metric and
   compatible unit/currency. State the consequence for the thesis in both languages. Every
   `report.nextObservations` entry must be a bilingual
   `{ what, by, threshold, comparison, consequence }` object with the same explicit comparison:
   say what will be read, give a real deadline, state the threshold or reading that changes the
   thesis, cite its compatible metric comparison, and state the bilingual thesis consequence. Do not use fixed counts;
   provide at least one analyst note, falsifiable risk, and dated threshold observation for each
   page. Use a directional
   `thesisStance` only when the evidence supports it; a neutral stance is
   valid when the evidence does not support a directional conclusion. A restated or sharpened
   thesis must set `changed` to `true`, add the exact `thesis-reexamined-restated` change reason,
   and cite its supporting `thesisMetricIds`. A thesis that survives unchanged—including on a
   page changed for another reason—must include an argued bilingual
   `report.thesisSurvivalRationale` with cited `metricIds`.
4. Run `npm run market:validate -- --candidate data/market/candidate.json`.
5. Run
   `npm run market:review -- --candidate data/market/candidate.json --previous data/market/current.json --reviews-directory data/market/reviews`.
   Persist the complete review report. If its decision is not `auto_publish`,
   stop and report every check and issue; do not promote, build, export, deploy,
   or prune.
6. Only after `auto_publish`, run:
   `npm run market:brief -- --snapshot data/market/candidate.json`,
   `npm run test:market`, `npm test`, `npm run build`, and
   `npm run market:export -- --snapshot data/market/candidate.json`.
7. Run `npm run market:deploy`. This command verifies preview, promotes the
   reviewed candidate, publishes production, verifies production, and restores
   both the prior snapshot and last-known-good site if a post-promotion step
   fails. Never bypass or reproduce these steps manually.
8. Retain accepted weekly run and review provenance indefinitely; do not invoke
   `npm run market:prune` as part of publication.
9. Report the data cutoff; cadence; changed and unchanged pages; sources;
   review decision, checks, and issues; selected signals and next observations;
   preview state; test/build/export results; deployment and production
   verification state; provenance retention; and whether snapshot or site restoration was
   required and verified. The final report must also list the authoritative workspace
   path, freshness failures (including `STALE_REQUIRED_METRIC` and
   `STALE_OPTIONAL_METRIC`), stagnation warnings (including `METRIC_STAGNATION` and
   `NARRATIVE_STAGNATION`), modeled-presentation failures
   (`MODELED_MARKET_PRESENTATION`), `opposingEvidence` coverage for every page, and
   changed versus retained theses and stances.
10. Never invent missing data, bypass a failed gate, expose credentials or
    private source details, weaken a hash/lock/anchor check, or claim that
    publication or restoration succeeded without its verification.
