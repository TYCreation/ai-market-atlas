import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { loadPublishedBriefs } from "../../market-data/briefs.ts";
import {
  ENTITY_EVIDENCE_FLOOR,
  discoverEligibleEntityRecords,
  entityRoutePaths,
  extractEntityHubs,
  getEntityHub,
  normalizeEntitySlug,
} from "../../market-data/entity-pages.ts";

const projectRoot = new URL("../..", import.meta.url).pathname;
const EXPECTED_ELIGIBLE_ENTITY_SLUGS = [
  "accelerator",
  "agents",
  "amd",
  "announced-power",
  "api",
  "broadcom",
  "cisco",
  "committed-power",
  "cooling",
  "hbm",
  "inference",
  "infineon",
  "interconnection",
  "managed-tokens",
  "nvidia",
  "onsemi",
  "openai",
  "packaging",
  "power",
  "production-agents",
  "sharon-ai",
  "software",
  "spend",
  "stmicroelectronics",
  "tsmc",
  "vertiv",
  "vistra",
  "wafer",
  "wolfspeed",
] as const;

async function retainedBriefs() {
  return loadPublishedBriefs(
    join(projectRoot, "data/market/runs"),
    join(projectRoot, "data/market/reviews"),
  );
}

test("discovers the current retained eligible entity corpus from report evidence instead of a curated allowlist", async () => {
  const briefs = await retainedBriefs();
  const first = discoverEligibleEntityRecords(briefs);
  const second = discoverEligibleEntityRecords(briefs);

  assert.deepEqual(second, first);
  assert.deepEqual(first.map((entity) => entity.slug), EXPECTED_ELIGIBLE_ENTITY_SLUGS);
  assert.equal(new Set(first.map((entity) => entity.slug)).size, first.length);
  assert.ok(first.every((entity) =>
    entity.briefs.length >= ENTITY_EVIDENCE_FLOOR.datedBriefs &&
    entity.sourceReferenceCount >= ENTITY_EVIDENCE_FLOOR.sourceReferences
  ));
  assert.ok(first.every((entity) => entity.briefs.every((brief) => brief.pillars.length >= 1)));
  assert.ok(first.find((entity) => entity.slug === "tsmc"));
  assert.ok(first.find((entity) => entity.slug === "vistra"));
  assert.ok(first.find((entity) => entity.slug === "sharon-ai"));
  assert.equal(first.some((entity) => entity.slug === "gemini"), false);
  assert.equal(first.some((entity) => entity.slug === "stanford"), false);
  assert.equal(first.some((entity) => entity.slug === "2026"), false);
  assert.equal(first.some((entity) => entity.slug === "results"), false);
});

test("entity alias normalization coalesces observed variants and rejects generic boilerplate", async () => {
  const hubs = extractEntityHubs(await retainedBriefs());

  assert.deepEqual(normalizeEntitySlug("TSM"), "tsmc");
  assert.deepEqual(normalizeEntitySlug(" Sharon AI "), "sharon-ai");
  assert.deepEqual(normalizeEntitySlug("VRT"), "vertiv");
  assert.deepEqual(normalizeEntitySlug("STM"), "stmicroelectronics");
  assert.equal(normalizeEntitySlug("AMD/AMD"), undefined);
  assert.equal(normalizeEntitySlug("2026 Results"), undefined);
  assert.equal(getEntityHub(hubs, "tsm")?.slug, "tsmc");
  assert.equal(getEntityHub(hubs, "Sharon AI")?.slug, "sharon-ai");
  assert.equal(getEntityHub(hubs, "VRT")?.slug, "vertiv");
  assert.equal(getEntityHub(hubs, "STM")?.slug, "stmicroelectronics");
});

test("no entity below the explicit brief and source-reference floor emits", async () => {
  const newestOnly = (await retainedBriefs()).slice(0, 1);
  assert.deepEqual(discoverEligibleEntityRecords(newestOnly), []);
});

test("entity hubs only link dated briefs and pillars with report metric references", async () => {
  const hubs = extractEntityHubs(await retainedBriefs());
  const amd = getEntityHub(hubs, "amd");
  const tsmc = getEntityHub(hubs, "tsmc");
  const sharonAi = getEntityHub(hubs, "sharon-ai");
  assert.ok(amd);
  assert.ok(tsmc);
  assert.ok(sharonAi);
  assert.ok(amd.briefs.every((brief) => brief.pillars.includes("/stocks") || brief.pillars.includes("/compute") || brief.pillars.includes("/")));
  assert.ok(amd.metrics.every((metric) => metric.id.includes("amd")));
  assert.ok(amd.sources.some((source) => source.id.startsWith("amd-")));
  assert.ok(tsmc.metrics.every((metric) => metric.id.includes("hbm") || metric.id.includes("packaging") || metric.id.includes("catalyst") || metric.id.includes("median_forward_pe")));
  assert.ok(tsmc.sources.some((source) => source.id === "tsmc-q2-2026"));
  assert.ok(sharonAi.metrics.every((metric) => metric.id.includes("sharon_ai")));
  assert.ok(sharonAi.sources.some((source) => source.id === "sharon-ai-deployment-acceptance"));
});

test("entity routes are bilingual and reject unknown slugs", async () => {
  const hubs = extractEntityHubs(await retainedBriefs());
  const routes = entityRoutePaths(hubs);
  assert.equal(routes.length, hubs.length * 2);
  assert.ok(routes.includes("/entity/amd/"));
  assert.ok(routes.includes("/entity/tsmc/"));
  assert.ok(routes.includes("/entity/vistra/"));
  assert.ok(routes.includes("/entity/sharon-ai/"));
  assert.ok(routes.includes("/en/entity/amd/"));
  assert.ok(routes.includes("/en/entity/tsmc/"));
  assert.ok(routes.includes("/en/entity/vistra/"));
  assert.ok(routes.includes("/en/entity/sharon-ai/"));
  assert.equal(getEntityHub(hubs, "not-a-retained-entity"), undefined);
});
