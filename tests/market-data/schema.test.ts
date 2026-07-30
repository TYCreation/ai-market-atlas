import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { assertMarketSnapshot } from "../../market-data/schema.ts";

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
