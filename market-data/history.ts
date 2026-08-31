import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPublishedMarketSnapshot } from "./schema.ts";
import type { MarketSnapshot } from "./types.ts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Load validated snapshots immediately preceding a cutoff from one runs directory.
 * Only regular, direct-child JSON files participate; any malformed candidate fails closed.
 */
export async function loadRecentSnapshots(
  directory: string,
  beforeCutoff: string,
  limit: number,
): Promise<MarketSnapshot[]> {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("history limit must be a non-negative safe integer");
  }
  const cutoff = new Date(beforeCutoff);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error("history cutoff must be an ISO timestamp");
  }

  const entries = (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort();
  const snapshots: Array<{ snapshot: MarketSnapshot; filename: string }> = [];
  for (const filename of entries) {
    const path = join(directory, filename);
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      throw new Error(`Unable to read history file ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`Invalid history file ${filename}: symlinks are not allowed`);
    }
    if (!metadata.isFile()) {
      throw new Error(`Invalid history file ${filename}: expected a regular file`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      assertPublishedMarketSnapshot(parsed);
    } catch (error) {
      throw new Error(`Invalid history file ${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
    snapshots.push({ snapshot: parsed, filename });
  }

  snapshots.sort((left, right) =>
    new Date(right.snapshot.dataCutoff).getTime() - new Date(left.snapshot.dataCutoff).getTime() ||
    compareText(left.snapshot.runId, right.snapshot.runId) ||
    compareText(left.filename, right.filename),
  );
  if (limit === 0) return [];
  const selected: MarketSnapshot[] = [];
  const seenRunIds = new Set<string>();
  for (const { snapshot } of snapshots) {
    if (new Date(snapshot.dataCutoff) >= cutoff || seenRunIds.has(snapshot.runId)) continue;
    seenRunIds.add(snapshot.runId);
    selected.push(snapshot);
    if (selected.length >= limit) break;
  }
  return selected;
}
