import assert from "node:assert/strict";
import test from "node:test";
import { resolveNewsletterEndpoint } from "../../app/newsletter.ts";

test("newsletter endpoint accepts only absolute HTTPS URLs", () => {
  assert.equal(resolveNewsletterEndpoint("https://example.com/subscribe"), "https://example.com/subscribe");
  assert.equal(resolveNewsletterEndpoint(undefined), undefined);
  assert.equal(resolveNewsletterEndpoint("http://example.com/subscribe"), undefined);
  assert.equal(resolveNewsletterEndpoint("/api/subscribe"), undefined);
  assert.equal(resolveNewsletterEndpoint("javascript:alert(1)"), undefined);
});
