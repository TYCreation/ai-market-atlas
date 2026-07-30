import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  copyDirectoryAtomically,
  wranglerDeploy,
  type CommandRunner,
} from "../../scripts/deploy-pages.ts";

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
