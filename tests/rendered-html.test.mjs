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

for (const [pathname, heading] of [
  ["/", "市場變動，信號留存。"],
  ["/compute", "算力看似充足，直到它突然不足。"],
  ["/energy", "AI 競賽已進入電網。"],
  ["/models", "模型更便宜，成果並沒有。"],
  ["/sic", "AI 的電力堆疊，離不開 SiC。"],
  ["/stocks", "AI 故事，最終都要接受市場定價。"],
]) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /AI Market Atlas/i);
    assert.match(html, /中文 \/ EN/);
    assert.match(html, /2026 年 7 月的示意數據/);
    assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
  });
}
