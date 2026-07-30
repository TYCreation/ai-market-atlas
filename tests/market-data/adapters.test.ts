import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AdapterError } from "../../market-data/adapters/types.ts";
import { jsonCandidateAdapter } from "../../market-data/adapters/json-candidate.ts";

const context = {
  runId: "2026-08-01-saturday",
  cadence: "saturday" as const,
  runStartedAt: "2026-08-01T08:00:00.000Z",
  previous: {} as never,
};

async function fixturePath() {
  const directory = await mkdtemp(join(tmpdir(), "market-adapter-"));
  const destination = join(directory, "candidate.json");
  const fixture = await readFile(
    new URL("../fixtures/market/valid-candidate.json", import.meta.url),
    "utf8",
  );
  await writeFile(destination, fixture);
  return destination;
}

test("loads a valid JSON candidate without changing its snapshot contract", async () => {
  const snapshot = await jsonCandidateAdapter(await fixturePath()).collect(context);
  assert.equal(snapshot.runId, "2026-08-01-saturday");
  assert.equal(snapshot.metrics["pulse.infrastructure_spend"].display.en, "$2.8T");
});

test("maps malformed JSON to FORMAT_CHANGED", async () => {
  const path = await fixturePath();
  await writeFile(path, "{");
  await assert.rejects(
    () => jsonCandidateAdapter(path).collect(context),
    (error: unknown) => error instanceof AdapterError && error.code === "FORMAT_CHANGED",
  );
});

test("rejects a schema-invalid candidate before it can be normalized", async () => {
  const path = await fixturePath();
  const candidate = JSON.parse(await readFile(path, "utf8"));
  candidate.metrics["pulse.infrastructure_spend"].sourceIds = [];
  await writeFile(path, JSON.stringify(candidate));
  await assert.rejects(
    () => jsonCandidateAdapter(path).collect(context),
    (error: unknown) =>
      error instanceof AdapterError &&
      error.code === "FORMAT_CHANGED" &&
      /must have at least one source/.test(error.message),
  );
});

test("maps absent and rate-limited candidate outcomes to stable codes", async () => {
  await assert.rejects(
    () => jsonCandidateAdapter(join(tmpdir(), "not-a-market-candidate.json")).collect(context),
    (error: unknown) => error instanceof AdapterError && error.code === "NO_DATA",
  );
  const path = await fixturePath();
  await writeFile(path, JSON.stringify({ outcome: "rate-limited" }));
  await assert.rejects(
    () => jsonCandidateAdapter(path).collect(context),
    (error: unknown) => error instanceof AdapterError && error.code === "RATE_LIMITED",
  );
});
