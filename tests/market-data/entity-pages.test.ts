import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { loadPublishedBriefs } from "../../market-data/briefs.ts";
import {
  ENTITY_EVIDENCE_FLOOR,
  entityRoutePaths,
  extractEntityHubs,
  getEntityHub,
  normalizeEntitySlug,
} from "../../market-data/entity-pages.ts";

const projectRoot = new URL("../..", import.meta.url).pathname;

async function retainedBriefs() {
  return loadPublishedBriefs(
    join(projectRoot, "data/market/runs"),
    join(projectRoot, "data/market/reviews"),
  );
}

test("entity hubs are deterministic, collision-safe, and meet the explicit evidence floor", async () => {
  const briefs = await retainedBriefs();
  const first = extractEntityHubs(briefs);
  const second = extractEntityHubs(briefs);

  assert.deepEqual(second, first);
  assert.ok(first.length >= 20);
  assert.equal(new Set(first.map((entity) => entity.slug)).size, first.length);
  assert.ok(first.every((entity) =>
    entity.briefs.length >= ENTITY_EVIDENCE_FLOOR.datedBriefs &&
    entity.sources.length >= ENTITY_EVIDENCE_FLOOR.sources
  ));
  assert.ok(first.every((entity) => entity.briefs.every((brief) => brief.pillars.length >= 1)));
  assert.deepEqual(normalizeEntitySlug("HBM4"), "hbm4");
  assert.equal(normalizeEntitySlug("AMD/AMD"), undefined);
});

test("entity hubs only link dated briefs and pillars with report metric references", async () => {
  const amd = getEntityHub(extractEntityHubs(await retainedBriefs()), "amd");
  assert.ok(amd);
  assert.ok(amd.briefs.length >= 2);
  assert.ok(amd.briefs.every((brief) => brief.pillars.includes("/stocks") || brief.pillars.includes("/compute") || brief.pillars.includes("/")));
  assert.ok(amd.metrics.every((metric) => metric.id.includes("amd")));
  assert.ok(amd.sources.some((source) => source.id.startsWith("amd-")));
});

test("entity routes are bilingual and reject unknown slugs", async () => {
  const hubs = extractEntityHubs(await retainedBriefs());
  const routes = entityRoutePaths(hubs);
  assert.equal(routes.length, hubs.length * 2);
  assert.ok(routes.includes("/entity/amd/"));
  assert.ok(routes.includes("/en/entity/amd/"));
  assert.equal(getEntityHub(hubs, "not-a-retained-entity"), undefined);
});
