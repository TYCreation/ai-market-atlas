import assert from "node:assert/strict";
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { projectMonthlyArchive } from "../../market-data/storage.ts";
import { hashCandidate } from "../../market-data/review.ts";
import validCandidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import previousFull from "../fixtures/market/previous-full.json" with { type: "json" };
import { exportPages } from "../../scripts/export-pages.ts";
import {
  generateMarketBriefAssets,
  type MarketBriefPayload,
} from "../../scripts/generate-market-brief.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";
import { autoPublishReview } from "./helpers.ts";
import {
  discoverEligibleEntityRecords,
  entityRoutePaths,
  extractEntityHubs,
} from "../../market-data/entity-pages.ts";
import { loadPublishedBriefs } from "../../market-data/briefs.ts";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const outputDirectory = join(projectRoot, "work", "pages-candidate");
const snapshotPath = join(projectRoot, "data", "market", "current.json");
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

async function isolatedExportProject(build: boolean): Promise<string> {
  const isolatedRoot = await mkdtemp(join(tmpdir(), "market-export-project-"));
  for (const directory of [
    ".openai",
    "app",
    "build",
    "data",
    "hyperframes",
    "market-data",
    "public",
    "scripts",
    "worker",
    ...(build ? [] : ["dist"]),
  ]) {
    await cp(join(projectRoot, directory), join(isolatedRoot, directory), {
      recursive: true,
    });
  }
  for (const file of [
    "package.json",
    "package-lock.json",
    "postcss.config.mjs",
    "tsconfig.json",
    "vite.config.ts",
  ]) {
    await cp(join(projectRoot, file), join(isolatedRoot, file));
  }
  await symlink(
    join(projectRoot, "node_modules"),
    join(isolatedRoot, "node_modules"),
    "dir",
  );
  const julySnapshot = JSON.parse(
    await readFile(
      join(projectRoot, "tests", "fixtures", "market", "previous-full.json"),
      "utf8",
    ),
  ) as MarketSnapshot;
  await writeFile(
    join(isolatedRoot, "data", "market", "current.json"),
    `${JSON.stringify(julySnapshot)}\n`,
  );
  await generateMarketBriefAssets({
    snapshotPath: join(isolatedRoot, "data", "market", "current.json"),
    validationMode: "published",
    canonicalData: join(
      isolatedRoot,
      "hyperframes",
      "weekly-ai-market-brief",
      "data.json",
    ),
    publicData: join(isolatedRoot, "public", "market-brief", "data.json"),
    canonicalHtml: join(
      isolatedRoot,
      "hyperframes",
      "weekly-ai-market-brief",
      "index.html",
    ),
    publicHtml: join(isolatedRoot, "public", "market-brief", "index.html"),
  });
  if (!build) {
    await rm(join(isolatedRoot, "dist", "client", "market-brief"), {
      recursive: true,
      force: true,
    });
    await cp(
      join(isolatedRoot, "public", "market-brief"),
      join(isolatedRoot, "dist", "client", "market-brief"),
      { recursive: true },
    );
  }
  return isolatedRoot;
}

test("exports evidence-bound bilingual entity hubs with historical metadata and identities", async () => {
  const isolatedRoot = await isolatedExportProject(true);
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  try {
    const result = await exportPages({
      projectRoot: isolatedRoot,
      snapshotPath: join(isolatedRoot, "data", "market", "current.json"),
      outputDirectory: isolatedOutput,
      build: true,
    });
    const entities = extractEntityHubs(await loadPublishedBriefs(
      join(isolatedRoot, "data", "market", "runs"),
      join(isolatedRoot, "data", "market", "reviews"),
    ));
    const eligible = discoverEligibleEntityRecords(await loadPublishedBriefs(
      join(isolatedRoot, "data", "market", "runs"),
      join(isolatedRoot, "data", "market", "reviews"),
    ));
    const amd = entities.find((entity) => entity.slug === "amd");
    const sharonAi = entities.find((entity) => entity.slug === "sharon-ai");
    assert.ok(amd);
    assert.ok(sharonAi);
    assert.deepEqual(eligible.map((entity) => entity.slug), EXPECTED_ELIGIBLE_ENTITY_SLUGS);
    assert.deepEqual(entities.map((entity) => entity.slug), EXPECTED_ELIGIBLE_ENTITY_SLUGS);
    const sitemap = await readFile(join(isolatedOutput, "sitemap.xml"), "utf8");
    for (const entity of entities) {
      assert.ok(result.routes.includes(`/entity/${entity.slug}/`));
      assert.ok(result.routes.includes(`/en/entity/${entity.slug}/`));
      assert.deepEqual(result.routeIdentities[`/entity/${entity.slug}/`], {
        kind: "entity-detail",
        entitySlug: entity.slug,
        lastModified: entity.lastModified,
        sourceIds: entity.sources.map((source) => source.id),
      });
      assert.deepEqual(result.routeIdentities[`/en/entity/${entity.slug}/`], {
        kind: "entity-detail",
        entitySlug: entity.slug,
        lastModified: entity.lastModified,
        sourceIds: entity.sources.map((source) => source.id),
      });
      assert.equal((await lstat(join(isolatedOutput, "entity", entity.slug, "index.html"))).isFile(), true, entity.slug);
      assert.equal((await lstat(join(isolatedOutput, "en", "entity", entity.slug, "index.html"))).isFile(), true, entity.slug);
      assert.ok(
        sitemap.includes(`<loc>https://aimarketatlas.net/entity/${entity.slug}/</loc><lastmod>${entity.lastModified}</lastmod>`),
        entity.slug,
      );
      assert.ok(
        sitemap.includes(`<loc>https://aimarketatlas.net/en/entity/${entity.slug}/</loc><lastmod>${entity.lastModified}</lastmod>`),
        entity.slug,
      );
    }
    assert.deepEqual(result.routeIdentities["/entity/amd/"], {
      kind: "entity-detail",
      entitySlug: "amd",
      lastModified: amd.lastModified,
      sourceIds: amd.sources.map((source) => source.id),
    });
    const zh = await readFile(join(isolatedOutput, "entity", "amd", "index.html"), "utf8");
    const en = await readFile(join(isolatedOutput, "en", "entity", "amd", "index.html"), "utf8");
    assert.match(zh, /rel="canonical" href="https:\/\/aimarketatlas\.net\/entity\/amd\/"/);
    assert.match(zh, /hrefLang="en" href="https:\/\/aimarketatlas\.net\/en\/entity\/amd\/"/);
    assert.match(en, /rel="canonical" href="https:\/\/aimarketatlas\.net\/en\/entity\/amd\/"/);
    assert.match(en, /hrefLang="zh-Hant" href="https:\/\/aimarketatlas\.net\/entity\/amd\/"/);
    assert.match(zh, /application\/ld\+json/);
    assert.match(zh, /2026-08-26/);
    assert.match(zh, /\/brief\/2026-08-26/);
    assert.match(zh, /\/stocks/);
    assert.match(await readFile(join(isolatedOutput, "sitemap.xml"), "utf8"), new RegExp(`https://aimarketatlas\\.net/entity/amd/</loc><lastmod>${amd.lastModified}</lastmod>`));
    const sharonZh = await readFile(join(isolatedOutput, "entity", "sharon-ai", "index.html"), "utf8");
    assert.match(sharonZh, /Sharon AI/);
    assert.match(sharonZh, /\/brief\/2026-08-26/);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("exports every current/archive route and public asset without localhost metadata", async () => {
  const isolatedRoot = await isolatedExportProject(false);
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  const isolatedSnapshot = join(
    isolatedRoot,
    "data",
    "market",
    "current.json",
  );
  try {
    const result = await exportPages({
      projectRoot: isolatedRoot,
      snapshotPath: isolatedSnapshot,
      outputDirectory: isolatedOutput,
      build: false,
    });
    const entities = extractEntityHubs(
      await loadPublishedBriefs(
        join(isolatedRoot, "data", "market", "runs"),
        join(isolatedRoot, "data", "market", "reviews"),
      ),
    );
    assert.deepEqual(entities.map((entity) => entity.slug), EXPECTED_ELIGIBLE_ENTITY_SLUGS);

    assert.deepEqual(result.routes, [
      "/",
      "/stocks",
      "/compute",
      "/energy",
      "/models",
      "/sic",
      "/en",
      "/en/stocks",
      "/en/compute",
      "/en/energy",
      "/en/models",
      "/en/sic",
      "/archive",
      "/en/archive",
      "/archive/2026-07",
      "/en/archive/2026-07",
      "/brief/2026-08-26/",
      "/brief/2026-08-22/",
      "/brief/2026-08-19/",
      "/brief/2026-08-15/",
      "/brief/2026-08-12/",
      "/brief/2026-08-08/",
      "/brief/2026-08-05/",
      "/brief/2026-08-01/",
      "/en/brief/2026-08-26/",
      "/en/brief/2026-08-22/",
      "/en/brief/2026-08-19/",
      "/en/brief/2026-08-15/",
      "/en/brief/2026-08-12/",
      "/en/brief/2026-08-08/",
      "/en/brief/2026-08-05/",
      "/en/brief/2026-08-01/",
      ...entityRoutePaths(entities),
      "/market-brief/",
    ]);
    for (const path of [
      "index.html",
      "stocks/index.html",
      "compute/index.html",
      "energy/index.html",
      "models/index.html",
      "sic/index.html",
      "archive/index.html",
      "archive/2026-07/index.html",
      "brief/2026-08-26/index.html",
      "en/brief/2026-08-26/index.html",
      "market-brief/index.html",
      "market-brief/data.json",
      "404.html",
      "robots.txt",
      "sitemap.xml",
      "_redirects",
      "_worker.js",
      ".market-deployment.json",
      "favicon.svg",
      "og.png",
    ]) {
      assert.equal((await lstat(join(isolatedOutput, path))).isFile(), true, path);
    }
    assert.ok((await readdir(join(isolatedOutput, "assets"))).length > 0);

    const routeFiles = result.routes
      .filter((route) => route !== "/market-brief/")
      .map((route) =>
        route === "/"
          ? join(isolatedOutput, "index.html")
          : join(isolatedOutput, route.slice(1), "index.html"),
      );
    const html = (
      await Promise.all(routeFiles.map((path) => readFile(path, "utf8")))
    ).join("\n");
    assert.match(html, /https:\/\/aimarketatlas\.net/);
    assert.match(
      await readFile(join(isolatedOutput, "sitemap.xml"), "utf8"),
      /https:\/\/aimarketatlas\.net\/stocks/,
    );
    const notFound = await readFile(join(isolatedOutput, "404.html"), "utf8");
    assert.match(notFound, /content="noindex"/);
    assert.doesNotMatch(notFound, /rel="canonical"/);

    const sitemap = await readFile(join(isolatedOutput, "sitemap.xml"), "utf8");
    assert.doesNotMatch(sitemap, /market-brief/);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/stocks\//);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/brief\/2026-08-26\/<\/loc><lastmod>2026-08-26T01:00:00\.000Z<\/lastmod>/);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/brief\/2026-08-01\/<\/loc><lastmod>2026-08-01T01:00:00\.000Z<\/lastmod>/);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/entity\/tsmc\/<\/loc><lastmod>2026-08-26T01:00:00\.000Z<\/lastmod>/);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/entity\/vistra\//);
    assert.match(sitemap, /https:\/\/aimarketatlas\.net\/entity\/sharon-ai\//);

    const datedZh = await readFile(join(isolatedOutput, "brief", "2026-08-26", "index.html"), "utf8");
    const datedEn = await readFile(join(isolatedOutput, "en", "brief", "2026-08-26", "index.html"), "utf8");
    assert.match(datedZh, /rel="canonical" href="https:\/\/aimarketatlas\.net\/brief\/2026-08-26\/"/);
    assert.match(datedZh, /hrefLang="en" href="https:\/\/aimarketatlas\.net\/en\/brief\/2026-08-26\/"/);
    assert.match(datedEn, /rel="canonical" href="https:\/\/aimarketatlas\.net\/en\/brief\/2026-08-26\/"/);
    assert.match(datedEn, /hrefLang="zh-Hant" href="https:\/\/aimarketatlas\.net\/brief\/2026-08-26\/"/);
    assert.match(datedZh, /2026-08-26-wednesday/);
    assert.match(datedEn, /2026-08-26-wednesday/);
    assert.match(await readFile(join(isolatedOutput, "stocks", "index.html"), "utf8"), /Historical briefs for this pillar|本主題的歷史市場快報/);

    const brief = await readFile(
      join(isolatedOutput, "market-brief", "index.html"),
      "utf8",
    );
    assert.match(brief, /name="robots" content="noindex, follow"/);
    assert.match(
      brief,
      /<link rel="canonical" href="https:\/\/aimarketatlas\.net\/market-brief\/"\/>/,
    );
    assert.match(
      await readFile(join(isolatedOutput, "robots.txt"), "utf8"),
      /Sitemap: https:\/\/aimarketatlas\.net\/sitemap\.xml/,
    );
    assert.equal(
      await readFile(join(isolatedOutput, "robots.txt"), "utf8"),
      "User-agent: *\n" +
        "Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference\n" +
        "Allow: /\n\n" +
        "Sitemap: https://aimarketatlas.net/sitemap.xml\n",
    );
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/i);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(isolatedOutput, ".market-deployment.json"),
          "utf8",
        ),
      ),
      {
        routes: result.routes,
        runId: result.runId,
        dataCutoff: result.dataCutoff,
        archiveMonths: result.archiveMonths,
        sourceIds: result.sourceIds,
        archiveSourceIds: result.archiveSourceIds,
        candidateSha256: result.candidateSha256,
        artifactTreeSha256: result.artifactTreeSha256,
        routeIdentities: result.routeIdentities,
      },
    );
    assert.match(result.artifactTreeSha256, /^[a-f0-9]{64}$/);
    assert.match(result.manifestSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      result.manifestSha256,
      hashCandidate(
        JSON.parse(
          await readFile(
            join(isolatedOutput, ".market-deployment.json"),
            "utf8",
          ),
        ),
      ),
    );
    assert.deepEqual(result.routeIdentities["/compute"], {
      kind: "current",
      runId: "2026-07-25-saturday",
      dataCutoff: "2026-07-25T01:00:00.000Z",
      sourceIds: [
        "atlas-model",
        "broadcom-q2-fy26",
        "nvidia-q1-fy27",
        "tsmc-q1-2026",
      ],
    });
    assert.deepEqual(result.routeIdentities["/archive/2026-07"], {
      kind: "archive-detail",
      archiveMonth: "2026-07",
      runId: "2026-07-25-saturday",
      dataCutoff: "2026-07-25T01:00:00.000Z",
      sourceIds: result.archiveSourceIds["2026-07"],
    });
    assert.deepEqual(result.routeIdentities["/market-brief/"], {
      kind: "market-brief",
      dataCutoff: "2026-07-25T01:00:00.000Z",
      sourceIds: [
        "atlas-model",
        "broadcom-q2-fy26",
        "doe-data-centers",
        "gemini-pricing",
        "iea-data-centres",
        "iea-energy-ai",
        "infineon-200mm",
        "nvidia-q1-fy27",
        "onsemi-ai",
        "openai-pricing",
        "stanford-economy",
        "stm-q1-2026",
        "tsmc-q1-2026",
        "wolfspeed-ai",
      ],
      payloadSha256: result.routeIdentities["/market-brief/"].payloadSha256,
    });
    assert.deepEqual(result.routeIdentities["/brief/2026-08-26/"], {
      kind: "brief-detail",
      briefDate: "2026-08-26",
      runId: "2026-08-26-wednesday",
      dataCutoff: "2026-08-26T01:00:00.000Z",
      sourceIds: result.routeIdentities["/brief/2026-08-26/"].sourceIds,
    });
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("rejects unsafe export paths before build or output mutation", async () => {
  const unsafe = join(projectRoot, "work", "..", "pages-candidate");
  await assert.rejects(
    () =>
      exportPages({
        projectRoot,
        snapshotPath,
        outputDirectory: unsafe,
        build: false,
      }),
    /unsafe|output directory/i,
  );
  await assert.rejects(
    () =>
      exportPages({
        projectRoot,
        snapshotPath: join(projectRoot, "data", "market", "..", "current.json"),
        outputDirectory,
        build: false,
      }),
    /snapshot path is unsafe/i,
  );
});

test("rejects an export whose snapshot no longer matches the authorized candidate hash", async () => {
  const isolatedRoot = await isolatedExportProject(false);
  try {
    await assert.rejects(
      () =>
        exportPages({
          projectRoot: isolatedRoot,
          snapshotPath: join(isolatedRoot, "data", "market", "current.json"),
          outputDirectory: join(isolatedRoot, "work", "pages-candidate"),
          build: false,
          authorizedCandidateSha256: "0".repeat(64),
        }),
      /authorized candidate hash/i,
    );
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("rejects stale copied market-brief JSON and embedded identities", async (t) => {
  const isolatedRoot = await isolatedExportProject(false);
  const isolatedSnapshotPath = join(
    isolatedRoot,
    "data",
    "market",
    "current.json",
  );
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  const briefDirectory = join(isolatedRoot, "dist", "client", "market-brief");
  const dataPath = join(briefDirectory, "data.json");
  const htmlPath = join(briefDirectory, "index.html");
  const originalData = await readFile(dataPath, "utf8");
  const originalHtml = await readFile(htmlPath, "utf8");

  try {
    await t.test("stale data.json", async () => {
      const data = JSON.parse(originalData) as Record<string, unknown>;
      data.runId = "2026-07-18-saturday";
      await writeFile(dataPath, `${JSON.stringify(data)}\n`);
      try {
        await assert.rejects(
          () =>
            exportPages({
              projectRoot: isolatedRoot,
              snapshotPath: isolatedSnapshotPath,
              outputDirectory: isolatedOutput,
              build: false,
            }),
          /market brief.*identity|market brief.*runId/i,
        );
      } finally {
        await writeFile(dataPath, originalData);
      }
    });

    await t.test("stale embedded JSON", async () => {
      const staleHtml = originalHtml.replace(
        '"dataCutoff":"2026-07-25T01:00:00.000Z"',
        '"dataCutoff":"2026-07-18T01:00:00.000Z"',
      );
      assert.notEqual(staleHtml, originalHtml);
      await writeFile(htmlPath, staleHtml);
      try {
        await assert.rejects(
          () =>
            exportPages({
              projectRoot: isolatedRoot,
              snapshotPath: isolatedSnapshotPath,
              outputDirectory: isolatedOutput,
              build: false,
            }),
          /market brief.*identity|market brief.*runId/i,
        );
      } finally {
        await writeFile(htmlPath, originalHtml);
      }
    });
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("rejects disagreement between canonical and public market-brief data and embedded JSON", async (t) => {
  const isolatedRoot = await isolatedExportProject(false);
  const isolatedSnapshotPath = join(
    isolatedRoot,
    "data",
    "market",
    "current.json",
  );
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  const publicData = join(isolatedRoot, "public", "market-brief", "data.json");
  const canonicalHtml = join(
    isolatedRoot,
    "hyperframes",
    "weekly-ai-market-brief",
    "index.html",
  );
  const originalPublicData = await readFile(publicData, "utf8");
  const originalCanonicalHtml = await readFile(canonicalHtml, "utf8");

  try {
    await t.test("public data.json", async () => {
      const value = JSON.parse(originalPublicData) as Record<string, unknown>;
      value.runId = "2026-07-18-saturday";
      await writeFile(publicData, `${JSON.stringify(value)}\n`);
      try {
        await assert.rejects(
          () =>
            exportPages({
              projectRoot: isolatedRoot,
              snapshotPath: isolatedSnapshotPath,
              outputDirectory: isolatedOutput,
              build: false,
            }),
          /canonical and public.*do not match/i,
        );
      } finally {
        await writeFile(publicData, originalPublicData);
      }
    });

    await t.test("canonical embedded JSON", async () => {
      const staleHtml = originalCanonicalHtml.replace(
        '"dataCutoff":"2026-07-25T01:00:00.000Z"',
        '"dataCutoff":"2026-07-18T01:00:00.000Z"',
      );
      await writeFile(canonicalHtml, staleHtml);
      try {
        await assert.rejects(
          () =>
            exportPages({
              projectRoot: isolatedRoot,
              snapshotPath: isolatedSnapshotPath,
              outputDirectory: isolatedOutput,
              build: false,
            }),
          /canonical and public.*do not match/i,
        );
      } finally {
        await writeFile(canonicalHtml, originalCanonicalHtml);
      }
    });
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("rejects synchronized market-brief semantic tampering across every copied asset", async (t) => {
  const isolatedRoot = await isolatedExportProject(true);
  const output = join(isolatedRoot, "work", "pages-candidate");
  const snapshot = join(isolatedRoot, "data", "market", "current.json");
  await exportPages({
    projectRoot: isolatedRoot,
    snapshotPath: snapshot,
    outputDirectory: output,
  });
  const dataPaths = [
    join(
      isolatedRoot,
      "hyperframes",
      "weekly-ai-market-brief",
      "data.json",
    ),
    join(isolatedRoot, "public", "market-brief", "data.json"),
    join(isolatedRoot, "dist", "client", "market-brief", "data.json"),
  ];
  const htmlPaths = [
    join(
      isolatedRoot,
      "hyperframes",
      "weekly-ai-market-brief",
      "index.html",
    ),
    join(isolatedRoot, "public", "market-brief", "index.html"),
    join(isolatedRoot, "dist", "client", "market-brief", "index.html"),
  ];
  const originalData = await readFile(dataPaths[0], "utf8");
  const originalHtml = await Promise.all(
    htmlPaths.map((path) => readFile(path, "utf8")),
  );
  const cases: Array<[string, (brief: MarketBriefPayload) => void]> = [
    ["title", (brief) => (brief.labels.title.en = "Forged title")],
    ["summary", (brief) => (brief.labels.summary.zh = "偽造摘要")],
    ["methodology", (brief) => (brief.methodology.en = "Forged method")],
    [
      "disclaimer",
      (brief) => (brief.notInvestmentAdvice.zh = "偽造免責聲明"),
    ],
    ["tag", (brief) => (brief.labels.tags.en[0] = "Forged tag")],
    [
      "featured subset",
      (brief) => {
        brief.featuredSignalIds = [
          "pulse.accelerator_market",
          "pulse.power_queue",
          "pulse.enterprise_agents",
          "stocks.positive_breadth",
          "stocks.median_forward_pe",
          "stocks.catalyst_count",
          "compute.hbm_demand",
          "compute.packaging_lead_weeks",
        ];
      },
    ],
  ];

  try {
    for (const [name, mutate] of cases) {
      await t.test(name, async () => {
        const brief = JSON.parse(originalData) as MarketBriefPayload;
        mutate(brief);
        const serialized = `${JSON.stringify(brief, null, 2)}\n`;
        await Promise.all(dataPaths.map((path) => writeFile(path, serialized)));
        await Promise.all(
          htmlPaths.map((path, index) =>
            writeFile(
              path,
              originalHtml[index].replace(
                /<script id="embedded-market-brief" type="application\/json">[\s\S]*?<\/script>/,
                `<script id="embedded-market-brief" type="application/json">${JSON.stringify(
                  brief,
                ).replaceAll("<", "\\u003c")}</script>`,
              ),
            ),
          ),
        );

        await assert.rejects(
          () =>
            exportPages({
              projectRoot: isolatedRoot,
              snapshotPath: snapshot,
              outputDirectory: output,
              build: false,
            }),
          /semantics.*snapshot/i,
        );
      });
    }
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("exports the canonical changed-sic Wednesday brief without reconstructing a different feature subset", async () => {
  const isolatedRoot = await isolatedExportProject(true);
  const isolatedSnapshotPath = join(
    isolatedRoot,
    "data",
    "market",
    "current.json",
  );
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  const canonicalData = join(
    isolatedRoot,
    "hyperframes",
    "weekly-ai-market-brief",
    "data.json",
  );
  const canonicalHtml = join(
    isolatedRoot,
    "hyperframes",
    "weekly-ai-market-brief",
    "index.html",
  );
  const publicData = join(isolatedRoot, "public", "market-brief", "data.json");
  const publicHtml = join(isolatedRoot, "public", "market-brief", "index.html");
  const snapshot = JSON.parse(
    await readFile(isolatedSnapshotPath, "utf8"),
  ) as MarketSnapshot;
  snapshot.runId = "2026-07-29-wednesday";
  snapshot.cadence = "wednesday";
  snapshot.generatedAt = "2026-07-29T01:00:00.000Z";
  snapshot.dataCutoff = "2026-07-29T01:00:00.000Z";
  for (const metric of Object.values(snapshot.metrics)) {
    if (Date.parse(metric.asOf) > Date.parse(snapshot.dataCutoff)) {
      metric.asOf = snapshot.dataCutoff;
    }
  }
  snapshot.metrics["sic.market_2030_usd_b"].display = {
    en: "$24B",
    zh: "240 億美元",
  };
  snapshot.pages["/sic"].changed = true;
  snapshot.pages["/sic"].changeReasons = ["rounded-value-change"];
  await writeFile(
    isolatedSnapshotPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  try {
    await generateMarketBriefAssets({
      snapshotPath: isolatedSnapshotPath,
      validationMode: "published",
      canonicalData,
      canonicalHtml,
      publicData,
      publicHtml,
    });
    const brief = JSON.parse(await readFile(canonicalData, "utf8")) as {
      featuredSignalIds: string[];
    };
    assert.deepEqual(brief.featuredSignalIds, [
      "sic.market_2030_usd_b",
      "sic.wafer_frontier_mm",
      "sic.packaging_watts",
      "sic.ev_penetration",
      "pulse.infrastructure_spend",
    ]);

    const result = await exportPages({
      projectRoot: isolatedRoot,
      snapshotPath: isolatedSnapshotPath,
      outputDirectory: isolatedOutput,
    });

    assert.equal(result.runId, "2026-07-29-wednesday");
    assert.match(
      await readFile(join(isolatedOutput, "market-brief", "data.json"), "utf8"),
      /sic\.market_2030_usd_b/,
    );
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test("exports a month-end candidate with its prospective archive without mutating tracked storage", async () => {
  const isolatedRoot = await isolatedExportProject(true);
  const isolatedOutput = join(isolatedRoot, "work", "pages-candidate");
  const candidatePath = join(
    isolatedRoot,
    "data",
    "market",
    "candidate.json",
  );
  const monthlyIndexPath = join(
    isolatedRoot,
    "data",
    "market",
    "monthly",
    "index.json",
  );
  const canonicalData = join(
    isolatedRoot,
    "hyperframes",
    "weekly-ai-market-brief",
    "data.json",
  );
  const canonicalHtml = join(
    isolatedRoot,
    "hyperframes",
    "weekly-ai-market-brief",
    "index.html",
  );
  const publicData = join(isolatedRoot, "public", "market-brief", "data.json");
  const publicHtml = join(isolatedRoot, "public", "market-brief", "index.html");
  const originalMonthlyIndex = await readFile(monthlyIndexPath, "utf8");
  const originalTrackedMonthlyIndex = await readFile(
    join(projectRoot, "data", "market", "monthly", "index.json"),
    "utf8",
  );
  const candidate = structuredClone(validCandidate) as unknown as MarketSnapshot;
  candidate.runId = "2026-08-29-month-end";
  candidate.cadence = "month-end";
  candidate.generatedAt = "2026-08-29T01:00:00.000Z";
  candidate.dataCutoff = "2026-08-29T01:00:00.000Z";
  for (const metric of Object.values(candidate.metrics)) {
    metric.asOf = candidate.dataCutoff;
  }
  const review = autoPublishReview(candidate);
  const prospectiveArchive = projectMonthlyArchive(candidate, review, previousFull as unknown as MarketSnapshot);
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

  try {
    await generateMarketBriefAssets({
      snapshotPath: candidatePath,
      canonicalData,
      canonicalHtml,
      publicData,
      publicHtml,
    });
    const result = await exportPages({
      projectRoot: isolatedRoot,
      snapshotPath: candidatePath,
      outputDirectory: isolatedOutput,
      prospectiveArchive,
    });

    assert.ok(result.routes.includes("/archive/2026-08"));
    assert.equal(
      (
        await lstat(
          join(isolatedOutput, "archive", "2026-08", "index.html"),
        )
      ).isFile(),
      true,
    );
    assert.deepEqual(result.routeIdentities["/archive/2026-08"], {
      kind: "archive-detail",
      archiveMonth: "2026-08",
      runId: candidate.runId,
      dataCutoff: candidate.dataCutoff,
      sourceIds: prospectiveArchive.sourceIds,
    });
    assert.equal(await readFile(monthlyIndexPath, "utf8"), originalMonthlyIndex);
    assert.equal(
      await readFile(
        join(projectRoot, "data", "market", "monthly", "index.json"),
        "utf8",
      ),
      originalTrackedMonthlyIndex,
    );
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});
