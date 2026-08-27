import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function builtPath(candidates) {
  const path = candidates.map((candidate) => join(projectRoot, candidate)).find(existsSync);
  if (!path) {
    throw new Error(`Built site was not found. Run npm run build before starting the browser audit.`);
  }
  return path;
}

function assetFetcher(staticRoot) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Not found", { status: 404 });
      }
      const assetPath = resolve(staticRoot, `.${pathname}`);
      const assetRelativePath = relative(staticRoot, assetPath);
      if (
        assetRelativePath.startsWith("..") ||
        assetRelativePath.includes("\\..\\") ||
        resolve(staticRoot, assetRelativePath) !== assetPath
      ) {
        return new Response("Not found", { status: 404 });
      }
      try {
        const metadata = await stat(assetPath);
        if (!metadata.isFile()) return new Response("Not found", { status: 404 });
        return new Response(request.method === "HEAD" ? null : await readFile(assetPath), {
          headers: {
            "content-type": contentTypes[extname(assetPath).toLowerCase()] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}

function toRequest(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value) headers.set(name, value);
  }
  return new Request(`http://127.0.0.1${request.url}`, {
    body: request.method === "GET" || request.method === "HEAD" ? undefined : Readable.toWeb(request),
    duplex: "half",
    headers,
    method: request.method,
  });
}

async function sendResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  for (const [name, value] of response.headers) nodeResponse.setHeader(name, value);
  await pipeline(response.body ? Readable.fromWeb(response.body) : Readable.from([]), nodeResponse);
}

/**
 * Runs a callback against the built vinext worker on an ephemeral local origin.
 * Vinext 0.0.50 emits dist/server + dist/client; earlier builds use .vinext paths.
 */
export async function withBuiltSite(callback) {
  const workerPath = builtPath([".vinext/server/index.js", "dist/server/index.js"]);
  const staticRoot = builtPath([".vinext/static", "dist/client"]);
  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("browser-runtime", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const assets = assetFetcher(staticRoot);
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" || request.method === "HEAD") {
        const assetResponse = await assets.fetch(toRequest(request));
        if (assetResponse.status !== 404) {
          await sendResponse(assetResponse, response);
          return;
        }
      }
      const workerResponse = await worker.fetch(
        toRequest(request),
        { ASSETS: assets },
        { passThroughOnException() {}, waitUntil() {} },
      );
      await sendResponse(workerResponse, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
      } else {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.stack : "Internal Server Error");
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Built-site runtime did not bind a TCP port.");
  }

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
