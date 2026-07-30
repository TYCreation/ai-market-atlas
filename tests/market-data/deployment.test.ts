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

test("verifies rollback with the last-good manifest context instead of candidate routes", async () => {
  const options = await authorizedOptions();
  options.routes = [...options.routes, "/archive/2026-08"];
  const deps = fakeDependencies({
    verificationResults: [
      undefined,
      new Error("candidate production mismatch"),
      undefined,
    ],
  });

  await assert.rejects(() => publishWithRestore(deps, options));

  assert.deepEqual(deps.verifications, [
    {
      baseUrl:
        "https://market-update-2026-08-01-saturday.ai-market-atlas.pages.dev",
      directory: "work/pages-candidate",
    },
    {
      baseUrl: "https://aimarket.tycreation.online",
      directory: "work/pages-candidate",
    },
    {
      baseUrl: "https://aimarket.tycreation.online",
      directory: "work/pages-last-good",
    },
  ]);
});

test("reports a true last-good verification failure without claiming site restoration", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    verificationResults: [
      undefined,
      new Error("candidate production mismatch"),
      new Error("last-good manifest mismatch"),
    ],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /snapshot restoration succeeded/i);
      assert.match(error.message, /site restoration failed/i);
      assert.match(error.message, /last-good manifest mismatch/i);
      assert.doesNotMatch(error.message, /site restoration succeeded/i);
      return true;
    },
  );
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

test("rejects every forged persisted review invariant before any dependency call", async (t) => {
  const forgeries: Array<{
    name: string;
    mutate(review: Record<string, unknown>): void;
  }> = [
    {
      name: "invalid reviewedAt timestamp",
      mutate: (review) => {
        review.reviewedAt = "tomorrow";
      },
    },
    {
      name: "unsupported check status",
      mutate: (review) => {
        const checks = review.checks as Array<Record<string, unknown>>;
        checks[0].status = "passed";
      },
    },
    {
      name: "duplicate check replacing a required check",
      mutate: (review) => {
        const checks = review.checks as Array<Record<string, unknown>>;
        checks[8] = structuredClone(checks[0]);
      },
    },
    {
      name: "warning issue missing its canonical check binding",
      mutate: (review) => {
        review.issues = [
          {
            code: "SOURCE_UNREACHABLE",
            severity: "warn",
            message: "source temporarily unavailable",
            sourceIds: ["atlas-model"],
          },
        ];
      },
    },
    {
      name: "wrong reviewed metric count",
      mutate: (review) => {
        review.reviewedMetricCount =
          Number(review.reviewedMetricCount) + 1;
      },
    },
    {
      name: "forged auto-publish decision",
      mutate: (review) => {
        review.decision = "manual_review";
      },
    },
  ];

  for (const forgery of forgeries) {
    await t.test(forgery.name, async () => {
      const paths = await makeFixtureWorkspace();
      const review = JSON.parse(
        await readFile(paths.reviewPath, "utf8"),
      ) as Record<string, unknown>;
      forgery.mutate(review);
      await writeFile(paths.reviewPath, `${JSON.stringify(review)}\n`);
      const deps = fakeDependencies();

      await assert.rejects(() =>
        publishWithRestore(deps, {
          ...publishOptions,
          candidatePath: paths.candidatePath,
          reviewPath: paths.reviewPath,
        }),
      );
      assert.deepEqual(deps.actions, []);
    });
  }
});

test("immediate pre-deploy revalidation rejects a candidate that differs from the exported manifest hash", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies();

  await assert.rejects(() =>
    publishWithRestore(deps, {
      ...options,
      expectedCandidateSha256: "0".repeat(64),
    }),
  );
  assert.deepEqual(deps.actions, []);
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
  routeIdentities: {
    "/": {
      kind: "current" as const,
      runId: "2026-08-01-saturday",
      dataCutoff: "2026-08-01T01:00:00.000Z",
      sourceIds: ["atlas-model"],
    },
    "/archive/2026-07": {
      kind: "archive-detail" as const,
      archiveMonth: "2026-07",
      runId: "2026-07-25-saturday",
      dataCutoff: "2026-07-25T01:00:00.000Z",
      sourceIds: ["atlas-model"],
    },
    "/market-brief/": {
      kind: "market-brief" as const,
      runId: "2026-08-01-saturday",
      dataCutoff: "2026-08-01T01:00:00.000Z",
      sourceIds: ["atlas-model"],
    },
  },
};

function marketBriefHtml(
  runId = "2026-08-01-saturday",
  dataCutoff = "2026-08-01T01:00:00.000Z",
  sourceIds = ["atlas-model"],
) {
  return `AI MARKET ATLAS <script id="embedded-market-brief" type="application/json">${JSON.stringify(
    { runId, dataCutoff, sourceIds },
  )}</script>`;
}

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
        '2026-08-01-saturday 資料截止 · 2026-08-01T01:00:00.000Z <article id="source-atlas-model"></article>',
      );
      return;
    }
    if (request.url === "/archive/2026-07") {
      response.end(
        '2026-07 月市場封存 2026-07-25-saturday 2026-07-25T01:00:00.000Z <article id="archive-source-atlas-model"></article>',
      );
      return;
    }
    if (request.url === "/market-brief/") {
      response.end(marketBriefHtml());
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
        '2026-08-01-saturday 資料截止 2026-08-01T01:00:00.000Z <article id="source-atlas-model"></article>',
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

test("verification rejects incomplete exact current/archive sources and a stale market brief immediately", async (t) => {
  const exactExpectation = {
    ...verificationExpectation,
    sourceIds: ["atlas-model", "required-current-source"],
    archiveSourceIds: {
      "2026-07": ["atlas-model", "required-archive-source"],
    },
    routeIdentities: {
      ...verificationExpectation.routeIdentities,
      "/": {
        ...verificationExpectation.routeIdentities["/"],
        sourceIds: ["atlas-model", "required-current-source"],
      },
      "/archive/2026-07": {
        ...verificationExpectation.routeIdentities["/archive/2026-07"],
        sourceIds: ["atlas-model", "required-archive-source"],
      },
    },
  };
  const cases: Array<[string, string, string]> = [
    [
      "incomplete current sources",
      "2026-08-01-saturday 資料截止 2026-08-01T01:00:00.000Z <article id=\"source-atlas-model\"></article>",
      "/",
    ],
    [
      "incomplete archive sources",
      "2026-07 2026-07-26-month-end 2026-07-26T01:00:00.000Z <article id=\"archive-source-atlas-model\"></article>",
      "/archive/2026-07",
    ],
    [
      "stale market brief",
      marketBriefHtml(
        "2026-07-25-saturday",
        "2026-07-25T01:00:00.000Z",
      ),
      "/market-brief/",
    ],
  ];

  for (const [name, body, route] of cases) {
    await t.test(name, async () => {
      let attempts = 0;
      await assert.rejects(() =>
        verifyDeployment(
          "https://preview.pages.dev",
          [route],
          exactExpectation,
          async () => {
            attempts += 1;
            return new Response(body, { status: 200 });
          },
        ),
      );
      assert.equal(attempts, 1);
    });
  }
});

test("verification fails content mismatches immediately without retrying", async (t) => {
  const cases: Array<[string, string, string]> = [
    [
      "runId",
      '2026-07-25-saturday 資料截止 2026-08-01T01:00:00.000Z <article id="source-atlas-model"></article>',
      "/",
    ],
    [
      "cutoff",
      '2026-08-01-saturday 資料截止 2026-07-25T01:00:00.000Z <article id="source-atlas-model"></article>',
      "/",
    ],
    [
      "source",
      "2026-08-01-saturday 資料截止 2026-08-01T01:00:00.000Z",
      "/",
    ],
    [
      "archive month",
      '2026-06 月市場封存 2026-07-25-saturday 2026-07-25T01:00:00.000Z <article id="archive-source-atlas-model"></article>',
      "/archive/2026-07",
    ],
    [
      "cutoff",
      '2026-07 月市場封存 2026-07-25-saturday 2026-07-25T02:00:00.000Z <article id="archive-source-atlas-model"></article>',
      "/archive/2026-07",
    ],
    [
      "source",
      '2026-07 月市場封存 2026-07-25-saturday 2026-07-25T01:00:00.000Z <article id="archive-source-wrong-source"></article>',
      "/archive/2026-07",
    ],
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
