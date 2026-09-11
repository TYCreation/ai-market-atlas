import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { hashArtifactTree } from "./artifact-tree.ts";
import { hashCandidate } from "./review.ts";

/** Exact pre-upgrade production artifact, not a general legacy-schema exemption.
 * Never rebuilt: the old HTML is verified byte-for-byte against production before import.
 */
export const AUGUST_PRODUCTION_ANCHOR = {
  schemaVersion: 1 as const,
  runId: "2026-08-29-month-end",
  candidateSha256: "7b8f080c8a1688aaf93375b2123dbd66319cfd003aa5f7b1d69aa5b96ed50088",
  artifactTreeSha256: "03087ceadb8a399c98f7f87cb197426e6af697d0cd3528e305f63c12076ffc3b",
  manifestSha256: "fbef8ebae8a3080fd9d35f06b2f2c3b206d5eec171b5ee49921db2377e087ab6",
};

export function isKnownLegacyRollbackManifest(value: unknown): boolean {
  return hashCandidate(value) === AUGUST_PRODUCTION_ANCHOR.manifestSha256;
}

/** The old release predates discovery feeds. Verify its own exact bytes, never
 * pretend it contains the new release's RSS/entity/brief discovery contracts.
 */
export async function verifyLegacyRollback(
  baseUrl: string,
  directory: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, ".market-deployment.json"), "utf8"));
  if (!isKnownLegacyRollbackManifest(manifest) || await hashArtifactTree(directory) !== AUGUST_PRODUCTION_ANCHOR.artifactTreeSha256) {
    throw new Error("Legacy rollback does not match the pinned production release");
  }
  const files = new Map<string, string>((manifest.routes as string[]).map((route) => [route, join(directory, route.replace(/^\//, ""), "index.html")]));
  files.set("/market-brief/data.json", join(directory, "market-brief/data.json"));
  for (const [route, path] of [...files]) {
    if (!path.endsWith(".html")) continue;
    const html = await readFile(path, "utf8");
    for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)) {
      const url = new URL(match[1], new URL(route, baseUrl));
      if (url.origin !== new URL(baseUrl).origin || !/\/(?:assets)\//.test(url.pathname)) continue;
      files.set(url.pathname, join(directory, url.pathname.replace(/^\//, "")));
    }
  }
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  // Small batches avoid turning recovery into a burst of requests.
  const entries = [...files];
  for (let index = 0; index < entries.length; index += 4) {
    await Promise.all(entries.slice(index, index + 4).map(async ([route, path]) => {
      const expected = await readFile(path);
      const response = await fetcher(new URL(route, baseUrl), { signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (response.status !== 200 || hash(new Uint8Array(await response.arrayBuffer())) !== hash(expected)) {
        throw new Error(`Legacy production bytes differ at ${route}`);
      }
    }));
  }
}
