import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { loadPublishedBriefs, type PublishedBrief } from "../../market-data/briefs.ts";
import type { MarketSnapshot, PageSlug, PageState } from "../../market-data/types.ts";
import {
  ENTITY_EVIDENCE_FLOOR,
  ENTITY_SELECTION_LIMIT,
  discoverEntityCandidateRecords,
  discoverEligibleEntityRecords,
  entityRoutePaths,
  extractEntityHubs,
  getEntityHub,
  normalizeEntitySlug,
} from "../../market-data/entity-pages.ts";

const projectRoot = new URL("../..", import.meta.url).pathname;
const EXPECTED_ELIGIBLE_ENTITY_SLUGS = [
  "amd",
  "amd-data-center",
  "broadcom",
  "cisco",
  "cisco-ai-infrastructure",
  "doe",
  "gemini",
  "hbm",
  "iea",
  "infineon",
  "liquid-cooling",
  "market-2030",
  "nvidia",
  "onsemi",
  "openai",
  "openai-ports",
  "packaging",
  "sharon-ai",
  "stanford-hai",
  "stmicroelectronics",
  "tsmc",
  "vertiv",
  "vistra",
  "wolfspeed",
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

test("selects a capped, evidence-ranked corpus from the larger discovered candidate set", async () => {
  const briefs = await retainedBriefs();
  const candidates = discoverEntityCandidateRecords(briefs);
  const first = discoverEligibleEntityRecords(briefs);
  const second = discoverEligibleEntityRecords(briefs);

  assert.deepEqual(second, first);
  assert.ok(candidates.length > first.length);
  assert.equal(first.length, ENTITY_SELECTION_LIMIT);
  assert.ok(first.length >= 20 && first.length <= 30);
  assert.deepEqual(first.map((entity) => entity.slug), EXPECTED_ELIGIBLE_ENTITY_SLUGS);
  assert.equal(new Set(first.map((entity) => entity.slug)).size, first.length);
  assert.ok(first.every((entity) =>
    entity.evidence.datedBriefs >= ENTITY_EVIDENCE_FLOOR.datedBriefs &&
    entity.evidence.canonicalSources >= ENTITY_EVIDENCE_FLOOR.canonicalSources &&
    entity.evidence.distinctMetrics >= ENTITY_EVIDENCE_FLOOR.distinctMetrics
  ));
  assert.ok(first.every((entity) => entity.briefs.every((brief) => brief.pillars.length >= 1)));
  assert.ok(first.every((entity) => entity.sources.every((source) => source.kind !== "atlas")));
  assert.ok(first.find((entity) => entity.slug === "tsmc"));
  assert.ok(first.find((entity) => entity.slug === "vistra"));
  assert.ok(first.find((entity) => entity.slug === "sharon-ai"));
  for (const thinSlug of [
    "announced",
    "atlas-model",
    "basket",
    "breadth",
    "data",
    "forward",
    "gemini-pricing",
    "median",
    "openai-pricing",
    "positive",
    "sharon-ai-deployment-acceptance",
  ]) {
    assert.equal(first.some((entity) => entity.slug === thinSlug), false, thinSlug);
  }
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

test("no entity below the explicit date, canonical-source, and metric floors emits", async () => {
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
  assert.deepEqual(gemini.evidence, {
    datedBriefs: 2,
    canonicalSources: 1,
    distinctMetrics: 1,
    narrativeDates: 0,
  });
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
    assert.equal(entity.evidence.canonicalSources, 1);
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

test("metric fields emit one whole semantic concept after positional measurement suffix stripping", () => {
  const entities = discoverEligibleEntityRecords([
    syntheticObservedEntityBrief("2026-08-26", "Observed Publisher", "compute.ai_agency_capacity_gw"),
    syntheticObservedEntityBrief("2026-08-22", "Observed Publisher", "compute.ai_agency_capacity_gw"),
  ]);

  assert.ok(entities.some((entity) => entity.slug === "ai-agency"));
  assert.equal(entities.some((entity) => entity.slug === "ai"), false);
  assert.equal(entities.some((entity) => entity.slug === "agency"), false);
  assert.equal(entities.some((entity) => entity.slug === "capacity"), false);
  assert.equal(entities.some((entity) => entity.slug === "gw"), false);
});

test("source identities stop at document/event suffixes and atlas sources never become entities", () => {
  const openAiBriefs = [
    syntheticObservedEntityBrief("2026-08-26", "OpenAI Investor Relations"),
    syntheticObservedEntityBrief("2026-08-22", "OpenAI Investor Relations"),
  ];
  const sharonBriefs = [
    syntheticObservedEntityBrief("2026-08-26", "Sharon AI Deployment Acceptance"),
    syntheticObservedEntityBrief("2026-08-22", "Sharon AI Deployment Acceptance"),
  ];
  const selfBriefs = [
    syntheticObservedEntityBrief("2026-08-26", "AI Market Atlas"),
    syntheticObservedEntityBrief("2026-08-22", "AI Market Atlas"),
  ];
  for (const brief of selfBriefs) {
    const source = Object.values(brief.snapshot.sources)[0];
    source.kind = "atlas";
  }

  assert.ok(discoverEligibleEntityRecords(openAiBriefs).some((entity) => entity.slug === "openai"));
  assert.ok(discoverEligibleEntityRecords(sharonBriefs).some((entity) => entity.slug === "sharon-ai"));
  assert.equal(
    discoverEntityCandidateRecords(sharonBriefs).some((entity) => entity.slug === "sharon-ai-deployment-acceptance"),
    false,
  );
  assert.deepEqual(discoverEligibleEntityRecords(selfBriefs), []);
});

test("evidence diversity counts dates, canonical sources, and metric IDs independently", async () => {
  const sharonAi = discoverEligibleEntityRecords(await retainedBriefs())
    .find((entity) => entity.slug === "sharon-ai");
  assert.ok(sharonAi);
  assert.deepEqual(sharonAi.evidence, {
    datedBriefs: 2,
    canonicalSources: 1,
    distinctMetrics: 2,
    narrativeDates: 2,
  });
});

test("selected labels preserve organization and metric acronyms", async () => {
  const entities = discoverEligibleEntityRecords(await retainedBriefs());
  const names = new Map(entities.map((entity) => [entity.slug, entity.name.en]));

  assert.equal(names.get("amd-data-center"), "AMD data center");
  assert.equal(names.get("cisco-ai-infrastructure"), "Cisco AI infrastructure");
  assert.equal(names.get("doe"), "DOE");
  assert.equal(names.get("iea"), "IEA");
  assert.equal(names.get("openai-ports"), "OpenAI PORTS");
  assert.equal(names.get("stanford-hai"), "Stanford HAI");
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
