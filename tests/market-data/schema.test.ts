import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import missingThesisRationale from "../fixtures/market/missing-thesis-survival-rationale.json" with { type: "json" };
import previousFull from "../fixtures/market/previous-full.json" with { type: "json" };
import thesisRestatement from "../fixtures/market/thesis-restatement.json" with { type: "json" };
import { assertMarketSnapshot, assertPublishedMarketSnapshot } from "../../market-data/schema.ts";

test("accepts a complete bilingual candidate", () => {
  assert.doesNotThrow(() => assertMarketSnapshot(candidate));
});

test("rejects a required metric without sources", () => {
  const broken = structuredClone(candidate);
  broken.metrics["pulse.infrastructure_spend"].sourceIds = [];
  assert.throws(
    () => assertMarketSnapshot(broken),
    /pulse\.infrastructure_spend must have at least one source/,
  );
});

test("rejects an unchanged thesis without an argued survival rationale", () => {
  assert.throws(
    () => assertMarketSnapshot(missingThesisRationale),
    /pages\.\/compute\.report\.thesisSurvivalRationale must be an object/,
  );
});

test("requires a survival rationale when another page change leaves the thesis unchanged", () => {
  const changedForAnotherReason = structuredClone(missingThesisRationale);
  changedForAnotherReason.pages["/compute"].changed = true;
  changedForAnotherReason.pages["/compute"].changeReasons = ["first-party-event"];

  assert.throws(
    () => assertMarketSnapshot(changedForAnotherReason),
    /pages\.\/compute\.report\.thesisSurvivalRationale must be an object/,
  );
});

test("keeps historical snapshots readable while validating newly authored candidates strictly", () => {
  assert.doesNotThrow(() => assertPublishedMarketSnapshot(previousFull));
  assert.throws(
    () => assertMarketSnapshot(previousFull),
    /pages\.\/\.report\.thesisSurvivalRationale must be an object/,
  );
});

test("accepts a restated thesis with the exact declaration and cited thesis metrics", () => {
  assert.doesNotThrow(() => assertMarketSnapshot(thesisRestatement));
});

test("rejects a declared thesis restatement unless the page is changed and cites thesis metrics", () => {
  const unmarkedChange = structuredClone(thesisRestatement);
  unmarkedChange.pages["/compute"].changed = false;
  assert.throws(
    () => assertMarketSnapshot(unmarkedChange),
    /pages\.\/compute\.changed must be true when thesis-reexamined-restated is declared/,
  );

  const uncitedRestatement = structuredClone(thesisRestatement);
  uncitedRestatement.pages["/compute"].thesisMetricIds = [];
  assert.throws(
    () => assertMarketSnapshot(uncitedRestatement),
    /pages\.\/compute\.thesisMetricIds must cite at least one metric for thesis-reexamined-restated/,
  );
});
