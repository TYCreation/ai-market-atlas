import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { withBuiltSite } from "./helpers/site-browser-runtime.mjs";

const targetSelectors = [
  ".nav-link",
  ".brand",
  ".source-jump",
  ".brief-jump",
  ".footer-archive",
];

async function assertVisibleTextSize(page) {
  const textSizes = await page.locator("body *").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const styles = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          styles.display !== "none" &&
          styles.visibility !== "hidden" &&
          styles.visibility !== "collapse" &&
          Number(styles.opacity) !== 0 &&
          box.width > 0 &&
          box.height > 0 &&
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
          )
        );
      })
      .map((element) => ({
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        selector: `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`,
      })),
  );
  assert.ok(textSizes.length > 0, "expected the rendered homepage to contain visible direct text");
  const undersized = textSizes.filter(({ fontSize }) => fontSize < 12);
  assert.deepEqual(undersized, [], `visible text below the 12px floor: ${JSON.stringify(undersized)}`);
}

async function assertTargetsAndFocus(page) {
  for (const selector of targetSelectors) {
    const boxes = await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    for (const height of boxes) {
      assert.ok(height >= 24, `${selector} target height was ${height}px, below 24px`);
    }
  }

  const navLink = page.locator(".nav-link").first();
  await navLink.focus();
  const outline = await navLink.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { style: styles.outlineStyle, width: Number.parseFloat(styles.outlineWidth) };
  });
  assert.notEqual(outline.style, "none", "focused .nav-link must retain a visible outline");
  assert.ok(outline.width >= 2, `focused .nav-link outline was ${outline.width}px, below 2px`);
}

test("the built homepage preserves reader-facing type, viewport, target, and focus contracts", async () => {
  await withBuiltSite(async (origin) => {
    const browser = await chromium.launch();
    try {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ locale: "zh-TW", viewport });
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await page.locator(".masthead h1").waitFor();
        await page.evaluate(() => document.fonts.ready);

        await assertVisibleTextSize(page);
        await assertTargetsAndFocus(page);

        if (viewport.width === 1440) {
          for (const selector of [
            ".masthead h1",
            ".masthead-summary",
            ".masthead-meta",
            ".masthead-links",
            ".edition-status",
          ]) {
            const box = await page.locator(selector).boundingBox();
            assert.ok(box, `expected desktop masthead to render ${selector}`);
            assert.ok(
              box.y + box.height <= viewport.height,
              `${selector} ends at y=${box.y + box.height}, below the ${viewport.height}px desktop viewport`,
            );
          }
        }

        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
});
