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

test("rejects legacy editorial strings for a newly authored candidate", () => {
  const legacyCandidate = structuredClone(candidate);
  for (const page of Object.values(legacyCandidate.pages)) {
    page.report.risks = page.report.analystNotes;
    page.report.nextObservations = page.report.nextObservations.map((observation) => observation.what);
    delete page.report.analystNotes;
  }
  assert.throws(
    () => assertMarketSnapshot(legacyCandidate),
    /pages\.\/\.report\.analystNotes must be an array/,
  );
});

test("rejects a neutral stance for a newly authored candidate", () => {
  const neutralCandidate = structuredClone(candidate);
  neutralCandidate.pages["/"].thesisStance = "neutral";

  assert.throws(
    () => assertMarketSnapshot(neutralCandidate),
    /pages\.\/\.thesisStance must be directional for a newly authored candidate/,
  );
});

test("requires checkable falsification conditions and dated threshold observations", () => {
  const strictCandidate = structuredClone(candidate);
  assert.doesNotThrow(() => assertMarketSnapshot(strictCandidate));

  delete strictCandidate.pages["/compute"].report.nextObservations[0].by;
  assert.throws(
    () => assertMarketSnapshot(strictCandidate),
    /pages\.\/compute\.report\.nextObservations\[0\]\.by must be an ISO timestamp or calendar date/,
  );

  const missingThreshold = structuredClone(candidate);
  delete missingThreshold.pages["/compute"].report.nextObservations[0].threshold;
  assert.throws(
    () => assertMarketSnapshot(missingThreshold),
    /pages\.\/compute\.report\.nextObservations\[0\]\.threshold must be an object/,
  );
});

test("allows variable editorial counts while enforcing meaningful minimums", () => {
  const variableCount = structuredClone(candidate);
  for (const page of Object.values(variableCount.pages)) {
    page.report.analystNotes = page.report.analystNotes.slice(0, 1);
    page.report.risks = page.report.risks.slice(0, 1);
    page.report.nextObservations = page.report.nextObservations.slice(0, 1);
  }
  assert.doesNotThrow(() => assertMarketSnapshot(variableCount));

  variableCount.pages["/compute"].report.risks = [];
  assert.throws(
    () => assertMarketSnapshot(variableCount),
    /pages\.\/compute\.report\.risks must contain at least one item/,
  );
});

test("requires each risk and observation to carry a dated compatible metric comparison", () => {
  const missingComparison = structuredClone(candidate);
  delete missingComparison.pages["/compute"].report.risks[0].comparison;
  assert.throws(
    () => assertMarketSnapshot(missingComparison),
    /pages\.\/compute\.report\.risks\[0\]\.comparison must be an object/,
  );
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
  assert.equal(Object.values(previousFull.pages).every((page) => page.thesisStance === "neutral"), true);
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
