import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("weekly automation prompt does not invoke destructive retention pruning", async () => {
  const prompt = await readFile(resolve("docs/automation/weekly-market-update-prompt.md"), "utf8");

  assert.doesNotMatch(prompt, /^\d+\. Run `npm run market:prune`/m);
  assert.match(prompt, /do not invoke\s+`npm run market:prune`/i);
  assert.match(prompt, /retain.*indefinitely/i);
});

test("weekly automation prompt requires thesis re-examination on every page and edition", async () => {
  const prompt = await readFile(resolve("docs/automation/weekly-market-update-prompt.md"), "utf8");

  assert.match(prompt, /every page on every edition/i);
  assert.match(prompt, /new supporting and opposing evidence/i);
  assert.match(prompt, /thesis-reexamined-restated/);
  assert.match(prompt, /thesisSurvivalRationale/);
  assert.match(prompt, /report\.analystNotes/);
  assert.match(prompt, /\{ what, by, threshold, comparison, consequence \}/);
  assert.match(prompt, /metricId, operator, value, unit/);
  assert.match(prompt, /ISO timestamp or calendar-date deadline/i);
});
