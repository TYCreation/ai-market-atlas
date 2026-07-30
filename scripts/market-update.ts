import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteCandidate, pruneRuns, validateCandidate, type StoragePaths } from "../market-data/storage.ts";

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

async function candidateRunId(path: string): Promise<string> {
  try {
    const candidate: unknown = JSON.parse(await readFile(path, "utf8"));
    if (candidate !== null && typeof candidate === "object" && typeof (candidate as { runId?: unknown }).runId === "string") {
      return (candidate as { runId: string }).runId;
    }
  } catch {
    // Storage validation produces the authoritative candidate error.
  }
  return "invalid-candidate";
}

async function storagePaths(args: string[]): Promise<StoragePaths> {
  const root = resolve(option(args, "--root", "data/market"));
  const candidatePath = resolve(option(args, "--candidate", `${root}/candidate.json`));
  const reviewsDir = resolve(option(args, "--reviews-directory", `${root}/reviews`));
  const runId = await candidateRunId(candidatePath);
  return {
    candidatePath,
    reviewPath: resolve(option(args, "--review", `${reviewsDir}/${runId}.json`)),
    currentPath: resolve(option(args, "--current", `${root}/current.json`)),
    runsDir: resolve(option(args, "--runs", `${root}/runs`)),
    monthlyIndexPath: resolve(option(args, "--monthly-index", `${root}/monthly/index.json`)),
  };
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (command === "prune") {
    const root = resolve(option(args, "--root", "data/market"));
    const removed = await pruneRuns(root);
    console.log(JSON.stringify({ removed: removed.map((path) => relative(root, path)) }));
    return;
  }
  if (command !== "validate" && command !== "promote") {
    throw new Error("usage: market-update <validate|promote|prune>");
  }
  const paths = await storagePaths(args);
  if (command === "validate") {
    const snapshot = await validateCandidate(paths);
    console.log(JSON.stringify({ valid: true, runId: snapshot.runId, schemaVersion: snapshot.schemaVersion, sessions: "completed" }));
    return;
  }
  const promotion = await promoteCandidate(paths);
  console.log(JSON.stringify({ promoted: true, runId: promotion.runId, archivedPath: promotion.archivedPath }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as runMarketUpdate };
