import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

for (const [pathname, heading, metricIds] of [
  ["/", "市場變動，信號留存。", [
    "pulse.infrastructure_spend",
    "pulse.accelerator_market",
    "pulse.power_queue",
    "pulse.enterprise_agents",
  ]],
  ["/compute", "算力看似充足，直到它突然不足。", [
    "compute.accelerator_pool",
    "compute.hbm_demand",
    "compute.packaging_lead_weeks",
    "compute.inference_cost_change",
  ]],
  ["/energy", "AI 競賽已進入電網。", [
    "energy.announced_power_gw",
    "energy.committed_power_gw",
    "energy.interconnection_years",
    "energy.liquid_cooling_share",
  ]],
  ["/models", "模型更便宜，成果並沒有。", [
    "models.production_agents",
    "models.software_spend_growth",
    "models.managed_tokens",
    "models.api_deployment_share",
  ]],
  ["/sic", "AI 的電力堆疊，離不開 SiC。", [
    "sic.market_2030_usd_b",
    "sic.wafer_frontier_mm",
    "sic.packaging_watts",
    "sic.ev_penetration",
  ]],
  ["/stocks", "AI 故事，最終都要接受市場定價。", [
    "stocks.basket_30d",
    "stocks.positive_breadth",
    "stocks.median_forward_pe",
    "stocks.catalyst_count",
  ]],
]) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /AI Market Atlas/i);
    assert.match(html, /中文 \/ EN/);
    assert.match(html, /2026-07-25-saturday/);
    assert.match(html, /資料截止/);
    assert.match(html, /本期無重大變化/);
    assert.doesNotMatch(html, /July 2026 illustrative dataset|2026 年 7 月的示意數據/i);
    assert.match(html, /資料來源與方法/);
    assert.match(html, /最後查閱/);
    assert.match(html, /source-atlas-model/);
    for (const metricId of metricIds) {
      assert.match(html, new RegExp(`metric-source-${metricId.replaceAll(".", "\\.")}`));
    }
    if (pathname === "/") {
      assert.match(html, /market-brief\/index\.html\?lang=zh/);
      assert.match(html, /30 秒掌握本週 AI 市場/);
    }
    assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
  });
}

test("server-renders the monthly archive index", async () => {
  const response = await render("/archive");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /月度市場封存/);
  assert.match(html, /Monthly market archives/);
  assert.match(html, /href="\/archive\/2026-07"/);
});

test("server-renders a permanent monthly archive with public sources", async () => {
  const response = await render("/archive/2026-07");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /2026 年 7 月市場封存/);
  assert.match(html, /完整公開來源/);
  assert.match(html, /NVIDIA Investor Relations/);
  assert.match(
    html,
    /https:\/\/investor\.nvidia\.com\/news\/press-release-details\/2026\/NVIDIA-Announces-Financial-Results-for-First-Quarter-Fiscal-2027\/default\.aspx/,
  );
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});
