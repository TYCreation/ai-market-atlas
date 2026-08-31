import assert from "node:assert/strict";
import test from "node:test";
import type { PublishedBrief } from "../../market-data/briefs.ts";
import { briefRoutePaths, briefsForPillar, isBriefDate } from "../../market-data/brief-routes.ts";

const briefs = [
  { date: "2026-08-05", snapshot: { pages: { "/stocks": { changed: false }, "/compute": { changed: true } } } },
  { date: "2026-08-01", snapshot: { pages: { "/stocks": { changed: true }, "/compute": { changed: false } } } },
] as unknown as PublishedBrief[];

test("builds both trailing-slash dated detail routes", () => {
  assert.deepEqual(briefRoutePaths(briefs), [
    "/brief/2026-08-05/", "/brief/2026-08-01/",
    "/en/brief/2026-08-05/", "/en/brief/2026-08-01/",
  ]);
});

test("rejects malformed or impossible dated route parameters exactly", () => {
  assert.equal(isBriefDate("2026-08-01"), true);
  assert.equal(isBriefDate("2026-02-30"), false);
  assert.equal(isBriefDate("2026-8-01"), false);
  assert.equal(isBriefDate("2026-08-01/"), false);
  assert.equal(isBriefDate("../../2026-08-01"), false);
});

test("pillar hubs index only historical editions that changed that pillar", () => {
  assert.deepEqual(briefsForPillar(briefs, "/stocks").map(({ date }) => date), ["2026-08-01"]);
  assert.deepEqual(briefsForPillar(briefs, "/compute").map(({ date }) => date), ["2026-08-05"]);
});
