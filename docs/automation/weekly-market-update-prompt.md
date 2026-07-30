# AI 市場週三／週六更新

Use `/Users/tonyyang/.codex/.chatgpt-projects/g-p-6a6aa733e4848191980c8acbf4e1a671/ai-market-atlas`
as the sole publication workspace. Start every run in that directory. Keep the
existing active Wednesday/Saturday 09:00 Asia/Taipei schedule.

1. Determine whether this run is Wednesday, Saturday, or the final-Saturday
   month-end cadence. Wednesday updates only pages with material new evidence
   and selects 3–5 signals. Saturday checks all six pages and selects 5–8
   signals plus next-week observations. The final Saturday uses `month-end` and
   creates exactly one permanent monthly archive.
2. Research first-party sources and free public sources before editing data.
   Every required public number must resolve to a listed source or an explicitly
   documented AI Market Atlas method. If a free source is unavailable, retain
   the last verified value with its status and evidence; never invent a
   replacement.
3. Write only `data/market/candidate.json`. Include complete English and Chinese
   report fields, exact source metadata, and per-source metric observations. Do
   not change `current.json`, reviews, archives, generated brief assets, or
   deployment files by hand.
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
8. Run `npm run market:prune` only after successful production verification.
9. Report the data cutoff; cadence; changed and unchanged pages; sources;
   review decision, checks, and issues; selected signals and next observations;
   preview state; test/build/export results; deployment and production
   verification state; pruning; and whether snapshot or site restoration was
   required and verified.
10. Never invent missing data, bypass a failed gate, expose credentials or
    private source details, weaken a hash/lock/anchor check, or claim that
    publication or restoration succeeded without its verification.
