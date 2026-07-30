import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const executable = chromium.executablePath();
assert.ok(
  existsSync(executable),
  `Pinned Playwright Chromium is missing at ${executable}; run npm run market:browser:install`,
);
assert.doesNotMatch(
  executable,
  /Google Chrome\.app|[\\/]usr[\\/](?:local[\\/])?bin[\\/](?:google-chrome|chromium)/i,
  "Market browser verification must not use a machine-global Chrome installation",
);

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const version = await browser.version();
  assert.ok(version.length > 0, "Pinned Playwright Chromium did not report a version");
  process.stdout.write(`Playwright Chromium ${version} ready at ${executable}\n`);
} finally {
  await browser?.close();
}
