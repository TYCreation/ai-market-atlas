# AI Market Atlas Trust-First Site Upgrade

**Date:** 2026-08-26  
**Status:** Approved design  
**Authoritative workspace:** `/Volumes/2TB_Micron/Claude/web/ai-market-atlas`

## Objective

Upgrade aimarketatlas.net around reader trust before expanding its indexed footprint.
The release will ensure that current-looking metrics are actually current, that every
published thesis acknowledges opposing evidence, and that readers can quickly distinguish
published facts, market observations, and Atlas-modeled estimates. It will also complete
the technical SEO work already in progress and fix the most consequential readability and
accessibility problems without replacing the site's established visual identity.

## Product decisions

- Reader trust and fresh data are the first-release priority.
- The release must not require a paid data subscription.
- The existing dark cyan-and-amber editorial identity stays.
- Source chips, scored constraint cards, bilingual reports, hash-authorized reviews,
  source-health checks, atomic promotion, production verification, and rollback stay.
- Permanent dated briefs, entity pages, feeds, and newsletter capture are deferred until
  two consecutive scheduled editions pass the new trust checks.
- The volume workspace is the publishing source of truth. The scheduled publisher must
  be aligned to it before production publication resumes.

## Scope

### Included

1. Complete the in-progress technical correctness work:
   - a real noindexed 404;
   - trailing-slash canonicals and hreflang values;
   - canonicals emitted through page metadata rather than export-time string injection;
   - removal of the thin HyperFrames deck from the sitemap and addition of `noindex`;
   - crawler and snippet metadata suitable for search and answer-engine retrieval.
2. Add catalog-controlled freshness policies and review checks.
3. Require cited opposing evidence for every page thesis.
4. Detect prolonged metric and narrative stagnation.
5. Prevent modeled values from using verified market-quote presentation.
6. Update the scheduled research prompt and its authoritative workspace path.
7. Improve the hero, type scale, timestamps, metric provenance, market deltas, empty
   states, anchors, focus states, and touch targets.
8. Verify the complete publication path and deploy through the existing safe workflow.

### Excluded

- Dated `/brief/<date>/` pages and their export pipeline.
- Evergreen pillar and entity pages.
- RSS, Atom, or JSON feeds.
- Newsletter signup and subscriber storage.
- A paid market-data provider.
- A wholesale visual redesign or replacement of the current component identity.

## Trust architecture

The publication flow remains linear and fail-closed:

```text
first-party and free public evidence
  -> candidate snapshot
  -> schema and session validation
  -> freshness, evidence, source, anomaly, and integrity review
  -> hash-authorized promotion
  -> build and static export
  -> preview verification
  -> production publication and verification
  -> rollback on any post-promotion failure
```

The new logic extends the existing review harness. It does not introduce a second
publication path and does not weaken locks, hashes, source checks, deployment manifests,
or restoration behavior.

## Freshness model

Freshness policy belongs to the metric catalog, not to agent-authored candidate data. This
prevents a candidate from relaxing its own expiration rules and avoids duplicating policy
through every snapshot. Every required metric id must resolve to exactly one policy.

The supported classes are:

| Class | Intended data | Currentness rule | Presentation |
| --- | --- | --- | --- |
| Market close | Prices and market-derived returns | At most two completed trading days old | Market observation + as-of time |
| Weekly | Weekly operating or market series | At most eight days old | Current weekly observation + as-of date |
| Periodic | Filings, earnings, and scheduled official releases | Valid through its next expected release window | Published fact + reporting period |
| Event-driven | Announcements and facts without a fixed cadence | Retained as a dated fact, never described as live | Published fact + event date |
| Atlas model | Reproducible Atlas estimates | Recomputed within the policy's declared interval | Atlas model + method/source + as-of date |

The catalog will expose a small, typed policy interface used by review and view-model code.
Periodic and event-driven records are not stale merely because their value does not move;
their dated presentation carries the necessary truth. Current market and weekly surfaces
cannot silently carry an expired value forward.

### Required and optional behavior

- A stale required current metric emits a blocking `STALE_REQUIRED_METRIC` issue.
- A stale optional metric emits a warning and is excluded from current-facing view models.
- A required metric that cannot be refreshed remains `waiting` and prevents publication
  under the existing required-data rules.
- Historical published facts remain available with their original as-of dates.
- No missing value is guessed, fabricated, or replaced with an unlabeled model output.

### Stagnation

Freshness and stagnation are separate signals. An unchanged value with a newly verified
as-of date may be legitimate; an unchanged old as-of date is stale.

- A weekly or market value that remains numerically unchanged for three consecutive
  editions produces a `METRIC_STAGNATION` review warning for operator attention.
- Thesis/report language that remains byte-identical for three consecutive editions
  produces a `NARRATIVE_STAGNATION` warning.
- Stagnation warnings do not block by themselves, avoiding false failures on legitimately
  flat series. Existing freshness and evidence rules remain the blocking controls.

## Editorial evidence contract

Every page must publish at least one opposing-evidence item. Each item must retain the
existing bilingual text and metric-id citations, so numeric-claim validation and source
tracing continue to apply. Missing opposing evidence is a blocking review issue.
The issue code is `MISSING_OPPOSING_EVIDENCE`.

The scheduled prompt will require the researcher to:

1. re-examine each page thesis against newly gathered evidence;
2. restate, sharpen, or explicitly retain the thesis;
3. record at least one cited observation that cuts against the thesis;
4. distinguish actual falsifiers from methodological advice in the risk section;
5. use a directional stance only when supported, rather than forcing every thesis out of
   `neutral`;
6. mark pages changed when an evidenced thesis revision requires it.

The integrity rule that blocks silent report changes remains. The prompt and change-reason
model will make deliberate, evidenced thesis updates compatible with that rule.

## Modeled and market data

The release does not require an API key or paid source. Scheduled research continues to
use first-party and free public sources and records exact source metadata and per-source
observations in the candidate.

If a reliable fresh quote cannot be obtained, the quote is unavailable; it is not carried
forward as current. A modeled metric must identify the Atlas method and cannot carry
exchange-session, primary-listing, or verified-quote furniture. Schema and review rules
will enforce this separation through `MODELED_MARKET_PRESENTATION`.

The existing adapter boundary remains available for a future free or paid provider, but
provider integration is not a prerequisite for truthful publication.

## Reader-facing design

### First viewport

The desktop hero will adopt the successful mobile hierarchy. The headline, summary,
edition date, trust label, and 30-second-brief action appear above the fold. The
constellation remains as a background layer rather than occupying the first viewport by
itself.

### Typography

Literal font sizes will be consolidated into shared type tokens before the scale changes.
No rendered text may be smaller than 12px. Body copy targets 15-16px. Traditional Chinese
receives a locale-aware size adjustment where needed and approximately 1.75 line height.
The existing contrast-positive palette is retained.

### Metric provenance

Presentation-safe metric metadata will flow through the view model rather than being
computed in React components. KPI and stock-metric views will expose:

- metric kind label: Published fact, Market observation, or Atlas model;
- currentness state;
- localized as-of label and raw timestamp;
- source ids;
- directional value metadata where relevant.

Small reusable components will render the provenance label and timestamp consistently.

### Dates and identifiers

Reader-visible timestamps use Asia/Taipei local time and human forms such as
`2026/08/26 09:00`. Raw ISO timestamps remain in semantic `<time datetime="...">`
attributes. Internal run ids are removed from the normal interface and remain available
only through provenance or operational artifacts.

### Market direction

Market deltas retain their sign and add an upward or downward glyph. Gains and losses use
separated semantic colors, while orange remains reserved for constraint status. Direction
never relies on hue alone. Delta columns are right-aligned and use tabular numerals.

### Empty states and accessibility

- Empty evidence or catalyst groups do not reserve blank containers.
- Anchor targets receive sticky-header scroll margin.
- Keyboard focus indicators use a visible cyan treatment with adequate area and contrast.
- Interactive targets meet the 24px WCAG 2.2 minimum, with larger touch sizing where the
  layout permits.

## Technical SEO completion

The release will finish the changes already present in the working tree rather than
reimplementing them. Acceptance requires:

- unknown URLs return an HTTP 404 with `noindex` and no canonical;
- every indexable route declares one trailing-slash canonical through the metadata API;
- canonical, hreflang, and sitemap URLs name the address the server actually serves;
- `/market-brief/` remains deploy-verified but is absent from the sitemap and carries
  `noindex`;
- search pages emit Discover-eligible image/snippet directives;
- crawler policy is explicit and contains no conflicting wildcard groups after the
  corresponding Cloudflare setting is aligned.

## Failure handling

All new trust checks are part of the existing automated review. A failure cannot be
bypassed by build or deployment code.

- Schema, opposing-evidence, modeled-presentation, or required-freshness failures prevent
  an `auto_publish` decision and stop the candidate before promotion.
- Optional stale data is omitted from current-facing views and reported as a warning.
- Source, build, export, preview, publication, or production verification failures follow
  existing fail-closed and restoration behavior.
- The last verified site remains online when a candidate fails before promotion.
- A post-promotion failure restores both the authenticated prior snapshot and the
  independently anchored last-known-good site.

## Verification strategy

### Unit and fixture coverage

Add deterministic fixtures and tests for:

- each freshness class at, below, and above its boundary;
- stale required and optional metrics;
- trading-day rather than naive calendar-day age for market observations;
- legitimate unchanged values with a new as-of date;
- prolonged metric and narrative stagnation;
- missing and cited opposing evidence;
- modeled metrics with forbidden market fields;
- view-model omission and provenance metadata;
- Taipei timestamp formatting and directional delta metadata.

### Rendered and browser coverage

Rendered-HTML and browser checks will assert:

- one canonical per indexable route and none on the 404;
- correct 404 status and robots metadata;
- explicit metric-kind labels and semantic time elements;
- no visible internal run id;
- collapsed empty groups;
- a 12px minimum computed text size;
- the desktop headline appears within the first viewport;
- visible focus styles and compliant target sizes;
- directional delta glyphs and sign text.

### Pipeline and deployment coverage

Run the existing market unit suite, rendered-site suite, build, HyperFrames check, export,
manifest verification, and isolated publication rehearsal. Production publication uses
only the existing deployment entry point: preview, verify, promote, publish, verify, and
restore on failure.

## Rollout

1. Align the scheduled prompt to the authoritative workspace.
2. Complete and verify the in-progress technical SEO changes.
3. Implement freshness and editorial evidence policies with fixtures before changing the
   UI.
4. Update the prompt and migrate the current candidate/data needed to satisfy the new
   checks.
5. Extend the view model and apply reader-facing design changes.
6. Run all local and isolated pipeline verification.
7. Deploy through the safe publication path and smoke-test production.
8. Require two consecutive scheduled editions to pass the trust checks before beginning
   permanent dated-brief work.

## Success criteria

- Every required current metric passes its catalog freshness policy.
- Every page contains at least one cited opposing-evidence item.
- No modeled value appears as an exchange-verified market quote.
- No rendered text is below 12px, and the desktop headline is visible in the first
  viewport.
- Reader-visible dates are localized while machine-readable timestamps remain intact.
- Technical SEO correctness and production rollback guarantees remain verified.
- Two consecutive scheduled editions can pass without weakening or bypassing a trust
  check.
