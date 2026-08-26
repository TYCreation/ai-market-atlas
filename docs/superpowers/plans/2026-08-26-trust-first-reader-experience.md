# Trust-First Reader Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make metric provenance, freshness, direction, dates, and the publication's value proposition immediately legible while preserving the existing visual identity.

**Architecture:** Freshness and provenance are computed in the market view model and passed as presentation-safe data. Small components render semantic timestamps and metric-kind labels. CSS tokens establish the type floor, and a built-site Playwright audit enforces first-viewport, text-size, target-size, and focus behavior.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, CSS custom properties, Playwright 1.54, Node test runner, vinext.

**Spec:** `docs/superpowers/specs/2026-08-26-trust-first-site-upgrade-design.md`

## Global Constraints

- Keep the dark cyan-and-amber palette, source chips, scored constraint cards, and bilingual editorial structure.
- No rendered text below 12px; body copy is 15-16px; Traditional Chinese line height is approximately 1.75.
- Dates display in Asia/Taipei and retain raw ISO values in `<time datetime>`.
- Market direction uses sign, glyph, and color; color is never the only signal.
- Internal run ids are absent from normal reader-visible HTML.
- Optional stale metrics do not fall back to hardcoded current-looking values.
- Keep `sources/` read-only and preserve unrelated working-tree changes.

---

## File map

- `market-data/view-model.ts`: presentation-safe provenance and optional stale metric views.
- `app/content.ts`: hydrate dashboards and stock rows from optional metric views.
- `app/components/MetricProvenance.tsx`: localized metric-kind and as-of rendering.
- `app/components/EditionStatus.tsx`: semantic edition timestamps without visible run ids.
- `app/components/SourcePanel.tsx`: semantic reviewed and source-publication timestamps.
- `app/components/ArchiveReport.tsx`: semantic archive cutoff without a visible run id.
- `app/components/MarketDelta.tsx`: sign/glyph/direction normalization.
- `app/components/MarketDashboard.tsx`: hero hierarchy, KPI provenance, and empty evidence behavior.
- `app/components/EquityMarketDeepDive.tsx`: optional quotes and directional cells.
- `app/globals.css`: type tokens, hero layout, provenance, delta, anchors, targets, focus, and empty-state styles.
- `tests/market-data/view-model.test.ts`: provenance and stale optional omission.
- `tests/rendered-html.test.mjs`: semantic output and absence of leaked ids.
- `tests/helpers/site-browser-runtime.mjs`: local HTTP adapter around the built vinext worker.
- `tests/readability.browser.test.mjs`: computed-size, viewport, target, and focus assertions.
- `package.json`: `test:readability` script.

### Task 1: Presentation-safe metric view model

**Files:**
- Modify: `market-data/view-model.ts`
- Modify: `app/content.ts`
- Test: `tests/market-data/view-model.test.ts`

**Interfaces:**
- Consumes: `evaluateMetricFreshness(metric, snapshot.dataCutoff)` from the publication-pipeline plan.
- Produces: `MetricView`, `getMetric(metricId, locale)`, `getKpi(...)`, and optional `getStockMetric(...)`.

- [ ] **Step 1: Write failing provenance and omission tests**

Add to `tests/market-data/view-model.test.ts`:

```ts
test("exposes presentation-safe metric provenance", () => {
  const view = createMarketViewModel(snapshot).getKpi("/", 0, "zh");
  assert.equal(view.kind, "atlas-model");
  assert.equal(view.asOf, snapshot.metrics[view.metricId].asOf);
  assert.equal(view.freshness, "current");
  assert.deepEqual(view.sourceIds, snapshot.metrics[view.metricId].sourceIds);
});

test("omits an optional stale stock observation", () => {
  const stale = structuredClone(snapshot);
  stale.metrics["stocks.nvda.price"].required = false;
  stale.metrics["stocks.nvda.price"].asOf = "2026-07-01T20:00:00.000Z";
  const view = createMarketViewModel(stale);
  assert.equal(view.getStockMetric("NVDA", "price", "en"), undefined);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --experimental-strip-types --test tests/market-data/view-model.test.ts`

Expected: FAIL because the view lacks provenance and never returns `undefined`.

- [ ] **Step 3: Add the view interfaces**

Use these exact public types:

```ts
export type MetricView = {
  metricId: string;
  value: string;
  sourceIds: string[];
  kind: "published-fact" | "market-observation" | "atlas-model";
  freshness: "current" | "dated";
  asOf: string;
  direction: "up" | "down" | "flat" | "not-applicable";
};
```

Map market-close policies to `market-observation`, modeled metrics to `atlas-model`, and other published metrics to `published-fact`. Required stale metrics should never reach a promoted current snapshot; optional stale metrics return `undefined` from `getMetric` and `getStockMetric`.

- [ ] **Step 4: Hydrate without stale hardcoded fallback values**

Extend KPI entries with `provenance?: MetricView`. For stock rows, store a `stockMetricViews` object whose price/week/month fields are `MetricView | undefined`, and render `"—"` when a view is absent. Do not retain the static price, week, or month strings as current-looking fallback values.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/market-data/view-model.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the view-model unit**

```bash
git add market-data/view-model.ts app/content.ts tests/market-data/view-model.test.ts
git commit -m "feat: expose metric freshness to the reader UI"
```

### Task 2: Semantic dates and metric-kind labels

**Files:**
- Create: `app/components/MetricProvenance.tsx`
- Modify: `app/components/EditionStatus.tsx`
- Modify: `app/components/SourcePanel.tsx`
- Modify: `app/components/ArchiveReport.tsx`
- Modify: `app/components/MarketDashboard.tsx`
- Modify: `app/components/EquityMarketDeepDive.tsx`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `MetricView` and `EditionMeta`.
- Produces: `MetricProvenance({ metric, locale })` and `TaipeiTime({ value, locale, includeTime? })`.

- [ ] **Step 1: Add failing semantic-output assertions**

In `tests/rendered-html.test.mjs`, assert the homepage contains:

```js
assert.match(html, /<time[^>]+dateTime="2026-[^"]+"/);
assert.match(html, /Atlas model|Atlas 模型/);
assert.doesNotMatch(html, /2026-\d\d-\d\d-(?:WEDNESDAY|SATURDAY|MONTH-END)/i);
assert.doesNotMatch(html, /class="edition-run"/);
```

Also assert the English page contains `Published fact`, `Market observation`, or `Atlas model` for each rendered metric type present in the fixture.

- [ ] **Step 2: Run the rendered suite and verify failure**

Run: `npm test`

Expected: FAIL because dates are plain spans, run ids are visible, and kind labels are absent.

- [ ] **Step 3: Implement semantic Taipei time**

`TaipeiTime` must format with `Intl.DateTimeFormat` using `timeZone: "Asia/Taipei"` and return:

```tsx
<time dateTime={value}>{formatted}</time>
```

Chinese uses `zh-TW`; English uses `en-US`. Edition status shows cadence, data cutoff,
verification time, and unchanged label, but removes both the visible run-id span and
reader-facing `data-run-id` attribute. Use the same component for `SourcePanel` reviewed
times and source publication times. `ArchiveReport` shows its cutoff through `TaipeiTime`
and removes the visible archive run id. Replace the dashboard footer run id with the
localized cadence and cutoff date.

- [ ] **Step 4: Implement metric-kind labels**

`MetricProvenance` copy is:

```ts
const labels = {
  zh: {
    "published-fact": "已發布資料",
    "market-observation": "市場觀測",
    "atlas-model": "Atlas 模型",
    asOf: "截至",
  },
  en: {
    "published-fact": "Published fact",
    "market-observation": "Market observation",
    "atlas-model": "Atlas model",
    asOf: "As of",
  },
} as const;
```

Render the kind and `TaipeiTime` beside every KPI and available stock price/return metric.

- [ ] **Step 5: Run the rendered suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit the semantic provenance unit**

```bash
git add app/components/MetricProvenance.tsx app/components/EditionStatus.tsx app/components/SourcePanel.tsx app/components/ArchiveReport.tsx app/components/MarketDashboard.tsx app/components/EquityMarketDeepDive.tsx tests/rendered-html.test.mjs
git commit -m "feat: label metric provenance and dates"
```

### Task 3: Directional market values

**Files:**
- Create: `app/components/MarketDelta.tsx`
- Modify: `app/components/MarketDashboard.tsx`
- Modify: `app/components/EquityMarketDeepDive.tsx`
- Modify: `app/globals.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `marketDirection(value)` and `MarketDelta({ value, className? })`.
- Consumes: localized display strings that may begin with `+`, `-`, `−`, `▲`, or `▼`.

- [ ] **Step 1: Add failing direction assertions**

Assert a positive and negative fixture value render both text and a hidden-independent glyph:

```js
assert.match(html, /class="market-delta positive"[^>]*>[^<]*<span aria-hidden="true">▲<\/span>/);
assert.match(html, /class="market-delta negative"[^>]*>[^<]*<span aria-hidden="true">▼<\/span>/);
```

- [ ] **Step 2: Run the rendered suite and verify failure**

Run: `npm test`

Expected: FAIL because values use color classes or signs without a consistent glyph component.

- [ ] **Step 3: Implement direction normalization**

`marketDirection(value)` returns `up`, `down`, or `flat` after trimming whitespace. `MarketDelta` keeps the original signed text and prepends `▲` or `▼` with `aria-hidden="true"`; flat values receive no glyph.

- [ ] **Step 4: Apply direction to KPI deltas and stock week/month cells**

Replace direct string rendering in both dashboard and equity table. Add `.market-delta.positive` and `.market-delta.negative`; use the existing green for gains and a cooler crimson `--red` distinct from `--orange`. Apply `font-variant-numeric: tabular-nums` and right-align numeric table columns.

- [ ] **Step 5: Run the rendered suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit the direction unit**

```bash
git add app/components/MarketDelta.tsx app/components/MarketDashboard.tsx app/components/EquityMarketDeepDive.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: make market direction unambiguous"
```

### Task 4: Hero, typography, anchors, focus, and target sizes

**Files:**
- Modify: `app/components/MarketDashboard.tsx`
- Modify: `app/globals.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: existing masthead markup and AtlasField.
- Produces: above-fold desktop editorial hierarchy and tokenized type/interaction rules.

- [ ] **Step 1: Define shared type tokens at `:root`**

Add:

```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: clamp(2rem, 5vw, 4.75rem);
}
```

Replace every literal `font-size` below 12px with `var(--text-xs)` or larger. Body copy uses `var(--text-base)` or `var(--text-md)`.

- [ ] **Step 2: Add locale-aware Traditional Chinese leading**

```css
:lang(zh-Hant) body {
  line-height: 1.75;
}

:lang(zh-Hant) .masthead-summary,
:lang(zh-Hant) .panel p,
:lang(zh-Hant) .watch-card p,
:lang(zh-Hant) .source-card p {
  font-size: var(--text-md);
  line-height: 1.75;
}
```

- [ ] **Step 3: Put the desktop hero copy in the first viewport**

Use a two-column masthead grid in which `.masthead-copy` occupies the primary column and `.atlas-field` is absolutely positioned or layered behind the composition. Preserve the mobile hierarchy. At 1440×900, the full `h1`, summary, edition lockup, and brief/source actions must end above `y = 900`.

- [ ] **Step 4: Fix anchors, focus, and targets**

Add:

```css
.section-head,
#sources,
#weekly-brief,
[id^="source-"] {
  scroll-margin-top: calc(var(--header-height) + 16px);
}

:where(a, button):focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}

.nav-link,
.brand,
.source-jump,
.brief-jump,
.footer-archive {
  min-height: 24px;
}
```

Keep stronger component-specific focus treatments only when they remain at least as visible.

- [ ] **Step 5: Ensure empty groups collapse**

Keep the evidence section conditional on `evidenceItems.length > 0`. Catalyst grids and archive groups must render no container when their array is empty; remove placeholder height or `min-height` rules that create blank panels.

- [ ] **Step 6: Run build and rendered tests**

```bash
npm test
git diff --check -- app/components/MarketDashboard.tsx app/globals.css
```

Expected: PASS and no whitespace errors.

- [ ] **Step 7: Commit the readability unit**

```bash
git add app/components/MarketDashboard.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: improve market brief readability"
```

### Task 5: Built-site readability regression test

**Files:**
- Create: `tests/helpers/site-browser-runtime.mjs`
- Create: `tests/readability.browser.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `withBuiltSite(callback)` and the `npm run test:readability` command.
- Consumes: `.vinext/server/index.js`, `.vinext/static`, and installed Playwright Chromium.

- [ ] **Step 1: Create a local built-worker HTTP runtime**

`withBuiltSite(callback)` must bind a random `127.0.0.1` port, translate each request into `worker.default.fetch`, serve asset bytes from `.vinext/static` through the same ASSETS contract used by `tests/rendered-html.test.mjs`, invoke `callback(origin)`, and close the server in `finally`.

- [ ] **Step 2: Write the failing browser audit**

Create `tests/readability.browser.test.mjs` with Playwright assertions at 1440×900 and 390×844:

```js
const sizes = await page.locator("body *").evaluateAll((elements) =>
  elements
    .filter((element) => element.childNodes.length > 0 && [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
    ))
    .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
);
assert.ok(Math.min(...sizes) >= 12);

const heading = await page.locator(".masthead h1").boundingBox();
assert.ok(heading && heading.y + heading.height <= 900);
```

Also evaluate `.nav-link`, `.brand`, `.source-jump`, `.brief-jump`, and `.footer-archive` boxes and require height at least 24px. Focus `.nav-link` and assert computed outline width is at least 2px and style is not `none`.

- [ ] **Step 3: Add the script and run it to verify failure**

Add to `package.json`:

```json
"test:readability": "npm run build && node --test tests/readability.browser.test.mjs"
```

Run: `npm run test:readability`

Expected before the final CSS corrections: FAIL with a sub-12px element, below-fold heading, undersized target, or missing outline.

- [ ] **Step 4: Fix each reported selector at its component rule**

Raise the reported selector to the appropriate type token or target padding. Do not add test-only CSS and do not exclude visible text from the census.

- [ ] **Step 5: Run the browser audit at both viewports**

Run: `npm run test:readability`

Expected: PASS for both desktop and mobile cases.

- [ ] **Step 6: Commit the regression harness**

```bash
git add tests/helpers/site-browser-runtime.mjs tests/readability.browser.test.mjs package.json app/globals.css
git commit -m "test: enforce reader-facing readability"
```

### Task 6: Full release rehearsal and production publication

**Files:**
- No hand-authored generated files.
- Consumes reviewed `data/market/candidate.json` and its persisted review.

**Interfaces:**
- Consumes: every prior plan deliverable.
- Produces: verified preview, promoted snapshot, verified production site, or verified restoration.

- [ ] **Step 1: Run all pre-publication checks**

```bash
npm run market:validate -- --candidate data/market/candidate.json
npm run market:review -- --candidate data/market/candidate.json --previous data/market/current.json --reviews-directory data/market/reviews
npm run market:brief -- --snapshot data/market/candidate.json
npm run test:market
npm test
npm run test:readability
npm run check:hyperframes
npm run market:export -- --snapshot data/market/candidate.json
```

Expected: every command PASS and the review decision remains `auto_publish` for the exact candidate hash.

- [ ] **Step 2: Inspect the export trust surfaces**

```bash
rg -n 'Atlas 模型|市場觀測|<time|rel="canonical"' work/pages-candidate/index.html work/pages-candidate/stocks/index.html
rg -n 'market-brief|<loc>' work/pages-candidate/sitemap.xml
```

Expected: provenance and semantic times are present, canonicals are singular, and the brief is absent from the sitemap.

- [ ] **Step 3: Publish only through the safe entry point**

Run: `npm run market:deploy`

Expected: preview verification succeeds, the reviewed candidate promotes, the exact artifact publishes, and production verification succeeds. If any post-promotion step fails, the command must report verified restoration of both snapshot and site.

- [ ] **Step 4: Verify production reader and crawl behavior**

```bash
curl -fsSI https://aimarketatlas.net/nonexistent-xyz
curl -fsS https://aimarketatlas.net/robots.txt
curl -fsS https://aimarketatlas.net/stocks/ | rg 'rel="canonical"|Atlas model|Atlas 模型|<time'
```

Expected: unknown route returns 404; robots has one wildcard group; stocks has a trailing-slash canonical, provenance labels, and semantic time markup.

- [ ] **Step 5: Record the release outcome**

Report the data cutoff, changed and unchanged pages, freshness and stagnation results, opposing-evidence coverage, preview result, production result, and whether restoration ran. Do not claim success without the production verification output.

- [ ] **Step 6: Gate the dated-brief follow-up**

Record this release as trust-check pass 1 of 2. Do not start permanent dated briefs until the next scheduled Wednesday or Saturday edition independently passes the same checks.
