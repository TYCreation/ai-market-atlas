import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import manifest from "../fixtures/market/legacy-production-manifest.json" with { type: "json" };
import { AUGUST_PRODUCTION_ANCHOR, isKnownLegacyRollbackManifest, verifyLegacyRollback } from "../../market-data/legacy-rollback.ts";
import { readDeploymentManifest } from "../../scripts/deploy-pages.ts";

test("only the exact known production manifest qualifies for legacy rollback", () => {
  assert.equal(isKnownLegacyRollbackManifest(manifest), true);
  assert.equal(isKnownLegacyRollbackManifest({ ...manifest, routes: ["/"] }), false);
  assert.equal(isKnownLegacyRollbackManifest({ ...manifest, artifactTreeSha256: "0".repeat(64) }), false);
  assert.equal(isKnownLegacyRollbackManifest(null), false);
});

test("a legacy manifest cannot waive new candidate contracts or bypass independent anchors", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-legacy-contract-"));
  const directory = join(root, "work/pages-candidate");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".market-deployment.json"), JSON.stringify(manifest));
  await assert.rejects(readDeploymentManifest(directory), /deployment manifest is invalid/);
  await assert.rejects(readDeploymentManifest(directory, {
    expectedCandidateSha256: AUGUST_PRODUCTION_ANCHOR.candidateSha256,
    expectedArtifactTreeSha256: AUGUST_PRODUCTION_ANCHOR.artifactTreeSha256,
    expectedManifestSha256: AUGUST_PRODUCTION_ANCHOR.manifestSha256,
  }), /deployment manifest is invalid/);
  let requests = 0;
  await assert.rejects(verifyLegacyRollback("https://aimarketatlas.net", directory, async () => {
    requests++;
    return new Response("forged");
  }), /does not match the pinned production release/);
  assert.equal(requests, 0);
});
