import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  publishWithRestore,
  verifyDeployment,
} from "../../market-data/deployment.ts";
import {
  fakeDependencies,
  publishOptions,
} from "./deployment-helpers.ts";
import {
  makeBlockedFixtureWorkspace,
  makeFixtureWorkspace,
} from "./helpers.ts";

async function authorizedOptions() {
  const paths = await makeFixtureWorkspace();
  return {
    ...publishOptions,
    candidatePath: paths.candidatePath,
    reviewPath: paths.reviewPath,
  };
}

test("redeploys last-known-good assets when production verification fails", async () => {
  const options = await authorizedOptions();
  const deployments: Array<{ directory: string; branch: string }> = [];
  const deps = fakeDependencies({
    onDeploy: (directory, branch) => deployments.push({ directory, branch }),
    verificationResults: [
      undefined,
      new Error("missing source marker"),
      undefined,
    ],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /missing source marker.*snapshot restoration succeeded.*site restoration succeeded/is,
  );
  assert.deepEqual(deployments, [
    {
      directory: "work/pages-candidate",
      branch: "market-update-2026-08-01-saturday",
    },
    { directory: "work/pages-candidate", branch: "main" },
    { directory: "work/pages-last-good", branch: "main" },
  ]);
  assert.equal(deps.snapshotRestored, true);
  assert.deepEqual(deps.copies, []);
});

test("restores snapshot and last-good assets when production deployment fails", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    deployResults: [
      "https://preview.pages.dev",
      new Error("Cloudflare upload failed"),
      "https://aimarket.tycreation.online",
    ],
    verificationResults: [undefined, undefined],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /Cloudflare upload failed.*snapshot restoration succeeded.*site restoration succeeded/is,
  );
  assert.equal(deps.snapshotRestored, true);
  assert.deepEqual(deps.deployments, [
    {
      directory: "work/pages-candidate",
      branch: "market-update-2026-08-01-saturday",
    },
    { directory: "work/pages-candidate", branch: "main" },
    { directory: "work/pages-last-good", branch: "main" },
  ]);
  assert.deepEqual(deps.copies, []);
});

test("preview failure never promotes or touches production and last-good", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    verificationResults: [new Error("preview missing cutoff")],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /preview missing cutoff/i,
  );
  assert.equal(deps.promoteCount, 0);
  assert.equal(deps.snapshotRestored, false);
  assert.deepEqual(deps.deployments, [
    {
      directory: "work/pages-candidate",
      branch: "market-update-2026-08-01-saturday",
    },
  ]);
  assert.deepEqual(deps.copies, []);
});

test("rejects an unapproved candidate before the first dependency call", async (t) => {
  await t.test("manual review", async () => {
    const paths = await makeBlockedFixtureWorkspace();
    const deps = fakeDependencies();
    await assert.rejects(
      () =>
        publishWithRestore(deps, {
          ...publishOptions,
          candidatePath: paths.candidatePath,
          reviewPath: paths.reviewPath,
        }),
      /auto_publish|manual_review/i,
    );
    assert.deepEqual(deps.actions, []);
  });

  await t.test("candidate changed after review", async () => {
    const paths = await makeFixtureWorkspace();
    const candidate = JSON.parse(await readFile(paths.candidatePath, "utf8"));
    candidate.pages["/"].report.title.en = "Changed after review";
    await writeFile(paths.candidatePath, `${JSON.stringify(candidate)}\n`);
    const deps = fakeDependencies();
    await assert.rejects(
      () =>
        publishWithRestore(deps, {
          ...publishOptions,
          candidatePath: paths.candidatePath,
          reviewPath: paths.reviewPath,
        }),
      /hash does not match/i,
    );
    assert.deepEqual(deps.actions, []);
  });

  await t.test("unsafe run id and output directory", async () => {
    const options = await authorizedOptions();
    for (const mutation of [
      { runId: "2026-08-01-saturday; wrangler pages delete" },
      { candidateDirectory: "../pages-candidate" },
      { lastGoodDirectory: "work/../pages-last-good" },
    ]) {
      const deps = fakeDependencies();
      await assert.rejects(
        () => publishWithRestore(deps, { ...options, ...mutation }),
        /unsafe|invalid|directory/i,
      );
      assert.deepEqual(deps.actions, []);
    }
  });
});

test("aggregates snapshot and site restoration failures without claiming recovery", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    deployResults: [
      "https://preview.pages.dev",
      "https://aimarket.tycreation.online",
      new Error("last-good deploy failed"),
    ],
    restoreSnapshotError: new Error("archive restore failed"),
    verificationResults: [
      undefined,
      new Error("candidate production mismatch"),
    ],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /candidate production mismatch/i);
      assert.match(error.message, /archive restore failed/i);
      assert.match(error.message, /last-good deploy failed/i);
      assert.doesNotMatch(error.message, /restoration succeeded/i);
      return true;
    },
  );
  assert.equal(deps.snapshotRestored, false);
  assert.deepEqual(deps.copies, []);
});

test("copies verified production assets to last-good only after success", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    verificationResults: [undefined, undefined],
  });

  await publishWithRestore(deps, options);

  assert.deepEqual(deps.actions, [
    "deploy:market-update-2026-08-01-saturday:work/pages-candidate",
    "verify:https://market-update-2026-08-01-saturday.ai-market-atlas.pages.dev",
    "promote",
    "deploy:main:work/pages-candidate",
    "verify:https://aimarket.tycreation.online",
    "copy:work/pages-candidate:work/pages-last-good",
  ]);
  assert.equal(deps.snapshotRestored, false);
});

const verificationExpectation = {
  runId: "2026-08-01-saturday",
  dataCutoff: "2026-08-01T01:00:00.000Z",
  archiveMonths: ["2026-07"],
  sourceIds: ["atlas-model"],
  archiveSourceIds: { "2026-07": ["atlas-model"] },
};

test("verification follows redirects and checks route-specific publication markers", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.statusCode = 302;
      response.setHeader("location", "/landing");
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/landing") {
      response.end(
        "2026-08-01-saturday 資料截止 · 2026-08-01T01:00:00.000Z source-atlas-model",
      );
      return;
    }
    if (request.url === "/archive/2026-07") {
      response.end("2026-07 月市場封存 source-atlas-model");
      return;
    }
    if (request.url === "/market-brief/") {
      response.end("AI MARKET ATLAS");
      return;
    }
    response.statusCode = 404;
    response.end("missing");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    await verifyDeployment(
      `http://127.0.0.1:${address.port}`,
      ["/", "/archive/2026-07", "/market-brief/"],
      verificationExpectation,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("verification retries only temporary network failures at most twice", async () => {
  let attempts = 0;
  await verifyDeployment(
    "https://preview.pages.dev",
    ["/"],
    verificationExpectation,
    async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("temporary connection reset");
      return new Response(
        "2026-08-01-saturday 資料截止 2026-08-01T01:00:00.000Z source-atlas-model",
        { status: 200 },
      );
    },
  );
  assert.equal(attempts, 3);
});

test("verification does not retry non-network fetcher failures", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      verifyDeployment(
        "https://preview.pages.dev",
        ["/"],
        verificationExpectation,
        async () => {
          attempts += 1;
          throw new Error("invalid verification configuration");
        },
      ),
    /invalid verification configuration/i,
  );
  assert.equal(attempts, 1);
});

test("verification fails content mismatches immediately without retrying", async (t) => {
  const cases: Array<[string, string, string]> = [
    [
      "runId",
      "2026-07-25-saturday 資料截止 2026-08-01T01:00:00.000Z source-atlas-model",
      "/",
    ],
    [
      "cutoff",
      "2026-08-01-saturday 資料截止 2026-07-25T01:00:00.000Z source-atlas-model",
      "/",
    ],
    [
      "source",
      "2026-08-01-saturday 資料截止 2026-08-01T01:00:00.000Z",
      "/",
    ],
    ["archive month", "2026-06 月市場封存 source-atlas-model", "/archive/2026-07"],
    ["source", "2026-07 月市場封存 source-wrong-source", "/archive/2026-07"],
    ["market brief", "WEEKLY BRIEF", "/market-brief/"],
  ];

  for (const [name, body, route] of cases) {
    await t.test(name, async () => {
      let attempts = 0;
      await assert.rejects(
        () =>
          verifyDeployment(
            "https://preview.pages.dev",
            [route],
            verificationExpectation,
            async () => {
              attempts += 1;
              return new Response(body, { status: 200 });
            },
          ),
        new RegExp(name.replace("runId", "runId"), "i"),
      );
      assert.equal(attempts, 1);
    });
  }
});

test("verification requires a final 200 response without retrying HTTP failures", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      verifyDeployment(
        "https://preview.pages.dev",
        ["/"],
        verificationExpectation,
        async () => {
          attempts += 1;
          return new Response("temporary", { status: 503 });
        },
      ),
    /HTTP 503/i,
  );
  assert.equal(attempts, 1);
});
