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
