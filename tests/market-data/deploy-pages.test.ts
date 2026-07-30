import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  copyDirectoryAtomically,
  LAST_GOOD_ANCHOR_NAME,
  readDeploymentManifest,
  readLastGoodAnchor,
  revalidatePublicationState,
  runDeployPagesAtProjectRoot,
  validateLastGoodDirectory,
  withPublicationLock,
  writeLastGoodAnchorAtomically,
  wranglerDeploy,
  type CommandRunner,
  type DeployPagesRuntime,
} from "../../scripts/deploy-pages.ts";
import {
  ARTIFACT_MANIFEST_NAME,
  hashArtifactTree,
} from "../../market-data/artifact-tree.ts";
import { hashCandidate } from "../../market-data/review.ts";
import { makeFixtureWorkspace } from "./helpers.ts";

async function writeLastGoodFixture(
  directory: string,
  runId: string,
  candidateSha256: string,
  body: string,
) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), body);
  const artifactTreeSha256 = await hashArtifactTree(directory);
  const manifest = {
    routes: ["/"],
    runId,
    dataCutoff: `${runId.slice(0, 10)}T01:00:00.000Z`,
    archiveMonths: [],
    sourceIds: ["atlas-model"],
    archiveSourceIds: {},
    candidateSha256,
    artifactTreeSha256,
    routeIdentities: {},
  };
  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );
  return {
    schemaVersion: 1 as const,
    runId,
    candidateSha256,
    artifactTreeSha256,
    manifestSha256: hashCandidate(manifest),
  };
}

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

  const candidateDigest = await hashArtifactTree(candidate);
  const manifest = {
    routes: ["/"],
    runId: "2026-08-01-saturday",
    dataCutoff: "2026-08-01T01:00:00.000Z",
    archiveMonths: [],
    sourceIds: [],
    archiveSourceIds: {},
    candidateSha256: "a".repeat(64),
    artifactTreeSha256: candidateDigest,
    routeIdentities: {},
  };
  const manifestDigest = hashCandidate(manifest);
  await writeFile(
    join(candidate, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );
  await copyDirectoryAtomically(
    candidate,
    lastGood,
    candidateDigest,
    manifestDigest,
  );
  assert.equal(await readFile(join(lastGood, "index.html"), "utf8"), "candidate");

  await writeFile(join(candidate, "index.html"), "tampered candidate");
  await assert.rejects(
    () =>
      copyDirectoryAtomically(
        candidate,
        lastGood,
        candidateDigest,
        manifestDigest,
      ),
    /artifact tree.*does not match/i,
  );
  assert.equal(await readFile(join(lastGood, "index.html"), "utf8"), "candidate");
  await writeFile(join(candidate, "index.html"), "candidate");

  const outside = join(root, "outside.txt");
  await writeFile(outside, "outside");
  await symlink(outside, join(candidate, "unsafe-link"));
  await assert.rejects(
    () =>
      copyDirectoryAtomically(
        candidate,
        lastGood,
        candidateDigest,
        manifestDigest,
      ),
    /symlink/i,
  );
  assert.equal(await readFile(join(lastGood, "index.html"), "utf8"), "candidate");
  assert.equal(dirname(lastGood), join(root, "work"));
});

test("manifest loading rejects candidate identity and artifact-tree tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-manifest-binding-"));
  const directory = join(root, "work", "pages-candidate");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), "authorized artifact");
  const candidateSha256 = "a".repeat(64);
  const artifactTreeSha256 = await hashArtifactTree(directory);
  const manifest = {
    routes: ["/"],
    runId: "2026-08-01-saturday",
    dataCutoff: "2026-08-01T01:00:00.000Z",
    archiveMonths: [],
    sourceIds: ["atlas-model"],
    archiveSourceIds: {},
    candidateSha256,
    artifactTreeSha256,
    routeIdentities: {
      "/": {
        kind: "current",
        runId: "2026-08-01-saturday",
        dataCutoff: "2026-08-01T01:00:00.000Z",
        sourceIds: ["atlas-model"],
      },
    },
  };
  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );

  await readDeploymentManifest(directory, {
    expectedCandidateSha256: candidateSha256,
    expectedArtifactTreeSha256: artifactTreeSha256,
    expectedManifestSha256: hashCandidate(manifest),
  });

  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify({
      ...manifest,
      routeIdentities: {
        "/": {
          ...manifest.routeIdentities["/"],
          dataCutoff: "2026-07-01T01:00:00.000Z",
        },
      },
    })}\n`,
  );
  await assert.rejects(
    () =>
      readDeploymentManifest(directory, {
        expectedCandidateSha256: candidateSha256,
        expectedArtifactTreeSha256: artifactTreeSha256,
        expectedManifestSha256: hashCandidate(manifest),
      }),
    /manifest hash.*does not match/i,
  );

  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );
  await writeFile(join(directory, "index.html"), "tampered artifact");
  await assert.rejects(
    () => readDeploymentManifest(directory),
    /artifact tree.*does not match/i,
  );

  await writeFile(join(directory, "index.html"), "authorized artifact");
  await assert.rejects(
    () =>
      readDeploymentManifest(directory, {
        expectedCandidateSha256: "b".repeat(64),
      }),
    /candidate hash.*does not match/i,
  );
});

test("publication-state revalidation binds candidate, review, manifest, and live artifact bytes", async () => {
  const fixture = await makeFixtureWorkspace();
  const projectRoot = await mkdtemp(join(tmpdir(), "market-state-binding-"));
  const marketRoot = join(projectRoot, "data", "market");
  const directory = join(projectRoot, "work", "pages-candidate");
  await mkdir(dirname(marketRoot), { recursive: true });
  await cp(fixture.root, marketRoot, { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), "authorized artifact");
  const reviewPath = join(
    marketRoot,
    "reviews",
    "2026-08-01-saturday.json",
  );
  const candidatePath = join(marketRoot, "candidate.json");
  const candidateSha256 = (
    JSON.parse(await readFile(reviewPath, "utf8")) as {
      candidateSha256: string;
    }
  ).candidateSha256;
  const artifactTreeSha256 = await hashArtifactTree(directory);
  const manifest = {
    routes: ["/"],
    runId: "2026-08-01-saturday",
    dataCutoff: "2026-08-01T01:00:00.000Z",
    archiveMonths: [],
    sourceIds: ["atlas-model"],
    archiveSourceIds: {},
    candidateSha256,
    artifactTreeSha256,
    routeIdentities: {},
  };
  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );
  const state = {
    runId: "2026-08-01-saturday",
    candidatePath,
    reviewPath,
    candidateDirectory: directory,
    expectedCandidateSha256: candidateSha256,
    expectedArtifactTreeSha256: artifactTreeSha256,
    expectedManifestSha256: hashCandidate(manifest),
  };

  await revalidatePublicationState(state);

  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify({ ...manifest, sourceIds: ["substituted-source"] })}\n`,
  );
  await assert.rejects(
    () => revalidatePublicationState(state),
    /manifest hash.*does not match/i,
  );

  await writeFile(
    join(directory, ARTIFACT_MANIFEST_NAME),
    `${JSON.stringify(manifest)}\n`,
  );
  await writeFile(join(directory, "index.html"), "tampered artifact");
  await assert.rejects(
    () => revalidatePublicationState(state),
    /artifact tree.*does not match/i,
  );
});

test("independent last-good anchor rejects directory and anchor substitution", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-last-good-anchor-"));
  const lastGood = join(root, "work", "pages-last-good");
  const original = await writeLastGoodFixture(
    lastGood,
    "2026-07-25-saturday",
    "a".repeat(64),
    "trusted last-good",
  );

  await assert.rejects(
    () => readLastGoodAnchor(root),
    /anchor.*missing/i,
  );
  await writeLastGoodAnchorAtomically(root, original);
  assert.deepEqual(await readLastGoodAnchor(root), original);
  await validateLastGoodDirectory(lastGood, original);

  const replacement = await writeLastGoodFixture(
    lastGood,
    "2026-08-01-saturday",
    "b".repeat(64),
    "self-consistent replacement",
  );
  await assert.rejects(
    () => validateLastGoodDirectory(lastGood, original),
    /last-good.*anchor|candidate hash.*match/i,
  );

  await writeLastGoodFixture(
    lastGood,
    "2026-07-25-saturday",
    "a".repeat(64),
    "trusted last-good",
  );
  await writeFile(
    join(root, "work", LAST_GOOD_ANCHOR_NAME),
    `${JSON.stringify(replacement)}\n`,
  );
  await assert.rejects(
    async () =>
      validateLastGoodDirectory(lastGood, await readLastGoodAnchor(root)),
    /last-good.*anchor|candidate hash.*match/i,
  );
});

test("last-good anchor rejects malformed files and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-last-good-unsafe-anchor-"));
  const work = join(root, "work");
  const anchorPath = join(work, LAST_GOOD_ANCHOR_NAME);
  await mkdir(work, { recursive: true });
  await writeFile(anchorPath, "not-json");
  await assert.rejects(() => readLastGoodAnchor(root), /anchor.*invalid/i);

  await rm(anchorPath);
  const outside = join(root, "outside.json");
  await writeFile(outside, "{}\n");
  await symlink(outside, anchorPath);
  await assert.rejects(() => readLastGoodAnchor(root), /anchor.*unsafe/i);
});

test("orchestration never re-anchors an existing last-good directory", async () => {
  const fixture = await makeFixtureWorkspace();
  const projectRoot = await mkdtemp(join(tmpdir(), "market-unanchored-lkg-"));
  const marketRoot = join(projectRoot, "data", "market");
  await mkdir(dirname(marketRoot), { recursive: true });
  await cp(fixture.root, marketRoot, { recursive: true });
  await writeLastGoodFixture(
    join(projectRoot, "work", "pages-last-good"),
    "2026-07-25-saturday",
    "a".repeat(64),
    "unanchored last-good",
  );
  const actions: string[] = [];
  const runtime: DeployPagesRuntime = {
    exportPages: async () => {
      actions.push("export");
      throw new Error("unexpected export");
    },
    verifyDeployment: async () => {
      actions.push("verify");
    },
    publishWithRestore: async () => {
      actions.push("publish");
      throw new Error("unexpected publish");
    },
  };

  await assert.rejects(
    () => runDeployPagesAtProjectRoot(projectRoot, runtime),
    /last-good anchor is missing/i,
  );
  assert.deepEqual(actions, []);
});

test("initial verified last-good seed creates its independent anchor", async () => {
  const fixture = await makeFixtureWorkspace();
  const projectRoot = await mkdtemp(join(tmpdir(), "market-anchored-seed-"));
  const marketRoot = join(projectRoot, "data", "market");
  const lastGood = join(projectRoot, "work", "pages-last-good");
  await mkdir(dirname(marketRoot), { recursive: true });
  await cp(fixture.root, marketRoot, { recursive: true });
  let expectedAnchor:
    | Awaited<ReturnType<typeof writeLastGoodFixture>>
    | undefined;
  let exportCount = 0;
  let verificationCount = 0;
  const runtime: DeployPagesRuntime = {
    exportPages: async (options) => {
      exportCount += 1;
      if (exportCount === 1) {
        expectedAnchor = await writeLastGoodFixture(
          lastGood,
          "2026-07-25-saturday",
          "a".repeat(64),
          "verified production seed",
        );
        return {
          outputDirectory: lastGood,
          routes: ["/"],
          runId: expectedAnchor.runId,
          dataCutoff: "2026-07-25T01:00:00.000Z",
          archiveMonths: [],
          sourceIds: ["atlas-model"],
          archiveSourceIds: {},
          candidateSha256: expectedAnchor.candidateSha256,
          artifactTreeSha256: expectedAnchor.artifactTreeSha256,
          manifestSha256: expectedAnchor.manifestSha256,
          routeIdentities: {},
        };
      }
      return {
        outputDirectory: String(options.outputDirectory),
        routes: ["/"],
        runId: "2026-08-01-saturday",
        dataCutoff: "2026-08-01T01:00:00.000Z",
        archiveMonths: [],
        sourceIds: ["atlas-model"],
        archiveSourceIds: {},
        candidateSha256: "b".repeat(64),
        artifactTreeSha256: "c".repeat(64),
        manifestSha256: "d".repeat(64),
        routeIdentities: {},
      };
    },
    verifyDeployment: async () => {
      verificationCount += 1;
    },
    publishWithRestore: async () => ({
      promoted: true,
      runId: "2026-08-01-saturday",
      archivedPath: join(marketRoot, "runs", "prior.json"),
      previousRunId: "2026-07-25-saturday",
      archivedSha256: "a".repeat(64),
      promotedSha256: "b".repeat(64),
    }),
  };

  await runDeployPagesAtProjectRoot(projectRoot, runtime);

  assert.ok(expectedAnchor);
  assert.deepEqual(await readLastGoodAnchor(projectRoot), expectedAnchor);
  await validateLastGoodDirectory(lastGood, expectedAnchor);
  assert.equal(verificationCount, 1);
});

test("publication lock rejects concurrent ownership and releases after success or failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-publication-lock-"));
  let releaseFirst!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = withPublicationLock(
    root,
    "2026-08-01-saturday",
    async () => {
      markStarted();
      await hold;
    },
  );
  await started;

  await assert.rejects(
    () =>
      withPublicationLock(root, "2026-08-01-saturday", async () => undefined),
    /publication lock is active/i,
  );
  releaseFirst();
  await first;
  assert.deepEqual(await readdir(join(root, "work")), []);

  await assert.rejects(
    () =>
      withPublicationLock(root, "2026-08-01-saturday", async () => {
        throw new Error("inside publication");
      }),
    /inside publication/i,
  );
  assert.deepEqual(await readdir(join(root, "work")), []);
});

test("publication lock rejects malformed and stale ownership without deleting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-stale-lock-"));
  const work = join(root, "work");
  const lock = join(work, ".market-publication.lock");
  await mkdir(work, { recursive: true });
  await writeFile(lock, "not-json");

  await assert.rejects(
    () =>
      withPublicationLock(root, "2026-08-01-saturday", async () => undefined),
    /publication lock is unsafe/i,
  );
  assert.equal(await readFile(lock, "utf8"), "not-json");

  await writeFile(
    lock,
    `${JSON.stringify({
      schemaVersion: 1,
      runId: "2026-07-25-saturday",
      pid: 999_999_999,
      createdAt: "2020-01-01T00:00:00.000Z",
      ownerToken: "00000000-0000-4000-8000-000000000000",
    })}\n`,
  );
  await assert.rejects(
    () =>
      withPublicationLock(root, "2026-08-01-saturday", async () => undefined),
    /publication lock is stale/i,
  );
  assert.match(await readFile(lock, "utf8"), /2026-07-25-saturday/);
});

test("orchestration acquires its publication lock before the first export and releases it", async () => {
  const fixture = await makeFixtureWorkspace();
  const projectRoot = await mkdtemp(join(tmpdir(), "market-locked-entry-"));
  const marketRoot = join(projectRoot, "data", "market");
  await mkdir(dirname(marketRoot), { recursive: true });
  await cp(fixture.root, marketRoot, { recursive: true });
  let exportCount = 0;
  let releaseExport!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  const runtime: DeployPagesRuntime = {
    exportPages: async (options) => {
      exportCount += 1;
      if (exportCount === 1) {
        markStarted();
        await hold;
      }
      const candidate = String(options.snapshotPath).endsWith("candidate.json");
      const seeded = candidate
        ? undefined
        : await writeLastGoodFixture(
            String(options.outputDirectory),
            "2026-07-25-saturday",
            "a".repeat(64),
            "locked verified seed",
          );
      return {
        outputDirectory: String(options.outputDirectory),
        routes: ["/"],
        runId: candidate
          ? "2026-08-01-saturday"
          : "2026-07-25-saturday",
        dataCutoff: candidate
          ? "2026-08-01T01:00:00.000Z"
          : "2026-07-25T01:00:00.000Z",
        archiveMonths: [],
        sourceIds: ["atlas-model"],
        archiveSourceIds: {},
        candidateSha256: seeded?.candidateSha256 ?? "a".repeat(64),
        artifactTreeSha256: seeded?.artifactTreeSha256 ?? "b".repeat(64),
        manifestSha256: seeded?.manifestSha256 ?? "c".repeat(64),
        routeIdentities: {},
      };
    },
    verifyDeployment: async () => {},
    publishWithRestore: async () => ({
      promoted: true,
      runId: "2026-08-01-saturday",
      archivedPath: join(marketRoot, "runs", "prior.json"),
      previousRunId: "2026-07-25-saturday",
      archivedSha256: "a".repeat(64),
      promotedSha256: "b".repeat(64),
    }),
  };

  const first = runDeployPagesAtProjectRoot(projectRoot, runtime);
  await started;
  const second = runDeployPagesAtProjectRoot(projectRoot, runtime).then(
    () => undefined,
    (error: unknown) => error,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(exportCount, 1);
  const secondResult = await second;
  assert.ok(secondResult instanceof Error);
  assert.match(secondResult.message, /publication lock is active/i);
  releaseExport();
  await first;
  const workEntries = await readdir(join(projectRoot, "work"));
  assert.ok(workEntries.includes(LAST_GOOD_ANCHOR_NAME));
  assert.ok(workEntries.includes("pages-last-good"));
  assert.ok(!workEntries.includes(".market-publication.lock"));
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
      const candidate = String(options.snapshotPath).endsWith("candidate.json");
      if (candidate) {
        candidateExportHash = options.authorizedCandidateSha256;
      }
      const seeded = candidate
        ? undefined
        : await writeLastGoodFixture(
            String(options.outputDirectory),
            "2026-07-25-saturday",
            "a".repeat(64),
            "authorized verified seed",
          );
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
        candidateSha256: seeded?.candidateSha256 ?? review.candidateSha256,
        artifactTreeSha256: seeded?.artifactTreeSha256 ?? "b".repeat(64),
        manifestSha256: seeded?.manifestSha256 ?? "c".repeat(64),
        routeIdentities: {},
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
