import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  copyDirectoryAtomically,
  runDeployPagesAtProjectRoot,
  wranglerDeploy,
  type CommandRunner,
  type DeployPagesRuntime,
} from "../../scripts/deploy-pages.ts";
import { makeFixtureWorkspace } from "./helpers.ts";

test("wrangler deployment uses a fixed argument vector without shell interpolation", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: CommandRunner = async (command, args) => {
    calls.push({ command, args: [...args] });
  };

  await wranglerDeploy(
    "work/pages-candidate",
    "market-update-2026-08-01-saturday",
    runner,
  );

  assert.deepEqual(calls, [
    {
      command: "npx",
      args: [
        "wrangler",
        "pages",
        "deploy",
        "work/pages-candidate",
        "--project-name",
        "ai-market-atlas",
        "--branch",
        "market-update-2026-08-01-saturday",
      ],
    },
  ]);
});

test("wrangler deployment rejects command-like branches and traversal before running", async () => {
  let calls = 0;
  const runner: CommandRunner = async () => {
    calls += 1;
  };

  await assert.rejects(
    () => wranglerDeploy("../pages-candidate", "main", runner),
    /directory|unsafe/i,
  );
  await assert.rejects(
    () => wranglerDeploy("work/pages-candidate", "main; rm -rf", runner),
    /branch|unsafe/i,
  );
  assert.equal(calls, 0);
});

test("replaces last-good atomically and rejects symlinked candidate content", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-deploy-copy-"));
  const candidate = join(root, "work", "pages-candidate");
  const lastGood = join(root, "work", "pages-last-good");
  await Promise.all([
    mkdir(candidate, { recursive: true }),
    mkdir(lastGood, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(candidate, "index.html"), "candidate"),
    writeFile(join(lastGood, "index.html"), "last-good"),
  ]);

  await copyDirectoryAtomically(candidate, lastGood);
  assert.equal(await readFile(join(lastGood, "index.html"), "utf8"), "candidate");

  const outside = join(root, "outside.txt");
  await writeFile(outside, "outside");
  await symlink(outside, join(candidate, "unsafe-link"));
  await assert.rejects(
    () => copyDirectoryAtomically(candidate, lastGood),
    /symlink/i,
  );
  assert.equal(await readFile(join(lastGood, "index.html"), "utf8"), "candidate");
  assert.equal(dirname(lastGood), join(root, "work"));
});

test("orchestration rejects missing, forged, and manual reviews before export or network work", async (t) => {
  for (const reviewCase of ["missing", "forged", "manual"] as const) {
    await t.test(reviewCase, async () => {
      const fixture = await makeFixtureWorkspace();
      const projectRoot = await mkdtemp(join(tmpdir(), "market-deploy-entry-"));
      const marketRoot = join(projectRoot, "data", "market");
      await mkdir(dirname(marketRoot), { recursive: true });
      await cp(fixture.root, marketRoot, { recursive: true });
      const reviewPath = join(
        marketRoot,
        "reviews",
        "2026-08-01-saturday.json",
      );
      if (reviewCase === "missing") {
        await rm(reviewPath);
      } else {
        const review = JSON.parse(
          await readFile(reviewPath, "utf8"),
        ) as Record<string, unknown>;
        if (reviewCase === "forged") review.reviewedAt = "not-an-instant";
        else review.decision = "manual_review";
        await writeFile(reviewPath, `${JSON.stringify(review)}\n`);
      }

      const actions: string[] = [];
      const runtime: DeployPagesRuntime = {
        exportPages: async (options) => {
          actions.push("build/export");
          return {
            outputDirectory: String(options.outputDirectory),
            routes: ["/"],
            runId: "2026-08-01-saturday",
            dataCutoff: "2026-08-01T01:00:00.000Z",
            archiveMonths: [],
            sourceIds: ["atlas-model"],
            archiveSourceIds: {},
          };
        },
        verifyDeployment: async () => {
          actions.push("fetch/verify");
        },
        publishWithRestore: async () => {
          actions.push("publish");
          return {
            promoted: true,
            runId: "2026-08-01-saturday",
            archivedPath: join(marketRoot, "runs", "prior.json"),
            previousRunId: "2026-07-25-saturday",
            archivedSha256: "a".repeat(64),
            promotedSha256: "b".repeat(64),
          };
        },
      };

      await assert.rejects(() =>
        runDeployPagesAtProjectRoot(projectRoot, runtime),
      );
      assert.deepEqual(actions, []);
    });
  }
});

test("orchestration binds the authorized candidate hash to candidate export", async () => {
  const fixture = await makeFixtureWorkspace();
  const projectRoot = await mkdtemp(join(tmpdir(), "market-deploy-binding-"));
  const marketRoot = join(projectRoot, "data", "market");
  await mkdir(dirname(marketRoot), { recursive: true });
  await cp(fixture.root, marketRoot, { recursive: true });
  const review = JSON.parse(
    await readFile(
      join(marketRoot, "reviews", "2026-08-01-saturday.json"),
      "utf8",
    ),
  ) as { candidateSha256: string };
  let candidateExportHash: string | undefined;
  let exportCount = 0;
  const runtime: DeployPagesRuntime = {
    exportPages: async (options) => {
      exportCount += 1;
      if (String(options.snapshotPath).endsWith("candidate.json")) {
        candidateExportHash = options.authorizedCandidateSha256;
      }
      return {
        outputDirectory: String(options.outputDirectory),
        routes: ["/"],
        runId:
          exportCount === 1
            ? "2026-07-25-saturday"
            : "2026-08-01-saturday",
        dataCutoff:
          exportCount === 1
            ? "2026-07-25T01:00:00.000Z"
            : "2026-08-01T01:00:00.000Z",
        archiveMonths: [],
        sourceIds: ["atlas-model"],
        archiveSourceIds: {},
        candidateSha256:
          exportCount === 1 ? "a".repeat(64) : review.candidateSha256,
      };
    },
    verifyDeployment: async () => {},
    publishWithRestore: async () => ({
      promoted: true,
      runId: "2026-08-01-saturday",
      archivedPath: join(marketRoot, "runs", "prior.json"),
      previousRunId: "2026-07-25-saturday",
      archivedSha256: "a".repeat(64),
      promotedSha256: review.candidateSha256,
    }),
  };

  await runDeployPagesAtProjectRoot(projectRoot, runtime);

  assert.equal(candidateExportHash, review.candidateSha256);
});
