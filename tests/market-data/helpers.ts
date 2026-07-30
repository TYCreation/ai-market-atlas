import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function pathsFor(root: string) {
  return {
    root,
    candidate: join(root, "candidate", "market.json"),
    current: join(root, "data", "market", "current.json"),
    runs: join(root, "data", "market", "runs"),
    monthly: join(root, "data", "market", "monthly"),
  };
}

export async function makeFixtureWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "market-fixture-"));
  const paths = pathsFor(root);
  await Promise.all([mkdir(dirname(paths.candidate), { recursive: true }), mkdir(paths.runs, { recursive: true }), mkdir(paths.monthly, { recursive: true })]);
  const fixture = new URL("../fixtures/market/valid-candidate.json", import.meta.url);
  await Promise.all([cp(fixture, paths.candidate), cp(fixture, paths.current)]);
  return paths;
}

export async function makeBlockedFixtureWorkspace() {
  const paths = await makeFixtureWorkspace();
  const blocked = join(paths.root, "blocked");
  await mkdir(blocked);
  return { ...paths, blocked };
}
