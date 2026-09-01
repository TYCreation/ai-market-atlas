import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadReleaseManifest, verifyReleaseEndpoint } from "../../scripts/release-verification.ts";
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

function addConsentId(body: string): string {
  return body.replace(
    /<label class="newsletter-consent">/i,
    '<label id="newsletter-consent" class="newsletter-consent">',
  );
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
  await withReleaseServer(manifestPath, (pathname, body) => pathname === "/" ? addConsentId(body) : undefined, async (baseUrl) => {
    await verifyReleaseEndpoint(baseUrl, manifest, "disabled");
  });
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
