import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { hashArtifactTree } from "../market-data/artifact-tree.ts";
import type { RouteVerificationIdentity } from "../market-data/deployment.ts";
import { parseMonthlyArchiveIndex } from "../market-data/monthly.ts";
import {
  assertMonthlyArchiveRecord,
  type MonthlyArchiveRecord,
} from "../market-data/monthly-record.ts";
import { hashCandidate } from "../market-data/review.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "../market-data/schema.ts";
import type { MarketSnapshot } from "../market-data/types.ts";
import { buildSourceBundles } from "../market-data/view-model.ts";
import { loadPublishedBriefs } from "../market-data/briefs.ts";
import { briefRoutePaths } from "../market-data/brief-routes.ts";
import {
  discoverEligibleEntityRecords,
  entityRoutePaths,
  extractEntityHubs,
} from "../market-data/entity-pages.ts";
import {
  assertMarketBriefMatchesSnapshot,
  isMarketBriefPayload,
  marketBriefPayloadSha256,
  type MarketBriefPayload,
  type SnapshotValidationMode,
} from "./generate-market-brief.ts";

type WorkerModule = {
  default: {
    fetch(
      request: Request,
      env: Record<string, unknown>,
      context: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      },
    ): Promise<Response>;
  };
};

export type ExportPagesOptions = {
  projectRoot?: string;
  snapshotPath?: string;
  outputDirectory?: string;
  build?: boolean;
  authorizedCandidateSha256?: string;
  prospectiveArchive?: MonthlyArchiveRecord;
};

export type ExportPagesResult = {
  outputDirectory: string;
  routes: string[];
  runId: string;
  dataCutoff: string;
  archiveMonths: string[];
  sourceIds: string[];
  archiveSourceIds: Record<string, string[]>;
  candidateSha256: string;
  artifactTreeSha256: string;
  manifestSha256: string;
  routeIdentities: Record<string, RouteVerificationIdentity>;
};

export type DeploymentManifest = Omit<
  ExportPagesResult,
  "outputDirectory" | "manifestSha256"
>;

const CURRENT_ROUTES = [
  "/",
  "/stocks",
  "/compute",
  "/energy",
  "/models",
  "/sic",
] as const;
const EN_CURRENT_ROUTES = CURRENT_ROUTES.map((route) =>
  route === "/" ? "/en" : `/en${route}`,
);

const SITE_ORIGIN = "https://aimarketatlas.net";

function canonicalUrl(route: string): string {
  const normalized =
    route === "/" ? "/" : route.endsWith("/") ? route : `${route}/`;
  return new URL(normalized, SITE_ORIGIN).href;
}

const CANONICAL_LINK = /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi;

/**
 * Rendered routes declare their own canonical through Next's metadata API, so the
 * export only has to assert that each one arrived exactly once. A canonical appended
 * here would sit outside the React tree and be stripped during hydration.
 */
function assertSingleCanonical(html: string, route: string): void {
  const found = html.match(CANONICAL_LINK) ?? [];
  if (found.length !== 1) {
    throw new Error(
      `export must contain exactly one canonical for ${route}, found ${found.length}`,
    );
  }
  const expected = `href="${canonicalUrl(route)}"`;
  if (!found[0].includes(expected)) {
    throw new Error(
      `export canonical for ${route} does not name ${canonicalUrl(route)}`,
    );
  }
}

function localizeHtmlLang(html: string, route: string): string {
  if (route !== "/en" && !route.startsWith("/en/")) return html;
  return html.replace('<html lang="zh-Hant">', '<html lang="en">');
}

/**
 * The HyperFrames deck under `public/market-brief/` is a static file rather than a
 * Next route, so its head tags still have to be written in by hand.
 */
function injectBriefHead(html: string, route: string, tags: string): string {
  if (html.match(CANONICAL_LINK)) {
    throw new Error(`export already contains canonical metadata for ${route}`);
  }
  if (!html.includes("</head>")) {
    throw new Error(`export is missing a head element for ${route}`);
  }
  return html.replace("</head>", `${tags}</head>`);
}

function sitemapXml(routes: Array<{ route: string; lastModified: string }>): string {
  const entries = routes
    .map(
      ({ route, lastModified }) =>
        `  <url><loc>${canonicalUrl(route)}</loc><lastmod>${lastModified}</lastmod></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function assertEntityExportCompleteness(
  eligibleEntities: Array<{
    slug: string;
    lastModified: string;
    sources: Array<{ id: string }>;
  }>,
  exportedEntities: Array<{ slug: string }>,
  renderedRoutes: string[],
  routeIdentities: Record<string, RouteVerificationIdentity>,
  sitemapRoutes: Array<{ route: string; lastModified: string }>,
): void {
  const eligibleSlugs = eligibleEntities.map((entity) => entity.slug).sort();
  const exportedSlugs = exportedEntities.map((entity) => entity.slug).sort();
  if (JSON.stringify(exportedSlugs) !== JSON.stringify(eligibleSlugs)) {
    throw new Error(
      `entity export completeness mismatch: eligible=${eligibleSlugs.join(",")} exported=${exportedSlugs.join(",")}`,
    );
  }
  for (const entity of eligibleEntities) {
    const expectedSourceIds = entity.sources.map((source) => source.id).sort();
    for (const route of [`/entity/${entity.slug}/`, `/en/entity/${entity.slug}/`]) {
      if (!renderedRoutes.includes(route)) {
        throw new Error(`entity export completeness is missing route ${route}`);
      }
      const identity = routeIdentities[route];
      if (
        identity?.kind !== "entity-detail" ||
        identity.entitySlug !== entity.slug ||
        identity.lastModified !== entity.lastModified ||
        JSON.stringify(identity.sourceIds) !== JSON.stringify(expectedSourceIds)
      ) {
        throw new Error(`entity export completeness identity mismatch for ${route}`);
      }
      const sitemapEntry = sitemapRoutes.find((entry) => entry.route === route);
      if (sitemapEntry?.lastModified !== entity.lastModified) {
        throw new Error(`entity export completeness sitemap mismatch for ${route}`);
      }
    }
  }
}

function redirectWorker(): string {
  return `const PRIMARY_ORIGIN = "${SITE_ORIGIN}";
const REDIRECT_HOSTS = new Set([
  "aimarket.tycreation.online",
  "www.aimarketatlas.net",
  "ai-market-atlas.pages.dev",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (REDIRECT_HOSTS.has(url.hostname)) {
      return Response.redirect(
        PRIMARY_ORIGIN + url.pathname + url.search,
        301,
      );
    }
    return env.ASSETS.fetch(request);
  },
};
`;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, 10 * 60 * 1_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${command} timed out after ten minutes`));
        return;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}`,
        ),
      );
    });
  });
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
}

async function assertDirectoryTreeSafe(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`export source directory is unsafe: ${path}`);
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`export source contains a symlink: ${child}`);
    }
    if (entry.isDirectory()) await assertDirectoryTreeSafe(child);
  }
}

async function assertOutputPathSafe(
  projectRoot: string,
  outputDirectory: string,
): Promise<void> {
  const workDirectory = resolve(projectRoot, "work");
  if (
    dirname(outputDirectory) !== workDirectory ||
    !["pages-candidate", "pages-last-good"].includes(basename(outputDirectory))
  ) {
    throw new Error("export output directory is unsafe");
  }
  try {
    const workMetadata = await lstat(workDirectory);
    if (workMetadata.isSymbolicLink() || !workMetadata.isDirectory()) {
      throw new Error("export work directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    const metadata = await lstat(outputDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("export output directory is unsafe");
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function contentType(path: string): string {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".jpg": "image/jpeg",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extname(path)] ?? "application/octet-stream"
  );
}

function routeFile(directory: string, route: string): string {
  return route === "/"
    ? join(directory, "index.html")
    : join(directory, route.slice(1), "index.html");
}

async function replaceDirectoryAtomically(
  temporary: string,
  destination: string,
): Promise<void> {
  const backup = join(
    dirname(destination),
    `.${basename(destination)}.${process.pid}.${randomUUID()}.backup`,
  );
  let movedExisting = false;
  try {
    await rename(destination, backup);
    movedExisting = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    await rename(temporary, destination);
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting) await rename(backup, destination);
    throw error;
  }
}

async function listHtmlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listHtmlFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

function parseEmbeddedMarketBrief(html: string): unknown {
  const match =
    /<script id="embedded-market-brief" type="application\/json">([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (!match) throw new Error("copied market brief embedded identity is missing");
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    throw new Error("copied market brief embedded identity is invalid");
  }
}

function assertMarketBriefIdentity(
  value: unknown,
  expected: MarketBriefPayload,
  label: string,
): void {
  if (
    !isMarketBriefPayload(value) ||
    marketBriefPayloadSha256(value) !== marketBriefPayloadSha256(expected) ||
    value.dataCutoff !== expected.dataCutoff ||
    JSON.stringify([...value.sourceIds].sort()) !==
      JSON.stringify([...expected.sourceIds].sort()) ||
    hashCandidate(value) !== hashCandidate(expected)
  ) {
    throw new Error(`${label} market brief identity does not match snapshot`);
  }
}

async function loadBoundMarketBrief(
  projectRoot: string,
  snapshot: MarketSnapshot,
  validationMode: SnapshotValidationMode,
): Promise<MarketBriefPayload> {
  const canonicalDataPath = join(
    projectRoot,
    "hyperframes/weekly-ai-market-brief/data.json",
  );
  const [
    canonicalDataText,
    publicDataText,
    canonicalHtml,
    publicHtml,
  ] = await Promise.all([
    readFile(canonicalDataPath, "utf8"),
    readFile(join(projectRoot, "public/market-brief/data.json"), "utf8"),
    readFile(
      join(projectRoot, "hyperframes/weekly-ai-market-brief/index.html"),
      "utf8",
    ),
    readFile(join(projectRoot, "public/market-brief/index.html"), "utf8"),
  ]);
  if (canonicalDataText !== publicDataText) {
    throw new Error("canonical and public market brief data do not match");
  }
  let canonicalData: unknown;
  let publicData: unknown;
  try {
    canonicalData = JSON.parse(canonicalDataText) as unknown;
    publicData = JSON.parse(publicDataText) as unknown;
  } catch {
    throw new Error("canonical market brief data.json is invalid");
  }
  assertMarketBriefMatchesSnapshot(
    canonicalData,
    snapshot,
    "canonical market brief",
    validationMode,
  );
  const expectedSha256 = hashCandidate(canonicalData);
  if (
    [publicData, parseEmbeddedMarketBrief(canonicalHtml), parseEmbeddedMarketBrief(publicHtml)]
      .some(
        (payload) =>
          !isMarketBriefPayload(payload) ||
          hashCandidate(payload) !== expectedSha256,
      )
  ) {
    throw new Error(
      "canonical and public market brief data and embedded JSON do not match",
    );
  }
  return canonicalData;
}

export async function exportPages(
  options: ExportPagesOptions = {},
): Promise<ExportPagesResult> {
  const projectRoot = resolve(
    options.projectRoot ??
      fileURLToPath(new URL("../", import.meta.url)),
  );
  const snapshotPath = resolve(
    projectRoot,
    options.snapshotPath ?? "data/market/current.json",
  );
  const outputDirectory = resolve(
    projectRoot,
    options.outputDirectory ?? "work/pages-candidate",
  );
  if (
    dirname(snapshotPath) !== resolve(projectRoot, "data/market") ||
    !["candidate.json", "current.json"].includes(basename(snapshotPath))
  ) {
    throw new Error("market snapshot path is unsafe");
  }
  await assertOutputPathSafe(projectRoot, outputDirectory);
  await assertRegularFile(snapshotPath, "market snapshot");
  const snapshot: unknown = JSON.parse(await readFile(snapshotPath, "utf8"));
  const validationMode: SnapshotValidationMode =
    basename(snapshotPath) === "candidate.json" ? "candidate" : "published";
  if (validationMode === "candidate") {
    assertMarketSnapshot(snapshot);
  } else {
    assertPublishedMarketSnapshot(snapshot);
  }
  const canonicalBrief = await loadBoundMarketBrief(
    projectRoot,
    snapshot,
    validationMode,
  );
  const candidateSha256 = hashCandidate(snapshot);
  if (
    options.authorizedCandidateSha256 !== undefined &&
    options.authorizedCandidateSha256 !== candidateSha256
  ) {
    throw new Error("snapshot no longer matches its authorized candidate hash");
  }

  const monthlyIndexPath = resolve(
    projectRoot,
    "data/market/monthly/index.json",
  );
  await assertRegularFile(monthlyIndexPath, "monthly archive index");
  const trackedMonthlyIndex: unknown = JSON.parse(
    await readFile(monthlyIndexPath, "utf8"),
  );
  const trackedMonthlyArchives = parseMonthlyArchiveIndex(trackedMonthlyIndex);
  let exportMonthlyIndex = trackedMonthlyIndex as Record<
    string,
    MonthlyArchiveRecord
  >;
  if (options.prospectiveArchive !== undefined) {
    assertMonthlyArchiveRecord(options.prospectiveArchive);
    if (
      snapshot.cadence !== "month-end" ||
      options.prospectiveArchive.runId !== snapshot.runId ||
      options.prospectiveArchive.dataCutoff !== snapshot.dataCutoff ||
      trackedMonthlyArchives.some(
        ({ archive }) => archive.month === options.prospectiveArchive?.month,
      )
    ) {
      throw new Error("prospective monthly archive does not match candidate");
    }
    if (options.build === false) {
      throw new Error("prospective monthly archive requires a fresh build");
    }
    exportMonthlyIndex = {
      ...exportMonthlyIndex,
      [options.prospectiveArchive.month]: options.prospectiveArchive,
    };
  }

  let temporaryMonthlyIndex: string | undefined;
  if (options.prospectiveArchive !== undefined) {
    const workDirectory = resolve(projectRoot, "work");
    await mkdir(workDirectory, { recursive: true });
    temporaryMonthlyIndex = join(
      workDirectory,
      `.monthly-index.${process.pid}.${randomUUID()}.json`,
    );
    await writeFile(
      temporaryMonthlyIndex,
      `${JSON.stringify(exportMonthlyIndex, null, 2)}\n`,
      { flag: "wx" },
    );
  }
  try {
    if (options.build !== false) {
      await runCommand("npm", ["run", "build"], {
        cwd: projectRoot,
        env: {
          ...process.env,
          MARKET_SNAPSHOT_PATH: snapshotPath,
          MARKET_MONTHLY_INDEX_PATH:
            temporaryMonthlyIndex ?? monthlyIndexPath,
          WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
        },
      });
    }
  } finally {
    if (temporaryMonthlyIndex !== undefined) {
      await rm(temporaryMonthlyIndex, { force: true });
    }
  }

  const clientDirectory = resolve(projectRoot, "dist/client");
  const serverPath = resolve(projectRoot, "dist/server/index.js");
  await Promise.all([
    assertDirectoryTreeSafe(clientDirectory),
    assertRegularFile(serverPath, "built Vinext server"),
  ]);
  const monthlyArchives = parseMonthlyArchiveIndex(exportMonthlyIndex);
  const publishedBriefs = await loadPublishedBriefs(
    join(projectRoot, "data", "market", "runs"),
    join(projectRoot, "data", "market", "reviews"),
  );
  const eligibleEntities = discoverEligibleEntityRecords(publishedBriefs);
  const entities = extractEntityHubs(publishedBriefs);
  const entityRoutes = entityRoutePaths(entities);
  const archiveMonths = monthlyArchives.map(
    ({ archive }) => archive.month,
  );
  const sourceIds = Object.keys(snapshot.sources).sort();
  const archiveSourceIds = Object.fromEntries(
    monthlyArchives.map(({ archive }) => [
      archive.month,
      [...archive.sourceIds].sort(),
    ]),
  );
  const sourceBundles = buildSourceBundles(snapshot);
  const routeIdentities: Record<string, RouteVerificationIdentity> = {
    ...Object.fromEntries(
      CURRENT_ROUTES.map((route) => [
        route,
        {
          kind: "current" as const,
          runId: snapshot.runId,
          dataCutoff: snapshot.dataCutoff,
          sourceIds: sourceBundles[route].sources
            .map((source) => source.id)
            .sort(),
        },
      ]),
    ),
    ...Object.fromEntries(
      EN_CURRENT_ROUTES.map((route, index) => {
        const sourceRoute = CURRENT_ROUTES[index];
        return [route, {
          kind: "current" as const,
          runId: snapshot.runId,
          dataCutoff: snapshot.dataCutoff,
          sourceIds: sourceBundles[sourceRoute].sources.map((source) => source.id).sort(),
        }];
      }),
    ),
    "/archive": {
      kind: "archive-index",
      archiveMonths,
    },
    "/en/archive": {
      kind: "archive-index",
      archiveMonths,
    },
    ...Object.fromEntries(
      monthlyArchives.map(({ archive }) => [
        `/archive/${archive.month}`,
        {
          kind: "archive-detail" as const,
          archiveMonth: archive.month,
          runId: archive.runId,
          dataCutoff: archive.dataCutoff,
          sourceIds: [...archive.sourceIds].sort(),
        },
      ]),
    ),
    ...Object.fromEntries(
      publishedBriefs.flatMap((brief) => {
        const sourceIds = buildSourceBundles(brief.snapshot)["/"].sources
          .map((source) => source.id)
          .sort();
        const identity = {
          kind: "brief-detail" as const,
          briefDate: brief.date,
          runId: brief.snapshot.runId,
          dataCutoff: brief.snapshot.dataCutoff,
          sourceIds,
        };
        return [
          [`/brief/${brief.date}/`, identity],
          [`/en/brief/${brief.date}/`, identity],
        ];
      }),
    ),
    ...Object.fromEntries(
      entities.flatMap((entity) => {
        const identity = {
          kind: "entity-detail" as const,
          entitySlug: entity.slug,
          lastModified: entity.lastModified,
          sourceIds: entity.sources.map((source) => source.id).sort(),
        };
        return [
          [`/entity/${entity.slug}/`, identity],
          [`/en/entity/${entity.slug}/`, identity],
        ];
      }),
    ),
    ...Object.fromEntries(
      monthlyArchives.map(({ archive }) => [
        `/en/archive/${archive.month}`,
        {
          kind: "archive-detail" as const,
          archiveMonth: archive.month,
          runId: archive.runId,
          dataCutoff: archive.dataCutoff,
          sourceIds: [...archive.sourceIds].sort(),
        },
      ]),
    ),
    "/market-brief/": {
      kind: "market-brief",
      dataCutoff: canonicalBrief.dataCutoff,
      sourceIds: [...canonicalBrief.sourceIds].sort(),
      payloadSha256: marketBriefPayloadSha256(canonicalBrief),
    },
  };
  const renderedRoutes = [
    ...CURRENT_ROUTES,
    ...EN_CURRENT_ROUTES,
    "/archive",
    "/en/archive",
    ...archiveMonths.map((month) => `/archive/${month}`),
    ...archiveMonths.map((month) => `/en/archive/${month}`),
    ...briefRoutePaths(publishedBriefs),
    ...entityRoutes,
  ];
  // `routes` is the set the deploy verifier walks (see deploy-pages.ts, which calls
  // the verifier with `manifest.routes`), so the HyperFrames deck stays in it and keeps
  // its payload hash checked. It is deliberately absent from the sitemap: it is
  // orphaned, thin and duplicative, and is served noindex.
  const routes = [...renderedRoutes, "/market-brief/"];
  const sitemapRoutes = renderedRoutes.map((route) => {
    const brief = publishedBriefs.find((entry) => route.includes(`/brief/${entry.date}/`));
    const archive = monthlyArchives.find(({ archive: entry }) => route.endsWith(`/archive/${entry.month}`));
    const entity = entities.find(
      (entry) =>
        route === `/entity/${entry.slug}/` ||
        route === `/en/entity/${entry.slug}/`,
    );
    return {
      route,
      lastModified:
        brief?.snapshot.dataCutoff ??
        archive?.archive.dataCutoff ??
        entity?.lastModified ??
        snapshot.dataCutoff,
    };
  });
  assertEntityExportCompleteness(
    eligibleEntities,
    entities,
    renderedRoutes,
    routeIdentities,
    sitemapRoutes,
  );

  const workDirectory = dirname(outputDirectory);
  await mkdir(workDirectory, { recursive: true });
  const temporary = join(
    workDirectory,
    `.${basename(outputDirectory)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let artifactTreeSha256: string;
  let manifestSha256: string;
  try {
    await cp(clientDirectory, temporary, {
      recursive: true,
      dereference: false,
      force: false,
      errorOnExist: true,
    });
    const copiedBriefData: unknown = JSON.parse(
      await readFile(join(temporary, "market-brief", "data.json"), "utf8"),
    );
    const copiedBriefHtmlPath = join(temporary, "market-brief", "index.html");
    const copiedBriefHtml = await readFile(copiedBriefHtmlPath, "utf8");
    assertMarketBriefIdentity(
      copiedBriefData,
      canonicalBrief,
      "copied data.json",
    );
    assertMarketBriefIdentity(
      parseEmbeddedMarketBrief(copiedBriefHtml),
      canonicalBrief,
      "copied embedded JSON",
    );
    await writeFile(
      copiedBriefHtmlPath,
      injectBriefHead(
        copiedBriefHtml,
        "/market-brief/",
        `<meta name="robots" content="noindex, follow"/>` +
          `<link rel="canonical" href="${canonicalUrl("/market-brief/")}"/>`,
      ),
    );
    const workerUrl = pathToFileURL(serverPath);
    workerUrl.searchParams.set("export", randomUUID());
    const worker = (await import(workerUrl.href)) as WorkerModule;
    const assets = {
      fetch: async (request: Request) => {
        const pathname = decodeURIComponent(new URL(request.url).pathname);
        const path = resolve(clientDirectory, `.${pathname}`);
        const assetRelativePath = relative(clientDirectory, path);
        if (
          assetRelativePath.startsWith("..") ||
          assetRelativePath.includes("\\..\\") ||
          resolve(clientDirectory, assetRelativePath) !== path
        ) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const metadata = await stat(path);
          if (!metadata.isFile()) return new Response("Not found", { status: 404 });
          return new Response(await readFile(path), {
            status: 200,
            headers: { "content-type": contentType(path) },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    };
    for (const route of renderedRoutes) {
      // Vinext renders dynamic segments at the slashless request form, while the
      // exported directory and canonical URL deliberately use the served trailing slash.
      const renderRequestRoute = route === "/" ? route : route.replace(/\/$/, "");
      const response = await worker.default.fetch(
        new Request(`${SITE_ORIGIN}${renderRequestRoute}`, {
          headers: {
            accept: "text/html",
            "x-forwarded-host": "aimarketatlas.net",
            "x-forwarded-proto": "https",
          },
        }),
        { ASSETS: assets },
        {
          waitUntil() {},
          passThroughOnException() {},
        },
      );
      if (response.status !== 200) {
        throw new Error(`Vinext export returned HTTP ${response.status} for ${route}`);
      }
      const rendered = await response.text();
      assertSingleCanonical(rendered, route);
      const html = localizeHtmlLang(rendered, route);
      if (/localhost|127\.0\.0\.1/i.test(html)) {
        throw new Error(`Vinext export contains localhost metadata for ${route}`);
      }
      const destination = routeFile(temporary, route);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, html, { flag: "wx" });
    }
    for (const invalidRoute of ["/brief/2026-02-30", "/en/brief/2026-02-30"]) {
      const response = await worker.default.fetch(
        new Request(`${SITE_ORIGIN}${invalidRoute}`, {
          headers: {
            accept: "text/html",
            "x-forwarded-host": "aimarketatlas.net",
            "x-forwarded-proto": "https",
          },
        }),
        { ASSETS: assets },
        { waitUntil() {}, passThroughOnException() {} },
      );
      if (response.status !== 404) {
        throw new Error(`Vinext export returned HTTP ${response.status} for invalid dated brief ${invalidRoute}`);
      }
    }
    for (const invalidRoute of ["/entity/not-a-retained-entity", "/en/entity/not-a-retained-entity"]) {
      const response = await worker.default.fetch(
        new Request(`${SITE_ORIGIN}${invalidRoute}`, {
          headers: {
            accept: "text/html",
            "x-forwarded-host": "aimarketatlas.net",
            "x-forwarded-proto": "https",
          },
        }),
        { ASSETS: assets },
        { waitUntil() {}, passThroughOnException() {} },
      );
      if (response.status !== 404) {
        throw new Error(`Vinext export returned HTTP ${response.status} for invalid entity ${invalidRoute}`);
      }
    }
    const notFoundResponse = await worker.default.fetch(
      new Request(`${SITE_ORIGIN}/${randomUUID()}`, {
        headers: {
          accept: "text/html",
          "x-forwarded-host": "aimarketatlas.net",
          "x-forwarded-proto": "https",
        },
      }),
      { ASSETS: assets },
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );
    if (notFoundResponse.status !== 404) {
      throw new Error(
        `Vinext export returned HTTP ${notFoundResponse.status} for the not-found route`,
      );
    }
    const notFoundHtml = await notFoundResponse.text();
    if (/rel=["']canonical["']/i.test(notFoundHtml)) {
      throw new Error("not-found export must not declare a canonical");
    }
    await Promise.all([
      writeFile(join(temporary, "404.html"), notFoundHtml, { flag: "wx" }),
      writeFile(
        join(temporary, "robots.txt"),
        [
          "User-agent: *",
          "Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference",
          "Allow: /",
          "",
          `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
          "",
        ].join("\n"),
        { flag: "wx" },
      ),
      writeFile(
        join(temporary, "sitemap.xml"),
        sitemapXml(sitemapRoutes),
        { flag: "wx" },
      ),
      writeFile(
        join(temporary, "_redirects"),
        [
          `https://aimarket.tycreation.online/* ${SITE_ORIGIN}/:splat 301`,
          `https://www.aimarketatlas.net/* ${SITE_ORIGIN}/:splat 301`,
          `https://ai-market-atlas.pages.dev/* ${SITE_ORIGIN}/:splat 301`,
          "",
        ].join("\n"),
        { flag: "wx" },
      ),
      writeFile(join(temporary, "_worker.js"), redirectWorker(), {
        flag: "wx",
      }),
    ]);
    for (const htmlPath of await listHtmlFiles(temporary)) {
      if (/localhost|127\.0\.0\.1/i.test(await readFile(htmlPath, "utf8"))) {
        throw new Error(`export contains localhost metadata: ${htmlPath}`);
      }
    }
    artifactTreeSha256 = await hashArtifactTree(temporary);
    const manifest: DeploymentManifest = {
      routes,
      runId: snapshot.runId,
      dataCutoff: snapshot.dataCutoff,
      archiveMonths,
      sourceIds,
      archiveSourceIds,
      candidateSha256,
      artifactTreeSha256,
      routeIdentities,
    };
    manifestSha256 = hashCandidate(manifest);
    await writeFile(
      join(temporary, ".market-deployment.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    );
    await replaceDirectoryAtomically(temporary, outputDirectory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  return {
    outputDirectory,
    routes,
    runId: snapshot.runId,
    dataCutoff: snapshot.dataCutoff,
    archiveMonths,
    sourceIds,
    archiveSourceIds,
    candidateSha256,
    artifactTreeSha256,
    manifestSha256,
    routeIdentities,
  };
}

function option(args: string[], name: string): string | undefined {
  const matches = args
    .map((argument, index) => ({ argument, index }))
    .filter(({ argument }) => argument === name);
  if (matches.length > 1) throw new Error(`duplicate ${name} option`);
  if (matches.length === 0) return undefined;
  const value = args[matches[0].index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const allowed = new Set(["--snapshot", "--output", "--no-build"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument)) throw new Error(`unknown option: ${argument}`);
    if (argument !== "--no-build") index += 1;
  }
  const result = await exportPages({
    snapshotPath: option(args, "--snapshot"),
    outputDirectory: option(args, "--output"),
    build: !args.includes("--no-build"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
