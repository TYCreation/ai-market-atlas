import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  publishWithRestore,
  verifyDeployment,
} from "../../market-data/deployment.ts";
import { hashCandidate } from "../../market-data/review.ts";
import {
  fakeDependencies,
  publishOptions,
} from "./deployment-helpers.ts";
import {
  makeBlockedFixtureWorkspace,
  makeFixtureWorkspace,
  writePublishableReview,
} from "./helpers.ts";

async function authorizedOptions() {
  const paths = await makeFixtureWorkspace();
  const review = JSON.parse(
    await readFile(paths.reviewPath, "utf8"),
  ) as { candidateSha256: string };
  return {
    ...publishOptions,
    candidatePath: paths.candidatePath,
    reviewPath: paths.reviewPath,
    expectedCandidateSha256: review.candidateSha256,
    expectedArtifactTreeSha256: "c".repeat(64),
    expectedManifestSha256: "d".repeat(64),
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
      branch: "market-update-2026-08-01-sat",
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
        "https://market-update-2026-08-01-sat.ai-market-atlas.pages.dev",
      directory: "work/pages-candidate",
    },
    {
      baseUrl: "https://aimarketatlas.net",
      directory: "work/pages-candidate",
    },
    {
      baseUrl: "https://aimarketatlas.net",
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
      "https://aimarketatlas.net",
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
      branch: "market-update-2026-08-01-sat",
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
      branch: "market-update-2026-08-01-sat",
    },
  ]);
  assert.deepEqual(deps.copies, []);
});

test("candidate and replacement review mutation after preview verification cannot promote or touch main", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies();
  let validationCount = 0;
  deps.revalidate = async () => {
    validationCount += 1;
    const authorization = await import("../../market-data/deployment.ts");
    const current = await authorization.authorizeCandidatePublication(options);
    assert.equal(
      current.candidateSha256,
      options.expectedCandidateSha256,
      "publication candidate changed",
    );
  };
  const originalVerify = deps.verify.bind(deps);
  deps.verify = async (baseUrl, directory) => {
    await originalVerify(baseUrl, directory);
    const candidate = JSON.parse(
      await readFile(options.candidatePath, "utf8"),
    ) as Record<string, unknown>;
    (candidate.pages as Record<string, { report: { title: { en: string } } }>)[
      "/"
    ].report.title.en = "Replacement candidate after preview";
    await writeFile(options.candidatePath, `${JSON.stringify(candidate)}\n`);
    await writePublishableReview(options.candidatePath, options.reviewPath);
  };

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /publication candidate changed/i,
  );

  assert.ok(validationCount >= 2);
  assert.equal(deps.promoteCount, 0);
  assert.deepEqual(deps.deployments, [
    {
      directory: "work/pages-candidate",
      branch: "market-update-2026-08-01-sat",
    },
  ]);
  assert.deepEqual(deps.copies, []);
});

test("promotion receives the authorized hash and a mismatched result cannot reach main", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies();
  let receivedHash: string | undefined;
  deps.promote = async (expectedCandidateSha256: string) => {
    receivedHash = expectedCandidateSha256;
    deps.promoteCount += 1;
    return {
      promoted: true,
      runId: options.runId,
      archivedPath: `data/market/runs/${options.runId}.json`,
      previousRunId: "2026-07-25-saturday",
      archivedSha256: "a".repeat(64),
      promotedSha256: "f".repeat(64),
    };
  };

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /promotion result.*authorized candidate hash.*snapshot restoration succeeded/is,
  );

  assert.equal(receivedHash, options.expectedCandidateSha256);
  assert.equal(deps.promoteCount, 1);
  assert.equal(deps.snapshotRestored, true);
  assert.deepEqual(deps.deployments, [
    {
      directory: "work/pages-candidate",
      branch: "market-update-2026-08-01-sat",
    },
  ]);
  assert.deepEqual(deps.copies, []);
});

test("publication revalidates candidate, artifact, and manifest at every irreversible phase", async (t) => {
  const cases = [
    { name: "before preview", failAt: 1, deployBranches: [], promoted: 0 },
    {
      name: "after preview verification",
      failAt: 2,
      deployBranches: ["market-update-2026-08-01-sat"],
      promoted: 0,
    },
    {
      name: "before main",
      failAt: 3,
      deployBranches: ["market-update-2026-08-01-sat"],
      promoted: 1,
    },
    {
      name: "after main verification",
      failAt: 4,
      deployBranches: [
        "market-update-2026-08-01-sat",
        "main",
        "main",
      ],
      promoted: 1,
    },
    {
      name: "before last-good copy",
      failAt: 5,
      deployBranches: [
        "market-update-2026-08-01-sat",
        "main",
        "main",
      ],
      promoted: 1,
    },
  ];

  for (const candidateCase of cases) {
    await t.test(candidateCase.name, async () => {
      const options = {
        ...(await authorizedOptions()),
        expectedArtifactTreeSha256: "c".repeat(64),
      };
      const deps = fakeDependencies();
      let validations = 0;
      deps.revalidate = async () => {
        validations += 1;
        if (validations === candidateCase.failAt) {
          throw new Error(`artifact mutation at ${candidateCase.name}`);
        }
      };

      await assert.rejects(
        () => publishWithRestore(deps, options),
        new RegExp(`artifact mutation at ${candidateCase.name}`, "i"),
      );

      assert.equal(validations, candidateCase.failAt);
      assert.equal(deps.promoteCount, candidateCase.promoted);
      assert.deepEqual(
        deps.deployments.map(({ branch }) => branch),
        candidateCase.deployBranches,
      );
      assert.deepEqual(deps.copies, []);
      assert.equal(
        deps.snapshotRestored,
        candidateCase.promoted === 1,
      );
    });
  }
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

test("publication requires the exported artifact-tree hash before any dependency call", async () => {
  const options = await authorizedOptions();
  delete (options as { expectedArtifactTreeSha256?: string })
    .expectedArtifactTreeSha256;
  const deps = fakeDependencies();

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /artifact tree hash is required/i,
  );
  assert.deepEqual(deps.actions, []);
});

test("aggregates snapshot and site restoration failures without claiming recovery", async () => {
  const options = await authorizedOptions();
  const deps = fakeDependencies({
    deployResults: [
      "https://preview.pages.dev",
      "https://aimarketatlas.net",
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
    "deploy:market-update-2026-08-01-sat:work/pages-candidate",
    "verify:https://market-update-2026-08-01-sat.ai-market-atlas.pages.dev",
    "promote",
    "deploy:main:work/pages-candidate",
    "verify:https://aimarketatlas.net",
    "copy:work/pages-candidate:work/pages-last-good",
  ]);
  assert.equal(deps.snapshotRestored, false);
});

test("redeploys an already-current snapshot without promoting or rewriting market storage", async () => {
  const options = {
    ...(await authorizedOptions()),
    snapshotAlreadyCurrent: true,
  };
  const deps = fakeDependencies({
    verificationResults: [undefined, undefined],
  });

  const result = await publishWithRestore(deps, options);

  assert.deepEqual(result, {
    published: true,
    promoted: false,
    runId: options.runId,
  });
  assert.equal(deps.promoteCount, 0);
  assert.equal(deps.snapshotRestored, false);
  assert.deepEqual(deps.actions, [
    "deploy:market-update-2026-08-01-sat:work/pages-candidate",
    "verify:https://market-update-2026-08-01-sat.ai-market-atlas.pages.dev",
    "deploy:main:work/pages-candidate",
    "verify:https://aimarketatlas.net",
    "copy:work/pages-candidate:work/pages-last-good",
  ]);
});

test("site-only redeployment restores the last-good site but never restores the unchanged snapshot", async () => {
  const options = {
    ...(await authorizedOptions()),
    snapshotAlreadyCurrent: true,
  };
  const deps = fakeDependencies({
    verificationResults: [
      undefined,
      new Error("candidate production mismatch"),
      undefined,
    ],
  });

  await assert.rejects(
    () => publishWithRestore(deps, options),
    /snapshot restoration not required.*site restoration succeeded/is,
  );
  assert.equal(deps.promoteCount, 0);
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
      payloadSha256: hashCandidate({
        runId: "2026-08-01-saturday",
        dataCutoff: "2026-08-01T01:00:00.000Z",
        sourceIds: ["atlas-model"],
      }),
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

test("market brief verification fetches both HTML and canonical data.json", async () => {
  const payload = {
    runId: "2026-08-01-saturday",
    dataCutoff: "2026-08-01T01:00:00.000Z",
    sourceIds: ["atlas-model"],
  };
  const expectation = {
    ...verificationExpectation,
    routeIdentities: {
      ...verificationExpectation.routeIdentities,
      "/market-brief/": {
        ...verificationExpectation.routeIdentities["/market-brief/"],
        payloadSha256: hashCandidate(payload),
      },
    },
  };
  const paths: string[] = [];

  await verifyDeployment(
    "https://preview.pages.dev",
    ["/market-brief/"],
    expectation,
    async (input) => {
      const path = new URL(input.toString()).pathname;
      paths.push(path);
      return path.endsWith("/data.json")
        ? Response.json(payload)
        : new Response(marketBriefHtml(), { status: 200 });
    },
  );

  assert.deepEqual(paths, ["/market-brief/", "/market-brief/data.json"]);
});

test("market brief verification rejects missing, stale, and corrupt data.json without content retries", async (t) => {
  const payload = {
    runId: "2026-08-01-saturday",
    dataCutoff: "2026-08-01T01:00:00.000Z",
    sourceIds: ["atlas-model"],
  };
  const expectation = {
    ...verificationExpectation,
    routeIdentities: {
      ...verificationExpectation.routeIdentities,
      "/market-brief/": {
        ...verificationExpectation.routeIdentities["/market-brief/"],
        payloadSha256: hashCandidate(payload),
      },
    },
  };
  const cases: Array<{
    name: string;
    response: Response;
    error: RegExp;
  }> = [
    {
      name: "missing",
      response: new Response("missing", { status: 404 }),
      error: /data\.json.*HTTP 404/i,
    },
    {
      name: "stale",
      response: Response.json({
        ...payload,
        runId: "2026-07-25-saturday",
      }),
      error: /data\.json payload hash.*does not match/i,
    },
    {
      name: "corrupt",
      response: new Response("{not-json", { status: 200 }),
      error: /data\.json is not valid JSON/i,
    },
  ];

  for (const candidateCase of cases) {
    await t.test(candidateCase.name, async () => {
      let dataAttempts = 0;
      await assert.rejects(
        () =>
          verifyDeployment(
            "https://preview.pages.dev",
            ["/market-brief/"],
            expectation,
            async (input) => {
              const path = new URL(input.toString()).pathname;
              if (path.endsWith("/data.json")) {
                dataAttempts += 1;
                return candidateCase.response.clone();
              }
              return new Response(marketBriefHtml(), { status: 200 });
            },
          ),
        candidateCase.error,
      );
      assert.equal(dataAttempts, 1);
    });
  }
});

test("verification follows redirects and checks route-specific publication markers", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
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
    if (request.url === "/market-brief/data.json") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          runId: "2026-08-01-saturday",
          dataCutoff: "2026-08-01T01:00:00.000Z",
          sourceIds: ["atlas-model"],
        }),
      );
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
    assert.ok(requests.includes("/market-brief/"));
    assert.ok(requests.includes("/market-brief/data.json"));
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
