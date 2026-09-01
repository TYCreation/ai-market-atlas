import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import {
  requestLocalOriginWithHost,
  stopSpawnedRuntime,
} from "../../scripts/rehearse-pages-runtime.ts";

test("local runtime redirect probe reaches localhost while sending the reviewed Host header", async () => {
  let observedHost: string | undefined;
  const server = createServer((request, response) => {
    observedHost = request.headers.host;
    response.statusCode = 301;
    response.setHeader("location", "https://aimarketatlas.net/");
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await requestLocalOriginWithHost(
      `http://127.0.0.1:${address.port}/`,
      "www.aimarketatlas.net",
    );
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://aimarketatlas.net/");
    assert.equal(observedHost, "www.aimarketatlas.net");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("runtime shutdown is bounded for a stubborn child", async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      [
        "process.on('SIGTERM', () => {});",
        "process.stdout.write('ready');",
        "setInterval(() => {}, 1000);",
      ].join(""),
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  assert.ok(child.stdout);
  await once(child.stdout, "data");

  const startedAt = Date.now();
  await stopSpawnedRuntime(child, 50, 200);
  const elapsed = Date.now() - startedAt;

  assert.ok(
    child.exitCode !== null || child.signalCode !== null,
    "shutdown returned while the stubborn child was still running",
  );
  assert.ok(elapsed < 1_000, `runtime shutdown exceeded its bound: ${elapsed}ms`);
});
