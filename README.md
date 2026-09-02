# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Weekly AI Market Publishing

The scheduled workflow is defined in
[`docs/automation/weekly-market-update-prompt.md`](docs/automation/weekly-market-update-prompt.md).
It runs Wednesday and Saturday at 09:00 Asia/Taipei. The final Saturday of a
month uses the `month-end` cadence.

### Candidate and source policy

Research first, then write only `data/market/candidate.json`. A candidate must
contain one normalized bilingual record for every page and metric:

- English and Chinese report fields share the same numeric metric records.
- Every metric lists its source IDs and one observation per supporting source.
- Public figures use first-party or free public sources whenever available.
- Atlas-modeled values identify `atlas-model` and explain their method.
- If a free source is unavailable, retain the last observation only when it remains inside
  its code-owned freshness window. Otherwise mark the metric waiting and stop publication
  when it is required. Never present an expired or modeled replacement as current.
- Wednesday marks only materially changed pages and supplies 3–5 key signals.
  Saturday checks all six pages and supplies 5–8 signals plus next-week
  observations.

### Per-page editorial contract

Before writing a candidate, the scheduled researcher re-examines every page thesis on
every edition against new supporting and opposing evidence, then restates, sharpens, or
explicitly explains why that thesis survives unchanged. Each page must include at least
one cited `opposingEvidence` item with the
metric IDs that support the observation. Each risk must state an observable, falsifiable
metric, event, or time-based condition that could disprove or materially weaken the
thesis; a risk that only gives methodological advice is not sufficient. Every newly authored
page must take a directional `thesisStance` (`bullish` or `bearish`); `neutral` is retained only
for legacy published snapshots. If a stance changes, mark the page `changed` and cite the thesis
metrics that drove it in `thesisMetricIds`. Mark a page `changed` when an evidenced thesis or stance
revision occurs. A restated or sharpened thesis must use the exact
`thesis-reexamined-restated` change reason and cite its `thesisMetricIds`. A thesis that
survives unchanged, including on a page changed for another reason, must include an argued
bilingual `report.thesisSurvivalRationale` with cited `metricIds`.
Every page must publish at least one cited supporting and one cited opposing evidence item; this
floor blocks evidence-starved `/models` and `/sic` reports.

Paid data can be added later by implementing the existing source-adapter
boundary in `market-data/adapters/`. A paid adapter may collect candidate data,
but it must produce the same snapshot/source/observation contract and pass the
same validation and review gates. Credentials and private response details must
never enter snapshots, reviews, logs, or reports.

### Validate and review locally

The one-time seed command runs the same schema and editorial quality gate before
writing its output; it cannot create a publishable snapshot with starved evidence.

```bash
npm run market:validate -- --candidate data/market/candidate.json
npm run market:review -- \
  --candidate data/market/candidate.json \
  --previous data/market/current.json \
  --reviews-directory data/market/reviews
```

Review normalizes the candidate and persists
`data/market/reviews/<runId>.json`. Only a complete `auto_publish` review whose
SHA-256 matches the exact normalized candidate can proceed. `manual_review`
means an operator must resolve the listed conflicts or evidence questions;
`reject` means a required integrity, source, session, or schema rule failed.
Both outcomes stop automatically—do not promote or bypass a failed check.

The final run report must list the authoritative workspace path
(`/Volumes/2TB_Micron/Claude/web/ai-market-atlas`), freshness failures (including
`STALE_REQUIRED_METRIC` and `STALE_OPTIONAL_METRIC`), stagnation warnings (including
`METRIC_STAGNATION` and `NARRATIVE_STAGNATION`), modeled-presentation failures
(`MODELED_MARKET_PRESENTATION`), `opposingEvidence` coverage for every page, and
changed versus retained theses and stances, alongside the existing cutoff,
cadence, source, review, signal, preview, build, export, deployment, production,
pruning, and restoration results.

For a fully isolated no-deployment rehearsal, use
`runFixturePipeline()` from `market-data/pipeline.ts`. It copies the application
into a temporary workspace, reviews and promotes there, generates the brief,
builds, and exports, always returning `deploymentAttempted: false`.

### Brief, preview, and static export

After automated approval:

```bash
npm run market:brief -- --snapshot data/market/candidate.json
npm run test:market
npm test
npm run check:hyperframes
npm run market:export -- --snapshot data/market/candidate.json
```

The export in `work/pages-candidate` contains `/`, all five topic routes,
`/archive`, every retained `/archive/YYYY-MM`, and `/market-brief/` with its
canonical `data.json`. It also contains the permanent `/rss.xml`, recent-brief
`/news-sitemap.xml`, and `/llms.txt` discovery artifacts. The export manifest
binds the candidate, artifact tree, route identities, sources, discovery
artifacts, and brief payload. Preview and production must use these exact bytes.

Release endpoint verification must also be bound to the reviewed manifest hash:

```bash
npm run market:release:verify -- \
  --base-url https://preview.example.workers.dev \
  --manifest work/pages-candidate/.market-deployment.json \
  --expected-manifest-sha256 <reviewed-manifest-sha256> \
  --newsletter disabled
```

The `--newsletter` value is mandatory and must be exactly `enabled` or
`disabled`; use `enabled` only when the reviewed endpoint is configured.

Use the reviewed SHA-256 captured from the approved export/review checkpoint for
preview and production. The local `npm run market:pages:rehearse` command may
compute a rehearsal-only hash from the local candidate tree, but that value does
not replace the reviewed production hash.

### Promotion, archives, and retention

Promotion is allowed only through the reviewed storage gate. It first archives
the prior snapshot, then atomically switches `current.json`. Weekly run
snapshots and their review reports are retained indefinitely because dated URLs
depend on their accepted provenance.

A final-Saturday `month-end` candidate creates exactly one permanent
`/archive/YYYY-MM` record. Monthly records retain their complete public source
cards and automated review and are not removed by weekly retention.

### Production deployment and restoration

```bash
npm run market:deploy
```

This is the only production entry point. It authorizes the persisted review,
exports the candidate, deploys and verifies an isolated preview, promotes the
snapshot, deploys the same artifact to production, and verifies every route and
the canonical market-brief JSON. A publication lock prevents concurrent runs.

If any post-promotion step fails, the command restores the authenticated prior
snapshot and redeploys the independently anchored last-known-good directory.
Both restoration results are reported separately. Never delete the lock,
last-good anchor, transition record, backup, or run archive while a command is
active. On restart, an interrupted last-good transition either restores the
directory matching the old anchor or retains the current directory matching the
new anchor; ambiguous state fails closed for operator investigation.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
