import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadReleaseManifest, verifyReleaseEndpoint } from "../../scripts/release-verification.ts";

const projectRoot = join(import.meta.dirname, "../..", "");
const candidate = join(projectRoot, "work", "pages-candidate");

test("release verifier exercises the exported route, discovery, identity, and 404 contracts", async () => {
  const manifest = await loadReleaseManifest(join(candidate, ".market-deployment.json"));
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
      const body = await readFile(join(candidate, relative));
      response.statusCode = 200;
      response.setHeader("content-type", pathname === "/rss.xml" ? "application/rss+xml" : pathname.endsWith(".json") ? "application/json" : pathname.endsWith(".xml") ? "application/xml" : pathname.endsWith(".txt") ? "text/plain" : "text/html");
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
    await verifyReleaseEndpoint(`http://127.0.0.1:${address.port}`, manifest, "disabled");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
