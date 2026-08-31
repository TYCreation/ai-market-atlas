import assert from "node:assert/strict";
import test from "node:test";
import candidate from "../fixtures/market/valid-candidate.json" with { type: "json" };
import conflictingCandidate from "../fixtures/market/conflicting-prices.json" with { type: "json" };
import missingRequiredCandidate from "../fixtures/market/missing-required.json" with { type: "json" };
import missingThesisRationaleCandidate from "../fixtures/market/missing-thesis-survival-rationale.json" with { type: "json" };
import thesisReversalCandidate from "../fixtures/market/thesis-reversal.json" with { type: "json" };
import thesisRestatementCandidate from "../fixtures/market/thesis-restatement.json" with { type: "json" };
import unmarkedThesisRewriteCandidate from "../fixtures/market/unmarked-thesis-rewrite.json" with { type: "json" };
import previous from "../fixtures/market/previous-snapshot.json" with { type: "json" };
import { evaluateQualityGate } from "../../market-data/quality-gate.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const valid = candidate as unknown as MarketSnapshot;
const conflicting = conflictingCandidate as unknown as MarketSnapshot;
const missingRequired = missingRequiredCandidate as unknown as MarketSnapshot;
const thesisReversal = thesisReversalCandidate as unknown as MarketSnapshot;
const thesisRestatement = thesisRestatementCandidate as unknown as MarketSnapshot;
const unmarkedThesisRewrite = unmarkedThesisRewriteCandidate as unknown as MarketSnapshot;
const missingThesisRationale = missingThesisRationaleCandidate as unknown as MarketSnapshot;
const previousSnapshot = previous as unknown as MarketSnapshot;

test("blocks prices that disagree by more than one percent", () => {
  const result = evaluateQualityGate(conflicting, previousSnapshot);

  assert.equal(result.publishable, false);
  assert.ok(result.issues.some(
    (issue) => issue.code === "SOURCE_CONFLICT" && issue.metricId === "stocks.nvda.price",
  ));
});

test("allows a price spread at exactly one percent", () => {
  const boundary = structuredClone(valid);
  const metric = boundary.metrics["stocks.nvda.price"];
  metric.sourceIds = ["atlas-model", "nvidia-q1-fy27"];
  metric.observations = [
    { sourceId: "atlas-model", numericValue: 100, asOf: metric.asOf },
    { sourceId: "nvidia-q1-fy27", numericValue: 101, asOf: metric.asOf },
  ];

  assert.equal(
    evaluateQualityGate(boundary, previousSnapshot).issues.some((issue) => issue.code === "SOURCE_CONFLICT"),
    false,
  );
});

test("blocks when more than twenty percent of required metrics wait", () => {
  const result = evaluateQualityGate(missingRequired, previousSnapshot);

  assert.equal(result.publishable, false);
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_REQUIRED" && issue.severity === "block"));
});

test("blocks every required metric that is waiting", () => {
  const boundary = structuredClone(valid);
  const required = Object.values(boundary.metrics).filter((metric) => metric.required);
  required[0].status = "waiting";

  assert.ok(
    evaluateQualityGate(boundary, previousSnapshot).issues.some(
      (issue) =>
        issue.code === "MISSING_REQUIRED" &&
        issue.severity === "block" &&
        issue.metricId === required[0].id,
    ),
  );
});

test("blocks a thesis stance reversal", () => {
  const result = evaluateQualityGate(thesisReversal, previousSnapshot);

  assert.ok(result.issues.some((issue) => issue.code === "THESIS_REVERSAL"));
});

test("blocks a stance change that negates a prior directional thesis", () => {
  const prior = structuredClone(valid);
  prior.pages["/models"].thesisStance = "bullish";
  const current = structuredClone(valid);
  current.pages["/models"].previousThesisStance = "bullish";
  current.pages["/models"].thesisStance = "neutral";

  assert.ok(evaluateQualityGate(current, prior).issues.some(
    (issue) => issue.code === "THESIS_REVERSAL" && issue.page === "/models",
  ));
});

test("blocks an unexplained weekly equity move above twenty percent", () => {
  const unexplained = structuredClone(valid);
  unexplained.metrics["stocks.nvda.weekReturn"].numericValue = 20.01;

  const result = evaluateQualityGate(unexplained, previousSnapshot);

  assert.ok(result.issues.some(
    (issue) => issue.code === "UNEXPLAINED_PRICE_MOVE" && issue.metricId === "stocks.nvda.weekReturn",
  ));
});

test("accepts a large weekly equity move corroborated by a company source", () => {
  const explained = structuredClone(valid);
  const metric = explained.metrics["stocks.nvda.weekReturn"];
  metric.numericValue = -25;
  metric.sourceIds.push("nvidia-q1-fy27");

  assert.equal(
    evaluateQualityGate(explained, previousSnapshot).issues.some(
      (issue) => issue.code === "UNEXPLAINED_PRICE_MOVE" && issue.metricId === metric.id,
    ),
    false,
  );
});

test("blocks financial and forecast deltas without newly cited specialist sources", () => {
  const prior = structuredClone(valid);
  const moved = structuredClone(valid);
  moved.metrics["stocks.median_forward_pe"].numericValue += 10.01;
  moved.metrics["sic.market_2030_usd_b"].numericValue *= 1.101;

  const issues = evaluateQualityGate(moved, prior).issues;

  assert.ok(issues.some(
    (issue) => issue.code === "FINANCIAL_DELTA" && issue.metricId === "stocks.median_forward_pe",
  ));
  assert.ok(issues.some(
    (issue) => issue.code === "FORECAST_DELTA" && issue.metricId === "sic.market_2030_usd_b",
  ));
});

test("allows financial and forecast threshold crossings with newly cited sources", () => {
  const prior = structuredClone(valid);
  const moved = structuredClone(valid);
  moved.sources["new-company-filing"] = {
    ...structuredClone(moved.sources["nvidia-q1-fy27"]),
    id: "new-company-filing",
    publishedAt: "2026-07-31T00:00:00.000Z",
  };
  moved.sources["new-research-report"] = {
    ...structuredClone(moved.sources["stanford-economy"]),
    id: "new-research-report",
    publishedAt: "2026-07-31T00:00:00.000Z",
  };
  moved.metrics["stocks.median_forward_pe"].numericValue += 10.01;
  moved.metrics["stocks.median_forward_pe"].sourceIds.push("new-company-filing");
  moved.metrics["sic.market_2030_usd_b"].numericValue *= 1.101;
  moved.metrics["sic.market_2030_usd_b"].sourceIds.push("new-research-report");

  const issues = evaluateQualityGate(moved, prior).issues;

  assert.equal(issues.some((issue) => issue.code === "FINANCIAL_DELTA"), false);
  assert.equal(issues.some((issue) => issue.code === "FORECAST_DELTA"), false);
});

test("does not treat re-keyed identical provenance as a new anomaly source", () => {
  const prior = structuredClone(valid);
  prior.metrics["sic.market_2030_usd_b"].sourceIds.push("stanford-economy");
  const moved = structuredClone(prior);
  moved.sources["rekeyed-company"] = {
    ...structuredClone(moved.sources["nvidia-q1-fy27"]),
    id: "rekeyed-company",
  };
  moved.sources["rekeyed-research"] = {
    ...structuredClone(moved.sources["stanford-economy"]),
    id: "rekeyed-research",
  };
  moved.metrics["stocks.median_forward_pe"].numericValue += 10.01;
  moved.metrics["stocks.median_forward_pe"].sourceIds =
    moved.metrics["stocks.median_forward_pe"].sourceIds
      .filter((id) => id !== "nvidia-q1-fy27")
      .concat("rekeyed-company");
  moved.metrics["sic.market_2030_usd_b"].numericValue *= 1.101;
  moved.metrics["sic.market_2030_usd_b"].sourceIds =
    moved.metrics["sic.market_2030_usd_b"].sourceIds
      .filter((id) => id !== "stanford-economy")
      .concat("rekeyed-research");

  const issues = evaluateQualityGate(moved, prior).issues;

  assert.ok(issues.some((issue) => issue.code === "FINANCIAL_DELTA"));
  assert.ok(issues.some((issue) => issue.code === "FORECAST_DELTA"));
});

test("accepts a genuinely new source publication for anomaly evidence", () => {
  const prior = structuredClone(valid);
  prior.metrics["sic.market_2030_usd_b"].sourceIds.push("stanford-economy");
  const moved = structuredClone(prior);
  moved.sources["new-company-publication"] = {
    ...structuredClone(moved.sources["nvidia-q1-fy27"]),
    id: "new-company-publication",
    publishedAt: "2026-07-31T00:00:00.000Z",
  };
  moved.sources["new-research-publication"] = {
    ...structuredClone(moved.sources["stanford-economy"]),
    id: "new-research-publication",
    publishedAt: "2026-07-31T00:00:00.000Z",
  };
  moved.metrics["stocks.median_forward_pe"].numericValue += 10.01;
  moved.metrics["stocks.median_forward_pe"].sourceIds.push("new-company-publication");
  moved.metrics["sic.market_2030_usd_b"].numericValue *= 1.101;
  moved.metrics["sic.market_2030_usd_b"].sourceIds.push("new-research-publication");

  const issues = evaluateQualityGate(moved, prior).issues;

  assert.equal(issues.some((issue) => issue.code === "FINANCIAL_DELTA"), false);
  assert.equal(issues.some((issue) => issue.code === "FORECAST_DELTA"), false);
});

test("allows a forecast movement at exactly ten percent", () => {
  const prior = structuredClone(valid);
  const boundary = structuredClone(valid);
  boundary.metrics["sic.market_2030_usd_b"].numericValue =
    prior.metrics["sic.market_2030_usd_b"].numericValue * 1.1;

  assert.equal(
    evaluateQualityGate(boundary, prior).issues.some((issue) => issue.code === "FORECAST_DELTA"),
    false,
  );
});

test("blocks a required low-confidence metric and a missing bilingual display", () => {
  const invalid = structuredClone(valid);
  invalid.metrics["pulse.power_queue"].confidence = "low";
  invalid.metrics["pulse.power_queue"].display.zh = "";

  const issues = evaluateQualityGate(invalid, previousSnapshot).issues;

  assert.ok(issues.some((issue) => issue.code === "LOW_CONFIDENCE"));
  assert.ok(issues.some((issue) => issue.code === "BILINGUAL_MISMATCH"));
});

test("reports non-required waiting metrics as warnings in deterministic order", () => {
  const snapshot = structuredClone(valid);
  for (const id of ["compute.cisco_ai_infrastructure_orders", "compute.amd_data_center_revenue"]) {
    snapshot.metrics[id] = {
      ...structuredClone(snapshot.metrics["pulse.infrastructure_spend"]),
      id,
      required: false,
      status: "waiting",
    };
  }

  const issues = evaluateQualityGate(snapshot, previousSnapshot).issues.filter(
    (issue) => issue.code === "MISSING_REQUIRED" && issue.severity === "warn",
  );

  assert.deepEqual(issues.map((issue) => issue.metricId), [
    "compute.amd_data_center_revenue",
    "compute.cisco_ai_infrastructure_orders",
  ]);
});

test("blocks rewritten unchanged-page narrative", () => {
  const prior = structuredClone(valid);
  const rewritten = structuredClone(valid);
  rewritten.pages["/compute"].report.thesis.body.en += " Rewritten.";

  const result = evaluateQualityGate(rewritten, prior);

  assert.ok(result.issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
  ));
});

test("accepts an evidenced thesis restatement with the exact change reason", () => {
  const result = evaluateQualityGate(thesisRestatement, valid);

  assert.equal(result.issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
  ), false);
});

test("blocks a restated thesis that is not marked changed", () => {
  const unmarkedChange = structuredClone(thesisRestatement);
  unmarkedChange.pages["/compute"].changed = false;

  assert.ok(evaluateQualityGate(unmarkedChange, valid).issues.some(
    (issue) => issue.page === "/compute" &&
      issue.message === "A restated thesis must mark the page changed, use the exact thesis re-examination reason, and cite thesis metrics.",
  ));
});

test("blocks a thesis rewrite without the exact restatement declaration", () => {
  assert.ok(evaluateQualityGate(unmarkedThesisRewrite, valid).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
  ));
});

test("blocks an unchanged thesis without a cited survival rationale", () => {
  assert.ok(evaluateQualityGate(missingThesisRationale, valid).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
  ));
});

test("blocks a neutral-to-bullish stance change marked unchanged", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  changed.pages["/models"].thesisStance = "bullish";

  const result = evaluateQualityGate(changed, prior);

  assert.ok(result.issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/models",
  ));
});

test("blocks a stance change without cited thesis metrics", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  prior.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].previousThesisStance = "neutral";
  changed.pages["/models"].thesisMetricIds = [];

  assert.ok(evaluateQualityGate(changed, prior).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/models" &&
      /stance change.*cite/i.test(issue.message),
  ));
});

test("accepts a changed directional stance with cited thesis metrics", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  prior.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].previousThesisStance = "neutral";
  changed.metrics["models.production_agents"].numericValue += 1;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.pages["/models"].report.supportingEvidence = [{
    text: { en: "New production evidence supports the thesis.", zh: "新的生產證據支持此論點。" },
    metricIds: ["models.production_agents"],
  }];

  assert.equal(evaluateQualityGate(changed, prior).publishable, true);
});

test("blocks a stance change when cited metrics do not causally change", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].report.supportingEvidence = [{
    text: { en: "New production evidence supports the thesis.", zh: "新的生產證據支持此論點。" },
    metricIds: ["models.production_agents"],
  }];

  assert.ok(evaluateQualityGate(changed, prior).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/models" &&
      /causal|current.*prior|changed metric/i.test(issue.message),
  ));
});

test("blocks a stance change when a changed thesis metric is not the metric cited by changed evidence", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  prior.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].previousThesisStance = "neutral";
  changed.metrics["models.production_agents"].numericValue += 1;
  changed.pages["/models"].thesisMetricIds = ["models.production_agents", "models.software_spend_growth"];
  changed.pages["/models"].report.supportingEvidence = [{
    text: { en: "Software evidence changed.", zh: "軟體證據已變更。" },
    metricIds: ["models.software_spend_growth"],
  }];

  assert.equal(evaluateQualityGate(changed, prior).publishable, false);
});

test("blocks a stance change when cited evidence only refreshes as-of metadata", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  prior.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].previousThesisStance = "neutral";
  changed.metrics["models.production_agents"].asOf = "2026-08-02T01:00:00.000Z";
  changed.metrics["models.production_agents"].observations = changed.metrics["models.production_agents"].observations.map(
    (observation) => ({ ...observation, asOf: "2026-08-02T01:00:00.000Z" }),
  );
  changed.pages["/models"].report.supportingEvidence = [{
    text: { en: "Production evidence was refreshed.", zh: "生產證據已更新。" },
    metricIds: ["models.production_agents"],
  }];

  assert.equal(evaluateQualityGate(changed, prior).publishable, false);
});

test("accepts a stance change driven by a newly introduced same-page metric", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  const metricId = "models.production_agents";
  prior.pages["/models"].thesisStance = "neutral";
  prior.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  changed.metrics["stocks.wolf.weekReturn"].numericValue = -19.9;
  delete prior.metrics[metricId];
  changed.pages["/models"].changed = true;
  changed.pages["/models"].thesisStance = "bullish";
  changed.pages["/models"].previousThesisStance = "neutral";
  changed.pages["/models"].thesisMetricIds = [metricId];
  changed.pages["/models"].report.supportingEvidence = [{
    text: { en: "New production evidence supports the thesis.", zh: "新的生產證據支持此論點。" },
    metricIds: [metricId],
  }];

  assert.equal(evaluateQualityGate(changed, prior).publishable, true);
});

test("rejects a candidate whose previous stance disagrees with the trusted prior page", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  prior.pages["/models"].thesisStance = "bearish";
  changed.pages["/models"].previousThesisStance = "bullish";

  assert.ok(evaluateQualityGate(changed, prior).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/models" &&
      /previous.*stance|trusted prior/i.test(issue.message),
  ));
});

test("blocks models and sic reports with no supporting or opposing evidence", () => {
  const starved = structuredClone(valid);
  for (const page of ["/models", "/sic"] as const) {
    starved.pages[page].report.supportingEvidence = [];
    starved.pages[page].report.opposingEvidence = [];
  }

  const result = evaluateQualityGate(starved, previousSnapshot);
  assert.equal(result.publishable, false);
  for (const page of ["/models", "/sic"] as const) {
    assert.ok(result.issues.some(
      (issue) => issue.code === "INSUFFICIENT_PAGE_EVIDENCE" && issue.page === page,
    ));
  }
});

test("blocks thesis citation changes marked unchanged", () => {
  const prior = structuredClone(valid);
  const changed = structuredClone(valid);
  changed.pages["/models"].thesisMetricIds = [
    "models.api_deployment_share",
    "models.managed_tokens",
  ];

  assert.ok(evaluateQualityGate(changed, prior).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/models",
  ));
});

test("does not treat object key order as rewritten narrative", () => {
  const prior = structuredClone(valid);
  const reordered = structuredClone(valid);
  reordered.pages["/compute"].report = Object.fromEntries(
    Object.entries(reordered.pages["/compute"].report).reverse(),
  ) as typeof reordered.pages["/compute"]["report"];

  assert.equal(
    evaluateQualityGate(reordered, prior).issues.some(
      (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
    ),
    false,
  );
});

test("blocks a changed page without verifiable change evidence", () => {
  const prior = structuredClone(valid);
  const unsupported = structuredClone(valid);
  unsupported.pages["/energy"].changed = true;
  unsupported.pages["/energy"].changeReasons = ["first-party-event"];

  const result = evaluateQualityGate(unsupported, prior);

  assert.ok(result.issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/energy",
  ));
});

test("does not accept a re-keyed identical first-party source as change evidence", () => {
  const prior = structuredClone(valid);
  const unsupported = structuredClone(valid);
  unsupported.pages["/compute"].changed = true;
  unsupported.pages["/compute"].changeReasons = ["first-party-event"];
  unsupported.sources["rekeyed-nvidia"] = {
    ...structuredClone(unsupported.sources["nvidia-q1-fy27"]),
    id: "rekeyed-nvidia",
  };
  unsupported.metrics["compute.accelerator_pool"].sourceIds =
    unsupported.metrics["compute.accelerator_pool"].sourceIds
      .filter((id) => id !== "nvidia-q1-fy27")
      .concat("rekeyed-nvidia");

  assert.ok(evaluateQualityGate(unsupported, prior).issues.some(
    (issue) => issue.code === "MATERIAL_CHANGE_MISMATCH" && issue.page === "/compute",
  ));
});

test("blocks stale required current metrics", () => {
  const stale = structuredClone(valid);
  stale.dataCutoff = "2026-08-20T01:00:00.000Z";
  stale.metrics["pulse.power_queue"].asOf = "2026-08-01T01:00:00.000Z";

  assert.ok(evaluateQualityGate(stale, previousSnapshot).issues.some(
    (issue) => issue.code === "STALE_REQUIRED_METRIC" && issue.metricId === "pulse.power_queue",
  ));
});

test("warns without blocking on stale optional metrics", () => {
  const stale = structuredClone(valid);
  stale.dataCutoff = "2026-12-01T01:00:00.000Z";
  const id = "compute.amd_data_center_revenue";
  stale.metrics[id] = {
    ...structuredClone(stale.metrics["compute.accelerator_pool"]),
    id,
    required: false,
    asOf: "2026-08-01T01:00:00.000Z",
  };

  const issue = evaluateQualityGate(stale, previousSnapshot).issues.find(
    (candidate) => candidate.code === "STALE_OPTIONAL_METRIC" && candidate.metricId === id,
  );
  assert.equal(issue?.severity, "warn");
});

test("blocks a page without opposing evidence", () => {
  const oneSided = structuredClone(valid);
  oneSided.pages["/compute"].report.opposingEvidence = [];

  assert.ok(evaluateQualityGate(oneSided, previousSnapshot).issues.some(
    (issue) => issue.code === "MISSING_OPPOSING_EVIDENCE" && issue.page === "/compute",
  ));
});

test("blocks a page when opposing evidence item lacks metric citation", () => {
  const uncited = structuredClone(valid);
  const cited = structuredClone(uncited.pages["/compute"].report.opposingEvidence[0]);
  uncited.pages["/compute"].report.opposingEvidence = [
    cited,
    { ...structuredClone(cited), metricIds: [] },
  ];

  const result = evaluateQualityGate(uncited, previousSnapshot);
  const issue = result.issues.find(
    (candidate) => candidate.code === "MISSING_OPPOSING_EVIDENCE" && candidate.page === "/compute",
  );
  assert.equal(issue?.severity, "block");
  assert.equal(result.publishable, false);
});

test("warns when metrics and narratives are unchanged across three editions", () => {
  const prior = structuredClone(valid);
  const older = structuredClone(valid);
  prior.runId = "2026-07-29-wednesday";
  prior.dataCutoff = "2026-07-29T01:00:00.000Z";
  older.runId = "2026-07-25-saturday";
  older.dataCutoff = "2026-07-25T01:00:00.000Z";

  const issues = evaluateQualityGate(valid, prior, [], [older]).issues;

  assert.ok(issues.some((issue) => issue.code === "METRIC_STAGNATION"));
  assert.ok(issues.some((issue) => issue.code === "NARRATIVE_STAGNATION"));
  assert.equal(issues.some((issue) =>
    ["METRIC_STAGNATION", "NARRATIVE_STAGNATION"].includes(issue.code) && issue.severity === "block",
  ), false);
});

test("does not warn when a stance or thesis citation set changes across editions", () => {
  const prior = structuredClone(valid);
  const older = structuredClone(valid);
  const revisedStance = structuredClone(valid);
  prior.pages["/models"].thesisStance = "neutral";
  older.pages["/models"].thesisStance = "neutral";
  revisedStance.pages["/models"].thesisStance = "bullish";

  assert.equal(evaluateQualityGate(revisedStance, prior, [], [older]).issues.some(
    (issue) => issue.code === "NARRATIVE_STAGNATION" && issue.page === "/models",
  ), false);

  const revisedCitations = structuredClone(valid);
  revisedCitations.pages["/models"].thesisMetricIds =
    revisedCitations.pages["/models"].thesisMetricIds.slice(1);
  assert.equal(evaluateQualityGate(revisedCitations, prior, [], [older]).issues.some(
    (issue) => issue.code === "NARRATIVE_STAGNATION" && issue.page === "/models",
  ), false);
});

test("normalizes thesis citation order when detecting editorial stagnation", () => {
  const current = structuredClone(valid);
  const prior = structuredClone(valid);
  const older = structuredClone(valid);
  current.pages["/models"].thesisMetricIds.reverse();

  assert.ok(evaluateQualityGate(current, prior, [], [older]).issues.some(
    (issue) => issue.code === "NARRATIVE_STAGNATION" && issue.page === "/models",
  ));
});

test("does not warn on unchanged periodic or event-driven metrics", () => {
  const current = structuredClone(valid);
  const prior = structuredClone(valid);
  const older = structuredClone(valid);
  const periodic = "compute.amd_data_center_growth";
  const eventDriven = "compute.openai_ports_capacity";
  for (const snapshot of [current, prior, older]) {
    snapshot.metrics[periodic] = {
      ...structuredClone(snapshot.metrics["compute.accelerator_pool"]),
      id: periodic,
      kind: "published",
      required: false,
    };
    snapshot.metrics[eventDriven] = {
      ...structuredClone(snapshot.metrics["compute.accelerator_pool"]),
      id: eventDriven,
      kind: "published",
      required: false,
    };
  }

  const issues = evaluateQualityGate(current, prior, [], [older]).issues;
  assert.equal(issues.some((issue) => issue.code === "METRIC_STAGNATION" &&
    [periodic, eventDriven].includes(issue.metricId ?? "")), false);
});

test("blocks modeled metrics carrying quote furniture", () => {
  const modeledQuote = structuredClone(valid);
  modeledQuote.metrics["stocks.nvda.price"].market = "US";
  modeledQuote.metrics["stocks.nvda.price"].sessionState = "closed";

  assert.ok(evaluateQualityGate(modeledQuote, previousSnapshot).issues.some(
    (issue) => issue.code === "MODELED_MARKET_PRESENTATION" && issue.metricId === "stocks.nvda.price",
  ));
});
