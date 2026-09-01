import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { verifyDeployment, type VerificationExpectation } from "../market-data/deployment.ts";

const SITE_ORIGIN = "https://aimarketatlas.net";
const manifestDefault = resolve(dirname(fileURLToPath(import.meta.url)), "../work/pages-candidate/.market-deployment.json");

type ReleaseManifest = VerificationExpectation & {
  routes: string[];
};

function canonical(route: string): string {
  return `${SITE_ORIGIN}${route === "/" ? "/" : route.endsWith("/") ? route : `${route}/`}`;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchChecked(baseUrl: string, path: string, accept = "text/html"): Promise<Response> {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { accept },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

function assertCanonicalAndAlternates(route: string, html: string): void {
  const canonicalLinks = html.match(/<link\b[^>]*\brel="canonical"[^>]*>/gi) ?? [];
  if (canonicalLinks.length !== 1 || !canonicalLinks[0].includes(`href="${canonical(route)}"`)) {
    throw new Error(`${route} must expose exactly one trailing-slash canonical`);
  }
  const alternate = [...html.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/gi)]
    .map((match) => match[0]);
  const localized = route === "/en" || route.startsWith("/en/") ? route.slice(3) || "/" : route;
  const zhRoute = localized;
  const enRoute = localized === "/" ? "/en/" : `/en${localized}`;
  for (const [language, expected] of [["zh-Hant", zhRoute], ["en", enRoute]] as const) {
    const matches = alternate.filter((tag) =>
      tag.includes(`hrefLang="${language}"`) && tag.includes(`href="${canonical(expected)}"`),
    );
    if (matches.length !== 1) throw new Error(`${route} must expose one ${language} trailing-slash alternate`);
  }
}

function assertRouteIdentityMarker(route: string, html: string, identity: VerificationExpectation["routeIdentities"][string]): void {
  if (identity.kind === "current") {
    const value = `${identity.runId} ${identity.dataCutoff}`;
    const found = html.match(new RegExp(`<span\\b[^>]*hidden=""[^>]*data-market-route-identity="${escaped(value)}"[^>]*><\\/span>`, "g")) ?? [];
    if (found.length !== 1) {
      throw new Error(`${route} current route identity marker is missing or not hidden`);
    }
  }
  if (identity.kind === "archive-detail") {
    const value = `${identity.runId} ${identity.dataCutoff}`;
    const found = html.match(/<span\b[^>]*\bdata-archive-route-identity="([^"]+)"[^>]*>/g) ?? [];
    if (found.length !== 1 || !found[0].includes(`data-archive-route-identity="${value}"`)) {
      throw new Error(`${route} archive route identity marker is missing or incorrect`);
    }
    const marker = new RegExp(`<span[^>]*hidden=""[^>]*data-archive-route-identity="${escaped(value)}"[^>]*><\\/span>`);
    if (!marker.test(html)) throw new Error(`${route} archive route identity marker is not hidden and empty`);
  }
}

function expectedLastmod(route: string, manifest: ReleaseManifest): string {
  const identity = manifest.routeIdentities[route];
  if (identity.kind === "current" || identity.kind === "market-brief") return manifest.dataCutoff;
  if (identity.kind === "archive-detail" || identity.kind === "brief-detail") return identity.dataCutoff;
  if (identity.kind === "entity-detail") return identity.lastModified;
  return manifest.dataCutoff;
}

function assertSitemap(xml: string, manifest: ReleaseManifest): void {
  if (xml.includes("/market-brief/")) throw new Error("sitemap must exclude market-brief");
  for (const route of manifest.routes.filter((route) => route !== "/market-brief/")) {
    const entry = `<loc>${canonical(route)}</loc><lastmod>${expectedLastmod(route, manifest)}</lastmod>`;
    if (!xml.includes(entry)) throw new Error(`sitemap is missing exact lastmod for ${route}`);
  }
}

async function assertNewsletter(baseUrl: string, mode: "disabled" | "enabled"): Promise<void> {
  const html = await (await fetchChecked(baseUrl, "/")).text();
  const form = html.match(/<form\b[^>]*class="newsletter-form"[^>]*>/i)?.[0];
  if (!form || !html.includes('aria-labelledby="newsletter-title"') || !html.includes('id="newsletter-title"')) {
    throw new Error("homepage newsletter markup is missing accessible labeling");
  }
  const email = html.match(/<input\b[^>]*id="newsletter-email"[^>]*>/i)?.[0] ?? "";
  const consent = html.match(/<input\b[^>]*name="newsletter-consent"[^>]*>/i)?.[0] ?? "";
  const button = html.match(/<button\b[^>]*type="submit"[^>]*>/i)?.[0] ?? "";
  if (!email || !consent || !button || !email.includes('aria-describedby="newsletter-consent newsletter-status"')) {
    throw new Error("homepage newsletter controls are not accessible");
  }
  const disabled = /\bdisabled(?:=""|\b)/i;
  if (mode === "disabled") {
    if (!disabled.test(email) || !disabled.test(consent) || !disabled.test(button) || /\baction="/i.test(form)) {
      throw new Error("newsletter disabled mode is not fail-closed");
    }
  } else if (disabled.test(email) || disabled.test(consent) || disabled.test(button) || !/\baction="https:\/\//i.test(form)) {
    throw new Error("newsletter enabled mode is not configured with HTTPS action");
  }
}

export async function verifyReleaseEndpoint(
  baseUrl: string,
  manifest: ReleaseManifest,
  newsletterMode: "disabled" | "enabled" = "disabled",
): Promise<void> {
  await verifyDeployment(baseUrl, manifest.routes, manifest);
  for (const route of manifest.routes) {
    const html = await (await fetchChecked(baseUrl, route)).text();
    if (route !== "/market-brief/") {
      assertCanonicalAndAlternates(route, html);
      assertRouteIdentityMarker(route, html, manifest.routeIdentities[route]);
    } else if (!/<meta\b[^>]*name="robots"[^>]*content="noindex, follow"/i.test(html)) {
      throw new Error("market-brief must remain noindex");
    }
  }
  const sitemap = await (await fetchChecked(baseUrl, "/sitemap.xml", "application/xml")).text();
  assertSitemap(sitemap, manifest);
  const notFound = await fetch(new URL(`/__release-not-found-${manifest.runId}/`, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (notFound.status !== 404) throw new Error(`unknown route returned HTTP ${notFound.status}, expected 404`);
  await assertNewsletter(baseUrl, newsletterMode);
}

export async function loadReleaseManifest(path = manifestDefault): Promise<ReleaseManifest> {
  return JSON.parse(await readFile(path, "utf8")) as ReleaseManifest;
}

async function main(args: string[]): Promise<void> {
  const baseIndex = args.indexOf("--base-url");
  const baseUrl = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
  if (!baseUrl || baseUrl.startsWith("--")) throw new Error("--base-url is required");
  const manifestIndex = args.indexOf("--manifest");
  const manifest = await loadReleaseManifest(manifestIndex >= 0 ? args[manifestIndex + 1] : undefined);
  const newsletterMode = args.includes("--newsletter=enabled") ? "enabled" : "disabled";
  await verifyReleaseEndpoint(baseUrl, manifest, newsletterMode);
  process.stdout.write(`Release verification passed for ${baseUrl}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
