import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import { checkSourceHealth } from "../../market-data/source-health.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const valid = candidate as unknown as MarketSnapshot;

test("blocks an unreachable sole URL source for a required metric", async () => {
  const targetUrl = valid.sources["stanford-economy"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === targetUrl ? 503 : 200 }),
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.infrastructure_spend" &&
      issue.severity === "block",
  ));
});

test("checks each exact cited URL once and follows redirects with a timeout signal", async () => {
  const counts = new Map<string, number>();
  const issues = await checkSourceHealth(valid, async (input, init) => {
    const url = String(input);
    counts.set(url, (counts.get(url) ?? 0) + 1);
    assert.equal(init?.redirect, "follow");
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response("", { status: 200 });
  });

  assert.deepEqual(issues, []);
  assert.ok(counts.size > 1);
  assert.ok([...counts.values()].every((count) => count === 1));
});

test("warns on a forbidden source when another trusted source is reachable", async () => {
  const forbiddenUrl = valid.sources["iea-energy-ai"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === forbiddenUrl ? 403 : 200 }),
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.power_queue" &&
      issue.severity === "warn",
  ));
});

test("blocks forbidden access without a reachable backup and accepts redirects", async () => {
  const blockedUrl = valid.sources["stanford-economy"].url;
  const issues = await checkSourceHealth(valid, async (input) =>
    new Response("", { status: String(input) === blockedUrl ? 405 : 302 }),
  );

  assert.ok(issues.some(
    (issue) =>
      issue.code === "SOURCE_UNREACHABLE" &&
      issue.metricId === "pulse.infrastructure_spend" &&
      issue.severity === "block",
  ));
  assert.equal(issues.some((issue) => issue.sourceIds.includes("iea-energy-ai")), false);
});
