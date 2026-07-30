import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { chromium, type BrowserContext, type Page } from "playwright";
import { buildMarketBrief, type MarketBriefPayload } from "../../scripts/generate-market-brief.ts";
import type { MarketSnapshot } from "../../market-data/types.ts";

const projectRoot = new URL("../../", import.meta.url);
const compositionRoot = new URL("../../hyperframes/weekly-ai-market-brief/", import.meta.url);
const embeddedPattern =
  /<script id="embedded-market-brief" type="application\/json">[\s\S]*?<\/script>/;

type DataMode = "valid" | "malformed" | "hanging" | "unreachable" | "deferred";

function htmlWithBrief(html: string, brief: MarketBriefPayload): string {
  const json = JSON.stringify(brief).replaceAll("<", "\\u003c");
  return html.replace(
    embeddedPattern,
    `<script id="embedded-market-brief" type="application/json">${json}</script>`,
  );
}

async function newCompositionPage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  options: {
    query: string;
    reducedMotion?: "reduce" | "no-preference";
    viewport?: { width: number; height: number };
  },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    reducedMotion: options.reducedMotion,
    viewport: options.viewport ?? { width: 1920, height: 1080 },
  });
  const gsapPath = join(
    new URL("../../node_modules/gsap/dist/gsap.min.js", import.meta.url).pathname,
  );
  await context.route("https://cdn.jsdelivr.net/**", async (route) => {
    await route.fulfill({
      body: await readFile(gsapPath),
      contentType: "application/javascript",
    });
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html?${options.query}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.__timelines?.["weekly-ai-market-brief"]));
  return { context, page };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function startActualApp(): Promise<{
  child: ChildProcess;
  logs: () => string;
  stop: () => Promise<void>;
  url: string;
}> {
  const port = await reservePort();
  const executable = join(
    fileURLToPath(projectRoot),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vinext.cmd" : "vinext",
  );
  const child = spawn(
    executable,
    ["dev", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: fileURLToPath(projectRoot),
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.setEncoding("utf8").on("data", (chunk) => {
    output += chunk;
  });
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Actual app exited before startup:\n${output}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {
      // The bounded readiness loop keeps polling until the server accepts requests.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (Date.now() >= deadline) {
    child.kill();
    throw new Error(`Timed out starting actual app:\n${output}`);
  }
  return {
    child,
    logs: () => output,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
      ]);
    },
    url,
  };
}

test("uses the repository-pinned Playwright Chromium runtime", async () => {
  const executable = chromium.executablePath();
  assert.equal(
    existsSync(executable),
    true,
    `missing pinned Chromium at ${executable}; run npm run market:browser:install`,
  );
  assert.doesNotMatch(
    executable,
    /Google Chrome\.app|[\\/]usr[\\/](?:local[\\/])?bin[\\/](?:google-chrome|chromium)/i,
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    assert.equal(browser.version().length > 0, true);
  } finally {
    await browser?.close();
  }
});

test("actual market-brief composition passes its browser behavior matrix", async (t) => {
  const [canonicalHtml, snapshot] = await Promise.all([
    readFile(new URL("index.html", compositionRoot), "utf8"),
    readFile(new URL("data/market/current.json", projectRoot), "utf8").then(
      (value) => JSON.parse(value) as MarketSnapshot,
    ),
  ]);
  const saturdayBrief = buildMarketBrief(snapshot);
  const monthEndSnapshot = structuredClone(snapshot);
  monthEndSnapshot.runId = "2026-07-31-month-end";
  monthEndSnapshot.cadence = "month-end";
  monthEndSnapshot.dataCutoff = "2026-07-31T01:00:00.000Z";
  const monthEndBrief = buildMarketBrief(monthEndSnapshot);
  const wednesdaySnapshot = structuredClone(snapshot);
  wednesdaySnapshot.runId = "2026-07-29-wednesday";
  wednesdaySnapshot.cadence = "wednesday";
  wednesdaySnapshot.dataCutoff = "2026-07-29T01:00:00.000Z";
  const wednesdayBrief = buildMarketBrief(wednesdaySnapshot);

  let embedded = saturdayBrief;
  let data = saturdayBrief as unknown;
  let dataMode: DataMode = "valid";
  const hangingResponses = new Set<ServerResponse>();
  let deferredResponse: ServerResponse | undefined;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/index.html") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(htmlWithBrief(canonicalHtml, embedded));
      return;
    }
    if (path === "/data.json") {
      if (dataMode === "hanging") {
        hangingResponses.add(response);
        response.on("close", () => hangingResponses.delete(response));
        return;
      }
      if (dataMode === "unreachable") {
        response.destroy();
        return;
      }
      if (dataMode === "deferred") {
        deferredResponse = response;
        response.on("close", () => {
          if (deferredResponse === response) deferredResponse = undefined;
        });
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(data));
      return;
    }
    if (path.startsWith("/assets/")) {
      try {
        response.end(await readFile(new URL(`.${path}`, compositionRoot)));
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    await t.test("desktop English", async () => {
      embedded = saturdayBrief;
      data = saturdayBrief;
      dataMode = "valid";
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.match(await page.locator('[data-brief="edition"]').innerText(), /Saturday brief/i);
      assert.equal(await page.locator('[data-brief="signal-5-code"]').innerText(), "SIC");
      await context.close();
    });

    await t.test("390px Chinese embed", async () => {
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=zh&embed=1",
        viewport: { width: 390, height: 844 },
      });
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-Hant");
      const box = await page.locator("#root").boundingBox();
      assert.ok(box);
      assert.ok(Math.abs(box.x) < 0.01);
      assert.ok(Math.abs(box.y - 312.3125) < 0.01);
      assert.ok(Math.abs(box.width - 390) < 0.01);
      assert.ok(Math.abs(box.height - 219.375) < 0.01);
      await context.close();
    });

    await t.test("replay starts the real timeline again", async () => {
      const app = await startActualApp();
      let context: BrowserContext | undefined;
      try {
        context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const gsapPath = fileURLToPath(
          new URL("../../node_modules/gsap/dist/gsap.min.js", import.meta.url),
        );
        await context.route("https://cdn.jsdelivr.net/**", async (route) => {
          await route.fulfill({
            body: await readFile(gsapPath),
            contentType: "application/javascript",
          });
        });
        const page = await context.newPage();
        await page.goto(app.url, { waitUntil: "networkidle" });
        const iframe = page.locator(".market-film-frame iframe");
        await iframe.waitFor();
        const initialFrame = page.frames().find((frame) =>
          frame.url().includes("/market-brief/index.html"),
        );
        assert.ok(initialFrame, `market brief iframe missing:\n${app.logs()}`);
        await initialFrame.waitForFunction(
          () => Boolean(window.__timelines?.["weekly-ai-market-brief"]),
        );
        await initialFrame.evaluate(() => {
          const timeline = window.__timelines["weekly-ai-market-brief"];
          timeline.seek(timeline.duration()).pause();
        });
        const advancedTime = await initialFrame.evaluate(
          () => window.__timelines["weekly-ai-market-brief"].time(),
        );
        assert.ok(advancedTime > 25);

        const initialSrc = await iframe.getAttribute("src");
        await page.locator(".market-film-replay").click();
        await page.waitForFunction(
          (oldUrl) =>
            document
              .querySelector(".market-film-frame iframe")
              ?.getAttribute("src")
              ?.includes("playback=1") &&
            document
              .querySelector(".market-film-frame iframe")
              ?.getAttribute("src") !== oldUrl,
          initialSrc,
          { timeout: 10_000 },
        );
        const replayFrame = page.frames().find((frame) =>
          frame.url().includes("playback=1"),
        );
        assert.ok(replayFrame, "replay did not remount the market brief iframe");
        assert.notEqual(replayFrame, initialFrame);
        await replayFrame.waitForFunction(
          () => Boolean(window.__timelines?.["weekly-ai-market-brief"]),
        );
        const restartedAt = await replayFrame.evaluate(
          () => window.__timelines["weekly-ai-market-brief"].time(),
        );
        assert.ok(restartedAt >= 0 && restartedAt < 1);
        await replayFrame.waitForTimeout(350);
        const progressedTo = await replayFrame.evaluate(
          () => window.__timelines["weekly-ai-market-brief"].time(),
        );
        assert.ok(
          progressedTo > restartedAt + 0.1,
          `expected replay progression after ${restartedAt}, got ${progressedTo}`,
        );
      } finally {
        await context?.close();
        await app.stop();
      }
    });

    await t.test("reduced motion seeks synchronously to the closing thesis", async () => {
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
        reducedMotion: "reduce",
      });
      const state = await page.evaluate(() => {
        const timeline = window.__timelines["weekly-ai-market-brief"];
        return { paused: timeline.paused(), time: timeline.time() };
      });
      assert.equal(state.paused, true);
      assert.equal(state.time, 27);
      await context.close();
    });

    await t.test("month-end shows next-week observations", async () => {
      embedded = monthEndBrief;
      data = monthEndBrief;
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      assert.match(await page.locator('[data-brief="edition"]').innerText(), /Month-end brief/i);
      assert.equal(await page.locator(".event-board").isVisible(), true);
      assert.equal(
        await page.locator('[data-brief="next-label"]').innerText(),
        "NEXT OBSERVATIONS",
      );
      await context.close();
    });

    await t.test("Wednesday hides the next-week observations panel", async () => {
      embedded = wednesdayBrief;
      data = wednesdayBrief;
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      assert.match(await page.locator('[data-brief="edition"]').innerText(), /Wednesday update/i);
      assert.equal(await page.locator(".event-board").isVisible(), false);
      await context.close();
    });

    await t.test("malformed same-run fetch preserves the complete embedded DOM", async (t) => {
      embedded = saturdayBrief;
      dataMode = "malformed";
      const malformedCases: Array<
        [string, (brief: MarketBriefPayload) => void]
      > = [
        ["cadence", (brief) => {
          brief.cadence = "bogus" as MarketBriefPayload["cadence"];
        }],
        ["cutoff", (brief) => {
          brief.dataCutoff = "not-a-date";
        }],
        ["signal page", (brief) => {
          brief.signals[0].page = "/bogus" as MarketBriefPayload["signals"][number]["page"];
        }],
        ["signal kind", (brief) => {
          brief.signals[0].kind = "bogus" as MarketBriefPayload["signals"][number]["kind"];
        }],
        ["signal source binding", (brief) => {
          brief.signals[0].sourceIds = ["missing-source"];
        }],
        ["top-level sources", (brief) => {
          brief.sourceIds = [];
        }],
        ["duplicate signal ID", (brief) => {
          brief.signals[1].id = brief.signals[0].id;
        }],
        ["duplicate featured ID", (brief) => {
          brief.featuredSignalIds[1] = brief.featuredSignalIds[0];
        }],
        ["featured lower bound", (brief) => {
          brief.featuredSignalIds = brief.featuredSignalIds.slice(0, 4);
        }],
        ["featured upper bound", (brief) => {
          brief.featuredSignalIds.push(brief.signals[8].id);
        }],
        ["observation rule", (brief) => {
          brief.nextWeekObservations = [];
        }],
        ["rendered tag cardinality", (brief) => {
          brief.labels.tags.en = ["CORRUPTED"];
          brief.labels.tags.zh = ["已破壞"];
        }],
      ];

      for (const [name, mutate] of malformedCases) {
        await t.test(name, async () => {
          const malformed = structuredClone(saturdayBrief);
          malformed.signals[0].en.value = "CORRUPTED";
          mutate(malformed);
          data = malformed;
          const { context, page } = await newCompositionPage(browser, baseUrl, {
            query: "lang=en&embed=1",
          });
          const loaded = await page.evaluate(() => window.loadBrief());
          assert.deepEqual(loaded, saturdayBrief);
          assert.deepEqual(
            await page.locator('[data-brief="signal-0-value"]').allInnerTexts(),
            ["$2.8T", "$2.8T"],
          );
          assert.equal(
            await page.locator('[data-brief="signal-5-kind"]').innerText(),
            "MODELED",
          );
          await context.close();
        });
      }
    });

    await t.test("render failure leaves the embedded DOM unchanged and resolves fallback", async () => {
      embedded = saturdayBrief;
      const fetched = structuredClone(saturdayBrief);
      fetched.labels.title = { en: "CORRUPTED TITLE", zh: "已破壞標題" };
      data = fetched;
      dataMode = "deferred";
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      await page.locator(".event-board").evaluate((element) => element.remove());
      assert.ok(deferredResponse, "expected the fetched brief response to be deferred");
      deferredResponse.setHeader("content-type", "application/json");
      deferredResponse.end(JSON.stringify(data));
      const outcome = await page.evaluate(async () => {
        try {
          const brief = await window.briefReady;
          return { status: "resolved", runId: brief.runId };
        } catch {
          return { status: "rejected", runId: "" };
        }
      });
      assert.deepEqual(outcome, {
        status: "resolved",
        runId: saturdayBrief.runId,
      });
      assert.equal(
        await page.locator('[data-brief="title"]').first().innerText(),
        saturdayBrief.labels.title.en,
      );
      await context.close();
    });

    await t.test("hanging fetch never delays normal playback", async () => {
      embedded = saturdayBrief;
      dataMode = "hanging";
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      await page.waitForTimeout(350);
      const time = await page.evaluate(
        () => window.__timelines["weekly-ai-market-brief"].time(),
      );
      assert.ok(time > 0.1, `expected playback despite hanging data fetch, got ${time}`);
      await context.close();
    });

    await t.test("unreachable fetch falls back without delaying playback", async () => {
      dataMode = "unreachable";
      const { context, page } = await newCompositionPage(browser, baseUrl, {
        query: "lang=en&embed=1",
      });
      await page.waitForTimeout(350);
      const state = await page.evaluate(() => ({
        runId: document
          .querySelector("#embedded-market-brief")
          ?.textContent?.includes("2026-07-25-saturday"),
        time: window.__timelines["weekly-ai-market-brief"].time(),
      }));
      assert.equal(state.runId, true);
      assert.ok(state.time > 0.1);
      await context.close();
    });
  } finally {
    for (const response of hangingResponses) response.destroy();
    deferredResponse?.destroy();
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

declare global {
  interface Window {
    __timelines: Record<
      string,
      {
        pause(): unknown;
        paused(): boolean;
        duration(): number;
        seek(time: number): { pause(): unknown };
        time(): number;
      }
    >;
    briefReady: Promise<MarketBriefPayload>;
    loadBrief(): Promise<MarketBriefPayload>;
  }
}
