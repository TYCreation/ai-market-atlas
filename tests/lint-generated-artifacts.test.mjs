import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const generatedArtifact = join(projectRoot, "work", "lint-rehearsal-artifact.js");

test("lint accepts generated deployment artifacts outside the source tree", async () => {
  await mkdir(dirname(generatedArtifact), { recursive: true });
  await writeFile(generatedArtifact, "const = invalid generated output;\n");

  try {
    await assert.doesNotReject(
      execFileAsync("npm", ["run", "lint"], { cwd: projectRoot }),
    );
  } finally {
    await rm(generatedArtifact, { force: true });
  }
});
