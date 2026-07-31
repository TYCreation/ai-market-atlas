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

test("rendered publication exposes route, source, brief, and archive markers", async () => {
  const [home, stocks, archiveIndex, archiveDetail] = await Promise.all(
    ["/", "/stocks", "/archive", "/archive/2026-07"].map(async (pathname) => {
      const response = await render(pathname);
      assert.equal(response.status, 200, pathname);
      return response.text();
    }),
  );

  assert.match(home, /href="\/stocks"/);
  assert.match(home, /href="\/compute"/);
  assert.match(home, /href="\/energy"/);
  assert.match(home, /href="\/models"/);
  assert.match(home, /href="\/sic"/);
  assert.match(home, /market-brief\/index\.html\?lang=zh&amp;embed=1/);
  assert.match(home, /source-atlas-model/);

  assert.match(stocks, /metric-source-stocks\.basket_30d/);
  assert.match(stocks, /NVIDIA Investor Relations/);
  assert.match(stocks, /href="\/archive"/);

  assert.match(archiveIndex, /href="\/archive\/2026-07"/);
  assert.match(archiveDetail, /2026-07-25-saturday/);
  assert.match(archiveDetail, /source-nvidia-q1-fy27/);
  assert.match(archiveDetail, /完整公開來源/);
});

test("every indexable report exposes distinct search metadata and structured data", async () => {
  const expected = new Map([
    ["/", ["AI 市場情報週報", "每週 AI 市場情報與產業趨勢"]],
    ["/stocks", ["AI 股票市場週報", "AI 股票市場週報"]],
    ["/compute", ["AI 算力與半導體市場週報", "AI 算力與半導體市場週報"]],
    ["/energy", ["AI 資料中心能源市場週報", "AI 資料中心與能源市場週報"]],
    ["/models", ["AI 模型經濟與代理市場週報", "AI 模型經濟與代理市場週報"]],
    ["/sic", ["SiC 與 AI 資料中心功率市場週報", "SiC 與 AI 資料中心功率市場週報"]],
    ["/archive", ["AI 市場情報月度封存", "AI 市場情報：月度市場封存"]],
    ["/archive/2026-07", ["2026 年 7 月 AI 市場報告", "2026 年 7 月市場封存"]],
  ]);
  const titles = new Set();

  for (const [pathname, [title, heading]] of expected) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, new RegExp(`<title>${title}｜AI Market Atlas</title>`));
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`));
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /https:\/\/schema\.org/);
    titles.add(title);
  }

  assert.equal(titles.size, expected.size);
});
