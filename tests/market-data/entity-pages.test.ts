import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { loadPublishedBriefs, type PublishedBrief } from "../../market-data/briefs.ts";
import type { MarketSnapshot, PageSlug, PageState } from "../../market-data/types.ts";
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
  "accelerator-market",
  "agents",
  "ai",
  "ai-market-atlas",
  "amd",
  "amd-data-center",
  "announced",
  "announced-power",
  "api",
  "api-deployment",
  "atlas-model",
  "basket",
  "breadth",
  "broadcom",
  "catalyst",
  "center",
  "cisco",
  "cisco-ai-infrastructure",
  "committed",
  "committed-power",
  "contract",
  "cooling",
  "cost",
  "data",
  "deployment",
  "doe-data-centers",
  "enterprise",
  "enterprise-agents",
  "ev",
  "forward",
  "frontier",
  "gemini-pricing",
  "google-ai-developers",
  "hbm",
  "helix",
  "iea-data-centres",
  "iea-energy-ai",
  "inference",
  "inference-cost",
  "infineon",
  "infrastructure",
  "infrastructure-spend",
  "interconnection",
  "international-energy-agency",
  "lead",
  "liquid",
  "liquid-cooling",
  "managed",
  "market",
  "median",
  "median-forward",
  "monitoring",
  "nvidia",
  "onsemi",
  "onsemi-ai",
  "openai",
  "openai-cyber-pacing",
  "openai-monitoring",
  "openai-ports",
  "openai-ports-pike",
  "openai-pricing",
  "packaging",
  "packaging-lead",
  "ports",
  "positive",
  "positive-breadth",
  "power",
  "production",
  "production-agents",
  "sharon-ai",
  "sharon-ai-contract",
  "sharon-ai-deployment-acceptance",
  "software",
  "software-spend",
  "spend",
  "stanford-economy",
  "stanford-hai",
  "stmicroelectronics",
  "tsmc",
  "u-s-department-energy-lbnl",
  "u-s-securities-exchange-commission",
  "vertiv",
  "vistra",
  "vistra-helix",
  "wafer",
  "wafer-frontier",
  "wolfspeed",
  "wolfspeed-ai",
] as const;

async function retainedBriefs() {
  return loadPublishedBriefs(
    join(projectRoot, "data/market/runs"),
    join(projectRoot, "data/market/reviews"),
  );
}

function syntheticPageState(metricIds: string[]): PageState {
  return {
    changed: true,
    changeReasons: ["first-party-event"],
    verifiedAt: "2026-08-26T01:00:00.000Z",
    thesisStance: "bullish",
    previousThesisStance: "bullish",
    thesisMetricIds: metricIds,
    report: {
      eyebrow: { en: "Synthetic", zh: "Synthetic" },
      title: { en: "Synthetic", zh: "Synthetic" },
      summary: { en: "Synthetic", zh: "Synthetic" },
      signal: { en: "Synthetic", zh: "Synthetic" },
      thesis: {
        title: { en: "Synthetic", zh: "Synthetic" },
        body: { en: "Synthetic", zh: "Synthetic" },
        tags: { en: ["synthetic"], zh: ["synthetic"] },
      },
      thesisSurvivalRationale: {
        text: { en: "Synthetic", zh: "Synthetic" },
        metricIds,
      },
      supportingEvidence: [{ text: { en: "Synthetic", zh: "Synthetic" }, metricIds }],
      opposingEvidence: [{ text: { en: "Synthetic", zh: "Synthetic" }, metricIds }],
      catalysts: [],
      risks: [],
      nextObservations: [],
    },
  };
}

function syntheticObservedEntityBrief(
  date: string,
  observedName = "Gemini",
  metricId = "models.managed_tokens",
): PublishedBrief {
  const dataCutoff = `${date}T01:00:00.000Z`;
  const sourceSlug = observedName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const emptyMetricIds: string[] = [];
  const emptyPage = syntheticPageState(emptyMetricIds);
  const modelPage = syntheticPageState([metricId]);
  const pages = {
    "/": emptyPage,
    "/stocks": emptyPage,
    "/compute": emptyPage,
    "/energy": emptyPage,
    "/models": modelPage,
    "/sic": emptyPage,
  } satisfies Record<PageSlug, PageState>;
  const snapshot = {
    schemaVersion: 1,
    runId: `${date}-saturday`,
    cadence: "saturday",
    generatedAt: dataCutoff,
    dataCutoff,
    pages,
    sources: {
      [`${sourceSlug}-pricing`]: {
        id: `${sourceSlug}-pricing`,
        kind: "pricing",
        publisher: observedName,
        title: `${observedName} pricing`,
        publishedAt: dataCutoff,
        retrievedAt: dataCutoff,
        scope: {
          en: `Synthetic ${observedName} pricing source`,
          zh: `Synthetic ${observedName} pricing source`,
        },
      },
    },
    metrics: {
      [metricId]: {
        id: metricId,
        page: "/models",
        required: true,
        kind: "published",
        numericValue: 1,
        display: { en: "1", zh: "1" },
        unit: "count",
        asOf: dataCutoff,
        sourceIds: [`${sourceSlug}-pricing`],
        observations: [{ sourceId: `${sourceSlug}-pricing`, numericValue: 1, asOf: dataCutoff }],
        confidence: "high",
        status: "verified",
      },
    },
    keySignalIds: [metricId],
  } satisfies MarketSnapshot;
  return {
    date,
    snapshot,
    review: {} as PublishedBrief["review"],
  };
}

function syntheticPublishedBrief(date: string): PublishedBrief {
  return syntheticObservedEntityBrief(date, "Gemini");
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

test("source-derived observed entities are not suppressed by name when evidence meets the floor", () => {
  const entities = discoverEligibleEntityRecords([
    syntheticPublishedBrief("2026-08-26"),
    syntheticPublishedBrief("2026-08-22"),
  ]);

  const gemini = entities.find((entity) => entity.slug === "gemini");
  assert.ok(gemini);
  assert.equal(gemini.briefs.length, 2);
  assert.equal(gemini.sourceReferenceCount, 2);
});

test("source identifiers and publishers retain observed domain names while stripping only document and date boilerplate", () => {
  const qualifyingCases = [
    ["AI", "ai"],
    ["Agency", "agency"],
    ["Carbide", "carbide"],
    ["Catalyst", "catalyst"],
    ["Center", "center"],
    ["Commission", "commission"],
    ["Cyber", "cyber"],
    ["Enterprise", "enterprise"],
    ["EV", "ev"],
    ["Frontier", "frontier"],
    ["Helix", "helix"],
    ["Infrastructure", "infrastructure"],
    ["LBNL", "lbnl"],
    ["Lead", "lead"],
    ["Liquid", "liquid"],
    ["Market", "market"],
    ["Networks", "networks"],
    ["Pike", "pike"],
    ["Product", "product"],
    ["Project", "project"],
    ["Silicon", "silicon"],
    ["Stack", "stack"],
    ["Technology", "technology"],
  ] as const;
  const rejectedCases = [
    "2026",
    "Announcement",
    "and",
    "Earnings",
    "FY2026",
    "Investor",
    "Month",
    "News",
    "Press",
    "Release",
    "Results",
    "Report",
    "Q2",
    "Filed",
    "Relations",
    "The",
    "Update",
    "Week",
    "Year",
  ] as const;

  for (const [observedName, expectedSlug] of qualifyingCases) {
    const entities = discoverEligibleEntityRecords([
      syntheticObservedEntityBrief("2026-08-26", observedName),
      syntheticObservedEntityBrief("2026-08-22", observedName),
    ]);

    const entity = entities.find((candidate) => candidate.slug === expectedSlug);
    assert.ok(entity, `${observedName} should qualify once the evidence floor is met`);
    assert.equal(entity.briefs.length, 2);
    assert.equal(entity.sourceReferenceCount, 2);
  }

  for (const observedName of rejectedCases) {
    const entities = discoverEligibleEntityRecords([
      syntheticObservedEntityBrief("2026-08-26", observedName),
      syntheticObservedEntityBrief("2026-08-22", observedName),
    ]);

    assert.equal(
      entities.some((entity) => entity.slug === observedName.trim().toLowerCase()),
      false,
      `${observedName} should stay rejected as generic boilerplate/date text`,
    );
  }
});

test("metric fields retain domain tokens but remove measurement suffixes by position", () => {
  const entities = discoverEligibleEntityRecords([
    syntheticObservedEntityBrief("2026-08-26", "Observed Publisher", "compute.ai_agency_capacity_gw"),
    syntheticObservedEntityBrief("2026-08-22", "Observed Publisher", "compute.ai_agency_capacity_gw"),
  ]);

  for (const expectedSlug of ["ai", "agency", "ai-agency"] as const) {
    assert.ok(
      entities.some((entity) => entity.slug === expectedSlug),
      `${expectedSlug} should be discovered from the metric field`,
    );
  }
  assert.equal(entities.some((entity) => entity.slug === "capacity"), false);
  assert.equal(entities.some((entity) => entity.slug === "gw"), false);
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
