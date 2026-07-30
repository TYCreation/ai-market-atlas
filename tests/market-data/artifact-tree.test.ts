import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ARTIFACT_MANIFEST_NAME,
  hashArtifactTree,
} from "../../market-data/artifact-tree.ts";

async function fixture(order: "forward" | "reverse"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "market-artifact-tree-"));
  const files: Array<[string, string]> = [
    ["index.html", "<main>atlas</main>"],
    ["assets/app.js", "export const atlas = true;\n"],
    ["market-brief/data.json", '{"runId":"2026-08-01-saturday"}\n'],
  ];
  for (const [relativePath, contents] of
    order === "forward" ? files : [...files].reverse()) {
    const path = join(root, relativePath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
  return root;
}

test("artifact digest is deterministic over sorted relative paths and bytes while excluding its manifest", async () => {
  const first = await fixture("forward");
  const second = await fixture("reverse");
  await writeFile(
    join(first, ARTIFACT_MANIFEST_NAME),
    '{"artifactTreeSha256":"first"}\n',
  );
  await writeFile(
    join(second, ARTIFACT_MANIFEST_NAME),
    '{"artifactTreeSha256":"second"}\n',
  );

  assert.equal(await hashArtifactTree(first), await hashArtifactTree(second));

  await writeFile(join(second, "index.html"), "<main>tampered</main>");
  assert.notEqual(await hashArtifactTree(first), await hashArtifactTree(second));
});

test("artifact digest rejects symlinks instead of following them", async () => {
  const root = await fixture("forward");
  await symlink(join(root, "index.html"), join(root, "linked.html"));

  await assert.rejects(() => hashArtifactTree(root), /symlink/i);
});
