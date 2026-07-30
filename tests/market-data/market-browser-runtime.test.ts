import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  localFilePath,
  stopChildProcess,
} from "./helpers/market-browser-runtime.ts";

test("converts file URLs with spaces to portable local paths", () => {
  const expected = join(tmpdir(), "market browser fixtures", "gsap.min.js");

  assert.equal(localFilePath(pathToFileURL(expected)), expected);
});

test("escalates and awaits a child that ignores graceful termination", async () => {
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
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("stubborn child did not start")),
      1_000,
    );
    child.stdout?.once("data", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  try {
    const startedAt = Date.now();
    await stopChildProcess(child, 50);
    const elapsed = Date.now() - startedAt;

    assert.ok(
      child.exitCode !== null || child.signalCode !== null,
      "stop returned while the stubborn child was still running",
    );
    assert.ok(elapsed < 1_000, `stubborn child cleanup exceeded its bound: ${elapsed}ms`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }
  }
});
