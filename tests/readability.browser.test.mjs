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
  const textSizes = await page.locator("body *").evaluateAll((elements) => {
    const hasVisibleDirectText = (element) => {
      const directTextNodes = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
      );
      if (directTextNodes.length === 0) return false;

      const elementStyles = getComputedStyle(element);
      if (elementStyles.visibility === "hidden" || elementStyles.visibility === "collapse") {
        return false;
      }

      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const styles = getComputedStyle(ancestor);
        // Nested opacities multiply, so effective opacity reaches zero only
        // when at least one ancestor's computed opacity is zero.
        if (
          styles.display === "none" ||
          Number.parseFloat(styles.opacity) === 0
        ) {
          return false;
        }
      }

      return directTextNodes.some((node) => {
        const range = document.createRange();
        range.selectNode(node);
        return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
      });
    };

    return elements
      .filter(hasVisibleDirectText)
      .map((element) => ({
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        selector: `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`,
      }));
  });
  assert.ok(textSizes.length > 0, "expected the rendered homepage to contain visible direct text");
  const undersized = textSizes.filter(({ fontSize }) => fontSize < 12);
  assert.deepEqual(undersized, [], `visible text below the 12px floor: ${JSON.stringify(undersized)}`);
}

async function assertTargetHeights(page, selectors = targetSelectors) {
  for (const selector of selectors) {
    const boxes = await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    assert.ok(boxes.length > 0, `expected the rendered homepage to contain ${selector}`);
    for (const height of boxes) {
      assert.ok(height >= 24, `${selector} target height was ${height}px, below 24px`);
    }
  }
}

async function assertTargetsAndFocus(page) {
  await assertTargetHeights(page);

  const navLink = page.locator(".nav-link").first();
  await navLink.focus();
  const outline = await navLink.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { style: styles.outlineStyle, width: Number.parseFloat(styles.outlineWidth) };
  });
  assert.notEqual(outline.style, "none", "focused .nav-link must retain a visible outline");
  assert.ok(outline.width >= 2, `focused .nav-link outline was ${outline.width}px, below 2px`);
}

async function assertNewsletterAccessibility(page) {
  const newsletter = page.locator(".newsletter");
  assert.equal(await newsletter.count(), 1, "homepage must render one newsletter section");
  assert.equal(await newsletter.getAttribute("aria-labelledby"), "newsletter-title");
  assert.equal(await newsletter.locator("#newsletter-title").count(), 1);
  const form = newsletter.locator("form");
  assert.equal(await form.count(), 1);
  const email = newsletter.locator("#newsletter-email");
  assert.equal(await email.getAttribute("type"), "email");
  assert.equal(await email.getAttribute("name"), "email");
  assert.equal(await email.getAttribute("autocomplete"), "email");
  assert.equal(await email.getAttribute("aria-describedby"), "newsletter-consent newsletter-status");
  for (const id of ["newsletter-consent", "newsletter-status"]) {
    assert.equal(
      await newsletter.locator(`#${id}`).count(),
      1,
      `newsletter aria-describedby must reference an existing #${id}`,
    );
  }
  assert.equal(await newsletter.locator('label[for="newsletter-email"]').count(), 1);
  const consent = newsletter.locator('input[name="newsletter-consent"]');
  assert.equal(await consent.count(), 1);
  assert.equal(await consent.evaluate((element) => element.closest("label")?.id ?? null), "newsletter-consent");
  assert.equal(await newsletter.locator('button[type="submit"]').count(), 1);
  assert.equal(await email.isDisabled(), true, "unconfigured newsletter email must be disabled");
  assert.equal(await consent.isDisabled(), true);
  assert.equal(await newsletter.locator('button[type="submit"]').isDisabled(), true);
  assert.match(await newsletter.locator("#newsletter-status").innerText(), /not configured|尚未開放/);
}

async function assertTextVisibilityCensusRegressions(page) {
  await assert.rejects(
    () => assertTargetHeights(page, [".readability-missing-target"]),
    /expected the rendered homepage to contain \.readability-missing-target/,
    "every required target selector must match at least one element",
  );

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "readability-census-probe";
    probe.innerHTML = '<span style="display: contents; font-size: 11px">display-contents text</span>';
    document.body.append(probe);
  });

  try {
    await assert.rejects(
      () => assertVisibleTextSize(page),
      /visible text below the 12px floor/,
      "the census must include direct text in display: contents elements",
    );

    await page.locator("#readability-census-probe").evaluate((probe) => {
      probe.innerHTML = '<span style="font-size: 8px; visibility: visible">visibility-overridden text</span>';
      probe.style.visibility = "hidden";
    });
    await assert.rejects(
      () => assertVisibleTextSize(page),
      /"fontSize":8/,
      "the census must include text whose visibility overrides a hidden ancestor",
    );

    await page.locator("#readability-census-probe").evaluate((probe) => {
      probe.innerHTML = '<span style="font-size: 8px">opacity-hidden text</span>';
      probe.style.visibility = "visible";
      probe.style.opacity = "0";
    });
    await assert.doesNotReject(
      () => assertVisibleTextSize(page),
      "the census must exclude text hidden by an opacity-zero ancestor",
    );
  } finally {
    await page.locator("#readability-census-probe").evaluateAll((elements) => elements.forEach((element) => element.remove()));
  }
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
        await assertNewsletterAccessibility(page);
        await assertTargetsAndFocus(page);
        await assertTextVisibilityCensusRegressions(page);
        assert.ok(
          await page.locator(".report-evidence .watch-card").count() > 3,
          "the rendered homepage must expose more than three evidence cards",
        );

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
