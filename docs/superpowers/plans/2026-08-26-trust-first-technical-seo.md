# Trust-First Technical SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the partially implemented crawl, canonical, sitemap, and 404 corrections without disturbing the current market-data work.

**Architecture:** Page-owned Next metadata is the only source of indexable-route canonicals. The static exporter verifies those tags, localizes the root language, writes a dedicated 404 artifact, and keeps deploy verification separate from sitemap inclusion.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, vinext, Cloudflare Pages, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-trust-first-site-upgrade-design.md`

## Global Constraints

- Preserve all pre-existing working-tree changes; stage only the files named by each task.
- Treat `sources/` as read-only.
- Keep trailing slashes in canonical, hreflang, and sitemap URLs.
- Keep `/market-brief/` in deployment verification but out of the sitemap and marked `noindex`.
- Keep the 404 out of the sitemap and free of canonical metadata.
- Do not weaken export manifest, hash, route-identity, or rollback assertions.
- Do not deploy production from this plan; deployment happens after the reader-experience plan.

---

## File map

- `app/seo.ts`: shared canonical, hreflang, robots, Open Graph, and Twitter metadata.
- `app/not-found.tsx`: bilingual noindexed not-found surface.
- `app/archive/[month]/page.tsx`: Chinese archive-detail canonical route override.
- `app/en/archive/[month]/page.tsx`: English archive-detail canonical route override.
- `scripts/export-pages.ts`: export verification, localized `<html lang>`, 404 artifact, sitemap membership, brief `noindex`, and robots.txt.
- `tests/rendered-html.test.mjs`: page-owned metadata and not-found behavior.
- `tests/market-data/export-pages.test.ts`: exported artifact and sitemap assertions.

### Task 1: Page-owned canonical and not-found metadata

**Files:**
- Create: `app/not-found.tsx`
- Modify: `app/seo.ts`
- Modify: `app/archive/[month]/page.tsx`
- Modify: `app/en/archive/[month]/page.tsx`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `buildMetadata(path, options)` and `buildEnglishMetadata(path, options)`.
- Produces: metadata builders accepting `options.route?: string`, one canonical per indexable route, and a noindexed 404 without a canonical.

- [ ] **Step 1: Preserve and inspect the in-progress implementation**

Run:

```bash
git diff -- app/seo.ts 'app/archive/[month]/page.tsx' 'app/en/archive/[month]/page.tsx' app/not-found.tsx tests/rendered-html.test.mjs
```

Expected: the working tree already contains some or all of the intended metadata and 404 changes. Retain them and edit only where the tests below expose a gap.

- [ ] **Step 2: Add or retain the focused failing rendered tests**

Ensure `tests/rendered-html.test.mjs` contains these assertions:

```js
test("unknown paths render a noindexed 404 rather than the homepage", async () => {
  const response = await render("/nonexistent-xyz");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /找不到這個頁面/);
  assert.match(html, /content="noindex"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("indexable routes declare one trailing-slash canonical", async () => {
  for (const [pathname, canonical] of new Map([
    ["/", "https://aimarketatlas.net/"],
    ["/stocks", "https://aimarketatlas.net/stocks/"],
    ["/archive/2026-07", "https://aimarketatlas.net/archive/2026-07/"],
    ["/en", "https://aimarketatlas.net/en/"],
    ["/en/stocks", "https://aimarketatlas.net/en/stocks/"],
  ])) {
    const html = await (await render(pathname)).text();
    const links = html.match(/<link\b[^>]*\brel="canonical"[^>]*>/g) ?? [];
    assert.equal(links.length, 1, pathname);
    assert.match(links[0], new RegExp(`href="${canonical}"`), pathname);
  }
});
```

- [ ] **Step 3: Run the rendered suite to expose remaining gaps**

Run: `npm test`

Expected on an incomplete working tree: FAIL on the 404 status, missing canonical, duplicate canonical, or slashless archive detail. If all focused assertions pass, continue with the existing implementation after reviewing its diff.

- [ ] **Step 4: Complete the shared metadata helpers**

Use these interfaces in `app/seo.ts`:

```ts
function withTrailingSlash(path: string): string {
  return path === "/" ? "/" : path.endsWith("/") ? path : `${path}/`;
}

function languageAlternates(route: string) {
  const zh = withTrailingSlash(route);
  const en = withTrailingSlash(route === "/" ? "/en" : `/en${route}`);
  return { "zh-Hant": zh, en, "x-default": zh };
}
```

Both metadata builders must return `robots`, `alternates.canonical`, and `alternates.languages`. Archive-detail pages must pass their full route through `options.route` so `/archive/2026-07/` does not canonicalize to `/archive/`.

- [ ] **Step 5: Complete the bilingual 404**

`app/not-found.tsx` must export noindexed metadata and render links to `/`, `/en/`, and `/archive/`:

```ts
export const metadata: Metadata = {
  title: { absolute: `找不到頁面 Page not found｜${SITE_NAME}` },
  description: "The requested page does not exist on AI Market Atlas.",
  robots: { index: false, follow: true },
};
```

- [ ] **Step 6: Run the rendered tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit only the metadata unit**

```bash
git add app/seo.ts app/not-found.tsx 'app/archive/[month]/page.tsx' 'app/en/archive/[month]/page.tsx' tests/rendered-html.test.mjs
git commit -m "fix: emit stable canonical and 404 metadata"
```

### Task 2: Export artifact correctness

**Files:**
- Modify: `scripts/export-pages.ts`
- Test: `tests/market-data/export-pages.test.ts`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: page-owned canonical metadata from Task 1.
- Produces: `assertSingleCanonical(html, route)`, `localizeHtmlLang(html, route)`, `404.html`, distinct `routes` and `sitemapRoutes`, a noindexed brief, and explicit robots content signals.

- [ ] **Step 1: Add exported-artifact assertions**

In `tests/market-data/export-pages.test.ts`, assert the output contract after `exportPages(...)`:

```ts
const notFound = await readFile(join(outputDirectory, "404.html"), "utf8");
assert.match(notFound, /content="noindex"/);
assert.doesNotMatch(notFound, /rel="canonical"/);

const sitemap = await readFile(join(outputDirectory, "sitemap.xml"), "utf8");
assert.doesNotMatch(sitemap, /market-brief/);
assert.match(sitemap, /https:\/\/aimarketatlas\.net\/stocks\//);

const brief = await readFile(join(outputDirectory, "market-brief", "index.html"), "utf8");
assert.match(brief, /name="robots" content="noindex, follow"/);
```

- [ ] **Step 2: Run the focused export test**

Run: `node --experimental-strip-types --test tests/market-data/export-pages.test.ts`

Expected on an incomplete exporter: FAIL for missing `404.html`, brief sitemap membership, or missing `noindex`.

- [ ] **Step 3: Separate render verification from sitemap membership**

Keep these two collections distinct in `scripts/export-pages.ts`:

```ts
const renderedRoutes = [
  ...CURRENT_ROUTES,
  ...EN_CURRENT_ROUTES,
  "/archive",
  "/en/archive",
  ...archiveMonths.map((month) => `/archive/${month}`),
  ...archiveMonths.map((month) => `/en/archive/${month}`),
];
const routes = [...renderedRoutes, "/market-brief/"];
const sitemapRoutes = renderedRoutes;
```

`manifest.routes` and `routeIdentities` continue verifying the brief. Only `sitemapRoutes` feeds `sitemapXml()`.

- [ ] **Step 4: Verify page-owned canonicals and write the not-found artifact**

For every rendered route, call `assertSingleCanonical(rendered, route)` and only then localize English `<html lang>`. Fetch an unknown UUID route from the built worker, require status 404, reject canonical metadata, and write its body to `404.html`.

- [ ] **Step 5: Inject static-brief head tags and explicit robots policy**

The copied static brief must receive exactly:

```html
<meta name="robots" content="noindex, follow"/>
<link rel="canonical" href="https://aimarketatlas.net/market-brief/"/>
```

Generate `robots.txt` as:

```text
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference
Allow: /

Sitemap: https://aimarketatlas.net/sitemap.xml
```

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
node --experimental-strip-types --test tests/market-data/export-pages.test.ts
npm test
npm run market:export
```

Expected: all commands PASS; `work/pages-candidate/404.html` exists; `/market-brief/` is absent from the sitemap and present in the deployment manifest.

- [ ] **Step 7: Commit the exporter unit**

```bash
git add scripts/export-pages.ts tests/market-data/export-pages.test.ts tests/rendered-html.test.mjs
git commit -m "fix: separate crawl routes from deploy verification"
```

### Task 3: Technical baseline verification

**Files:**
- Modify only if verification exposes a defect: files from Tasks 1-2.

**Interfaces:**
- Consumes: completed metadata and export behavior.
- Produces: a green technical baseline for the publication-trust plan.

- [ ] **Step 1: Run every code-level baseline check**

```bash
npm run test:market
npm test
npm run check:hyperframes
npm run market:export
git diff --check
```

Expected: every command PASS and `git diff --check` emits no output.

- [ ] **Step 2: Inspect the candidate export directly**

```bash
rg -n 'rel="canonical"|name="robots"' work/pages-candidate/stocks/index.html work/pages-candidate/404.html work/pages-candidate/market-brief/index.html
rg -n 'market-brief|<loc>' work/pages-candidate/sitemap.xml
```

Expected: one canonical on stocks, no canonical and `noindex` on the 404, `noindex` on the brief, and no brief URL in the sitemap.

- [ ] **Step 3: Commit a verification fix only if one was necessary**

Stage only the named file and its test, then use:

```bash
git commit -m "test: close technical SEO verification gap"
```

If no fix was necessary, do not create an empty commit.

### Task 4: Cloudflare crawl-control alignment

**Files:**
- No repository files.

**Interfaces:**
- Consumes: the repository-generated robots policy.
- Produces: one non-conflicting live wildcard group and retrieval behavior that matches the approved policy.

- [ ] **Step 1: Disable Cloudflare's managed blanket AI crawler block**

In the aimarketatlas.net Cloudflare dashboard, turn off the managed rule that prepends eight `Disallow: /` groups. If the owner wants training blocked, keep only the provider-specific training bot rule; do not block `OAI-SearchBot`, `ClaudeBot`, `Googlebot`, or `Applebot-Extended` from retrieval.

- [ ] **Step 2: Verify the live policy after the eventual release deploy**

Run:

```bash
curl -fsS https://aimarketatlas.net/robots.txt
```

Expected: one `User-agent: *` group, the approved `Content-Signal`, `Allow: /`, and one sitemap declaration.

