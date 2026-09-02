import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  loadReleaseManifest,
  parseReleaseVerificationArgs,
  assertSitemap,
  verifyReleaseEndpoint,
} from "../../scripts/release-verification.ts";
import { ARTIFACT_MANIFEST_NAME } from "../../market-data/artifact-tree.ts";
import { hashCandidate } from "../../market-data/review.ts";

const projectRoot = resolve(import.meta.dirname, "../..");
const candidate = join(projectRoot, "work", "pages-candidate");

function contentTypeFor(pathname: string): string {
  if (pathname === "/rss.xml") return "application/rss+xml";
  if (pathname.endsWith(".json")) return "application/json";
  if (pathname.endsWith(".xml")) return "application/xml";
  if (pathname.endsWith(".txt")) return "text/plain";
  return "text/html";
}

async function withReleaseServer(
  manifestPath: string,
  overrideBody: (
    pathname: string,
    body: string,
    request: Parameters<Parameters<typeof createServer>[0]>[0],
  ) => string | undefined = () => undefined,
  callback: (baseUrl: string, manifestPath: string) => Promise<void>,
): Promise<void> {
  const server = createServer(async (request, response) => {
    const pathname = request.url?.split("?", 1)[0] ?? "/";
    if (pathname.startsWith("/__release-not-found-")) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const routePath = pathname.endsWith("/") ? pathname : `${pathname}/`;
    let relative = routePath === "/" ? "index.html" : `${routePath.slice(1)}index.html`;
    if (pathname === "/sitemap.xml" || pathname === "/rss.xml" || pathname === "/news-sitemap.xml" || pathname === "/llms.txt") relative = pathname.slice(1);
    if (pathname === "/market-brief/data.json") relative = "market-brief/data.json";
    try {
      const filePath = relative === ARTIFACT_MANIFEST_NAME
        ? manifestPath
        : join(resolve(manifestPath, ".."), relative);
      const rawBody = await readFile(filePath, "utf8");
      const body = overrideBody(pathname, rawBody, request) ?? rawBody;
      response.statusCode = 200;
      response.setHeader("content-type", contentTypeFor(pathname));
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end("missing");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await callback(`http://127.0.0.1:${address.port}`, manifestPath);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function copyCandidateFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "release-verifier-"));
  const directory = join(root, "work", "pages-candidate");
  await cp(candidate, directory, { recursive: true });
  return root;
}

test("release verifier exercises the exported route, discovery, identity, and 404 contracts", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(manifestPath, undefined, async (baseUrl) => {
    await verifyReleaseEndpoint(baseUrl, manifest, "disabled");
  });
});

test("release verifier does not treat canonical markup inside script text as live HTML", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/"
      ? body.replace(
          '<link rel="canonical" href="https://aimarketatlas.net/"/>',
          '<script>\u003clink rel="canonical" href="https://aimarketatlas.net/"\u003e</script>',
        )
      : undefined,
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
        /canonical/i,
      );
    },
  );
});

test("release verifier does not treat canonical markup inside an HTML comment as live HTML", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/"
      ? body.replace(
          '<link rel="canonical" href="https://aimarketatlas.net/"/>',
          '<!--<link rel="canonical" href="https://aimarketatlas.net/"/>-->',
        )
      : undefined,
    async (baseUrl) => {
      await assert.rejects(() => verifyReleaseEndpoint(baseUrl, manifest, "disabled"), /canonical/i);
    },
  );
});

test("release verifier does not treat newsletter markup inside template text as live HTML", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(
    manifestPath,
    (pathname, body) => {
      if (pathname !== "/") return undefined;
      const start = body.indexOf('<section class="newsletter"');
      const end = body.indexOf("</section>", start) + "</section>".length;
      assert.ok(start >= 0 && end > start);
      return `${body.slice(0, start)}<template>${body.slice(start, end)}</template>${body.slice(end)}`;
    },
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
        /newsletter/i,
      );
    },
  );
});

test("trusted manifest loading rejects route omission from a tampered manifest", async () => {
  const root = await copyCandidateFixture();
  const manifestPath = join(root, "work", "pages-candidate", ARTIFACT_MANIFEST_NAME);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { routes: string[] };
  const expectedManifestSha256 = hashCandidate(manifest);
  manifest.routes = manifest.routes.filter((route) => route !== "/stocks");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  try {
    await assert.rejects(
      () => loadReleaseManifest(manifestPath, expectedManifestSha256),
      /manifest hash.*does not match/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release verifier rejects sitemap entries outside the reviewed route map", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));

  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/sitemap.xml"
      ? body.replace(
          "</urlset>\n",
          "<url><loc>https://aimarketatlas.net/rogue/</loc><lastmod>2026-08-26T01:00:00.000Z</lastmod></url>\n</urlset>\n",
        )
      : undefined,
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
        /sitemap.*match/i,
      );
    },
  );
});

test("release verifier does not count a commented-out sitemap entry", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/sitemap.xml"
      ? body.replace(
          `<url><loc>https://aimarketatlas.net/</loc><lastmod>${manifest.dataCutoff}</lastmod></url>`,
          `<!--<url><loc>https://aimarketatlas.net/</loc><lastmod>${manifest.dataCutoff}</lastmod></url>-->`,
        )
      : undefined,
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
        /sitemap/i,
      );
    },
  );
});

test("release verifier does not count a sitemap entry embedded in CDATA", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  const sitemapPath = join(candidate, "sitemap.xml");
  const sitemap = await readFile(sitemapPath, "utf8");
  const firstEntry = `<url><loc>https://aimarketatlas.net/</loc><lastmod>${manifest.dataCutoff}</lastmod></url>`;
  assert.ok(sitemap.includes(firstEntry));
  assert.throws(
    () => {
      // A CDATA section is text, not a live sitemap element.
      const replaced = sitemap.replace(firstEntry, `<![CDATA[${firstEntry}]]>`);
      // The endpoint harness is not needed for this parser-only contract.
      return assertSitemap(replaced, manifest);
    },
    /sitemap/i,
  );
});

test("release verifier rejects malformed sitemap XML even when route text remains present", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));
  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/sitemap.xml"
      ? body.replace("</urlset>", "<broken")
      : undefined,
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
        /sitemap/i,
      );
    },
  );
});

test("release verifier rejects enabled newsletter markup without native required fields", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));

  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/"
      ? body
          .replace(/<label class="newsletter-consent">/i, '<label id="newsletter-consent" class="newsletter-consent">')
          .replace(/<form\b([^>]*)>/i, '<form$1 action="https://subscribe.example.com/" method="post">')
          .replace(/\sdisabled(?:=""|\b)/g, "")
          .replace(/\saria-disabled="true"/g, "")
          .replace(/\srequired(?:=""|\b)/g, "")
      : undefined,
    async (baseUrl) => {
      await assert.rejects(
        () => verifyReleaseEndpoint(baseUrl, manifest, "enabled"),
        /newsletter enabled mode/i,
      );
    },
  );
});

test("release verifier accepts exact hreflang alternates even when link attributes are reordered", async () => {
  const manifestPath = join(candidate, ARTIFACT_MANIFEST_NAME);
  const manifest = await loadReleaseManifest(manifestPath, hashCandidate(JSON.parse(await readFile(manifestPath, "utf8"))));

  await withReleaseServer(
    manifestPath,
    (pathname, body) => pathname === "/"
      ? body
          .replace(/<label class="newsletter-consent">/i, '<label id="newsletter-consent" class="newsletter-consent">')
          .replace(
            /<link rel="alternate" hrefLang="zh-Hant" href="https:\/\/aimarketatlas\.net\/" \/>/i,
            '<link href="https://aimarketatlas.net/" data-test="zh" hrefLang="zh-Hant" rel="alternate" />',
          )
          .replace(
            /<link rel="alternate" hrefLang="en" href="https:\/\/aimarketatlas\.net\/en\/" \/>/i,
            '<link href="https://aimarketatlas.net/en/" rel="alternate" hrefLang="en" data-test="en" />',
          )
          .replace(
            /<link rel="alternate" hrefLang="x-default" href="https:\/\/aimarketatlas\.net\/" \/>/i,
            '<link data-test="default" hrefLang="x-default" rel="alternate" href="https://aimarketatlas.net/" />',
          )
      : undefined,
    async (baseUrl) => {
      await assert.doesNotReject(
        () => verifyReleaseEndpoint(baseUrl, manifest, "disabled"),
      );
    },
  );
});

test("release verifier CLI parser rejects unknown and duplicate flags", () => {
  assert.throws(
    () => parseReleaseVerificationArgs([
      "--base-url", "https://preview.example",
      "--expected-manifest-sha256", "a".repeat(64),
      "--unexpected",
    ]),
    /unknown flag/i,
  );
  assert.throws(
    () => parseReleaseVerificationArgs([
      "--base-url", "https://preview.example",
      "--base-url", "https://other.example",
      "--expected-manifest-sha256", "a".repeat(64),
    ]),
    /duplicate.*base-url/i,
  );
});

test("release verifier CLI parser requires an explicit newsletter mode", () => {
  const common = ["--base-url", "https://preview.example", "--expected-manifest-sha256", "a".repeat(64)];
  assert.throws(() => parseReleaseVerificationArgs(common), /newsletter/i);
  assert.throws(() => parseReleaseVerificationArgs([...common, "--newsletter", "maybe"]), /newsletter/i);
  assert.deepEqual(
    parseReleaseVerificationArgs([...common, "--newsletter", "disabled"]),
    {
      baseUrl: "https://preview.example",
      manifestPath: undefined,
      expectedManifestSha256: "a".repeat(64),
      newsletterMode: "disabled",
    },
  );
});
