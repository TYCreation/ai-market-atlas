import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCandidate } from "./normalize.ts";
import {
  reviewCandidate,
  type AutomatedReview,
} from "./review.ts";
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "./schema.ts";
import type { MarketSnapshot } from "./types.ts";
import {
  promoteCandidate,
  type PromotionResult,
  type StoragePaths,
} from "./storage.ts";
import {
  exportPages,
  type ExportPagesResult,
} from "../scripts/export-pages.ts";
import { generateMarketBriefAssets } from "../scripts/generate-market-brief.ts";

export type FixturePipelineResult = {
  review: AutomatedReview;
  promotedRunId?: string;
  exportedRoutes: string[];
  deploymentAttempted: false;
};

export type FixturePipelineDependencies = {
  review(
    candidate: MarketSnapshot,
    previous: MarketSnapshot,
  ): Promise<AutomatedReview>;
  promote(
    paths: StoragePaths,
    expectedCandidateSha256: string,
  ): Promise<PromotionResult>;
  generateBrief: typeof generateMarketBriefAssets;
  buildAndExport(options: {
    projectRoot: string;
    snapshotPath: string;
    outputDirectory: string;
    authorizedCandidateSha256: string;
  }): Promise<ExportPagesResult>;
  deploy(): Promise<never>;
};

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const defaultDependencies: FixturePipelineDependencies = {
  review: (candidate, previous) =>
    reviewCandidate(
      candidate,
      previous,
      async () => new Response("", { status: 200 }),
      async () => ["93.184.216.34"],
    ),
  promote: promoteCandidate,
  generateBrief: generateMarketBriefAssets,
  buildAndExport: (options) => exportPages(options),
  deploy: async () => {
    throw new Error(
      "fixture mode cannot deploy; use scripts/deploy-pages.ts for production",
    );
  },
};

async function isolatedProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "market-fixture-pipeline-"));
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
  ]) {
    await cp(join(repositoryRoot, directory), join(root, directory), {
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
    await cp(join(repositoryRoot, file), join(root, file));
  }
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  await writeFile(
    join(root, "data", "market", "monthly", "index.json"),
    "{}\n",
  );
  await rm(join(root, "data", "market", "runs"), {
    recursive: true,
    force: true,
  });
  await mkdir(join(root, "data", "market", "runs"), { recursive: true });
  return root;
}

function fixtureCandidate(value: unknown): MarketSnapshot {
  assertMarketSnapshot(value);
  const candidate = structuredClone(value);
  // Quality-gate fixtures contain numeric stress sentinels unrelated to the
  // pipeline behavior under test. Keep those sentinels inside fixture mode.
  for (const page of Object.values(candidate.pages)) {
    const thesisSurvivalRationale = page.report.thesisSurvivalRationale;
    page.report = JSON.parse(
      JSON.stringify(page.report).replaceAll(/\d/g, "x"),
    ) as typeof page.report;
    if (thesisSurvivalRationale !== undefined) {
      page.report.thesisSurvivalRationale = thesisSurvivalRationale;
    }
  }
  for (const metric of Object.values(candidate.metrics)) {
    if (
      metric.kind === "modeled" &&
      /^stocks\..+\.weekReturn$/.test(metric.id) &&
      Math.abs(metric.numericValue) > 20
    ) {
      const numericValue = Math.sign(metric.numericValue) * 19.9;
      metric.numericValue = numericValue;
      metric.display = {
        en: `${numericValue}%`,
        zh: `${numericValue}%`,
      };
      metric.observations = metric.observations.map((observation) => ({
        ...observation,
        numericValue,
      }));
    }
  }
  return candidate;
}

function priorFixtureSnapshot(candidate: MarketSnapshot): MarketSnapshot {
  const previous = structuredClone(candidate);
  previous.runId = "2026-07-25-saturday";
  previous.cadence = "saturday";
  previous.generatedAt = "2026-07-25T01:00:00.000Z";
  previous.dataCutoff = "2026-07-25T01:00:00.000Z";
  for (const page of Object.values(previous.pages)) {
    page.verifiedAt = previous.generatedAt;
  }
  for (const metric of Object.values(previous.metrics)) {
    metric.previousNumericValue = metric.numericValue;
  }
  assertPublishedMarketSnapshot(previous);
  return previous;
}

async function regularJson(path: string): Promise<unknown> {
  const resolved = resolve(path);
  const metadata = await lstat(resolved);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("fixture candidate must be a regular file");
  }
  return JSON.parse(await readFile(resolved, "utf8")) as unknown;
}

export async function runFixturePipeline(
  candidatePath: string,
  dependencies: FixturePipelineDependencies = defaultDependencies,
): Promise<FixturePipelineResult> {
  const root = await isolatedProject();
  try {
    const marketRoot = join(root, "data", "market");
    const candidate = fixtureCandidate(await regularJson(candidatePath));
    const previous = priorFixtureSnapshot(candidate);
    const normalized = normalizeCandidate(
      candidate,
      previous,
      new Date(candidate.generatedAt),
    );
    const isolatedCandidatePath = join(marketRoot, "candidate.json");
    const currentPath = join(marketRoot, "current.json");
    const reviewsDir = join(marketRoot, "reviews");
    const reviewPath = join(reviewsDir, `${normalized.runId}.json`);
    const storagePaths: StoragePaths = {
      candidatePath: isolatedCandidatePath,
      reviewPath,
      currentPath,
      runsDir: join(marketRoot, "runs"),
      monthlyIndexPath: join(marketRoot, "monthly", "index.json"),
      reviewsDir,
    };
    await Promise.all([
      mkdir(reviewsDir, { recursive: true }),
      mkdir(storagePaths.runsDir, { recursive: true }),
      writeFile(
        isolatedCandidatePath,
        `${JSON.stringify(normalized, null, 2)}\n`,
      ),
      writeFile(currentPath, `${JSON.stringify(previous, null, 2)}\n`),
    ]);

    const review = await dependencies.review(normalized, previous);
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
    if (review.decision !== "auto_publish") {
      return {
        review,
        exportedRoutes: [],
        deploymentAttempted: false,
      };
    }

    const promotion = await dependencies.promote(
      storagePaths,
      review.candidateSha256,
    );
    await dependencies.generateBrief({
      snapshotPath: currentPath,
      validationMode: "published",
      canonicalData: join(
        root,
        "hyperframes/weekly-ai-market-brief/data.json",
      ),
      publicData: join(root, "public/market-brief/data.json"),
      canonicalHtml: join(
        root,
        "hyperframes/weekly-ai-market-brief/index.html",
      ),
      publicHtml: join(root, "public/market-brief/index.html"),
    });
    const exported = await dependencies.buildAndExport({
      projectRoot: root,
      snapshotPath: currentPath,
      outputDirectory: join(root, "work", "pages-candidate"),
      authorizedCandidateSha256: promotion.promotedSha256,
    });
    return {
      review,
      promotedRunId: promotion.runId,
      exportedRoutes: exported.routes,
      deploymentAttempted: false,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
