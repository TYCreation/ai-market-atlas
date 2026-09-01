import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { verifyDeployment, type VerificationExpectation } from "../market-data/deployment.ts";
import { ARTIFACT_MANIFEST_NAME } from "../market-data/artifact-tree.ts";
import { readDeploymentManifest } from "./deploy-pages.ts";

const SITE_ORIGIN = "https://aimarketatlas.net";
const manifestDefault = resolve(dirname(fileURLToPath(import.meta.url)), "../work/pages-candidate/.market-deployment.json");

export type ReleaseManifest = VerificationExpectation & {
  routes: string[];
};

type ParsedTag = {
  name: string;
  attributes: Map<string, string>;
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

function parseTag(tag: string): ParsedTag {
  const name = /^<([a-z0-9:-]+)\b/i.exec(tag)?.[1]?.toLowerCase();
  if (!name) throw new Error(`could not parse tag: ${tag}`);
  const attributes = new Map<string, string>();
  const source = tag.slice(name.length + 1, tag.endsWith("/>") ? -2 : -1);
  const expression = /([^\s"'=<>\/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(expression)) {
    const attributeName = match[1].toLowerCase();
    const attributeValue = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(attributeName, attributeValue);
  }
  return { name, attributes };
}

function parseTags(html: string, name: string): ParsedTag[] {
  const expression = new RegExp(`<${name}\\b[^>]*>`, "gi");
  return [...html.matchAll(expression)].map((match) => parseTag(match[0]));
}

function hasRel(tag: ParsedTag, rel: string): boolean {
  return (tag.attributes.get("rel") ?? "")
    .split(/\s+/)
    .map((value) => value.toLowerCase())
    .includes(rel);
}

function classIncludes(tag: ParsedTag, className: string): boolean {
  return (tag.attributes.get("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(className);
}

function idsInDocument(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/\bid=(["'])([^"']+)\1/gi)].map((match) => match[2]),
  );
}

function assertCanonicalAndAlternates(route: string, html: string): void {
  const links = parseTags(html, "link");
  const canonicalLinks = links.filter((tag) => hasRel(tag, "canonical"));
  if (
    canonicalLinks.length !== 1 ||
    canonicalLinks[0].attributes.get("href") !== canonical(route)
  ) {
    throw new Error(`${route} must expose exactly one trailing-slash canonical`);
  }
  const localized = route === "/en" || route.startsWith("/en/") ? route.slice(3) || "/" : route;
  const zhRoute = localized;
  const enRoute = localized === "/" ? "/en/" : `/en${localized}`;
  const expectedAlternates = new Map<string, string>([
    ["zh-hant", canonical(zhRoute)],
    ["en", canonical(enRoute)],
    ["x-default", canonical(zhRoute)],
  ]);
  const actualAlternates = new Map<string, string>();
  for (const tag of links.filter((candidate) => hasRel(candidate, "alternate"))) {
    const language = tag.attributes.get("hreflang")?.toLowerCase();
    if (!language) continue;
    if (!expectedAlternates.has(language)) {
      throw new Error(`${route} has an unexpected hreflang alternate: ${language}`);
    }
    if (actualAlternates.has(language)) {
      throw new Error(`${route} has duplicate hreflang alternates for ${language}`);
    }
    actualAlternates.set(language, tag.attributes.get("href") ?? "");
  }
  if (actualAlternates.size !== expectedAlternates.size) {
    throw new Error(`${route} hreflang alternates do not match the reviewed set`);
  }
  for (const [language, expectedHref] of expectedAlternates) {
    if (actualAlternates.get(language) !== expectedHref) {
      throw new Error(`${route} must expose one ${language} trailing-slash alternate`);
    }
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
  const expectedEntries = new Map(
    manifest.routes
      .filter((route) => route !== "/market-brief/")
      .map((route) => [canonical(route), expectedLastmod(route, manifest)]),
  );
  const actualEntries = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const entry = match[1];
    const location = /<loc>([^<]+)<\/loc>/i.exec(entry)?.[1];
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/i.exec(entry)?.[1];
    if (!location || !lastmod) {
      throw new Error("sitemap entries must include both loc and lastmod");
    }
    if (location.includes("/market-brief/")) {
      throw new Error("sitemap must exclude market-brief");
    }
    if (actualEntries.has(location)) {
      duplicates.add(location);
    }
    actualEntries.set(location, lastmod);
  }
  if (duplicates.size > 0) {
    throw new Error(`sitemap has duplicate route entries: ${[...duplicates].sort().join(", ")}`);
  }
  if (actualEntries.size !== expectedEntries.size) {
    throw new Error("sitemap route map does not match the reviewed manifest");
  }
  for (const [location, expectedLastModified] of expectedEntries) {
    const actualLastModified = actualEntries.get(location);
    if (actualLastModified === undefined) {
      throw new Error(`sitemap is missing exact lastmod for ${location.replace(SITE_ORIGIN, "") || "/"}`);
    }
    if (actualLastModified !== expectedLastModified) {
      throw new Error(`sitemap is missing exact lastmod for ${location.replace(SITE_ORIGIN, "") || "/"}`);
    }
  }
  for (const location of actualEntries.keys()) {
    if (!expectedEntries.has(location)) {
      throw new Error(`sitemap route map does not match the reviewed manifest: unexpected ${location}`);
    }
  }
}

async function assertNewsletter(baseUrl: string, mode: "disabled" | "enabled"): Promise<void> {
  const html = await (await fetchChecked(baseUrl, "/")).text();
  const ids = idsInDocument(html);
  const section = parseTags(html, "section").find((tag) => classIncludes(tag, "newsletter"));
  const form = parseTags(html, "form").find((tag) => classIncludes(tag, "newsletter-form"));
  if (
    !section ||
    section.attributes.get("aria-labelledby") !== "newsletter-title" ||
    !ids.has("newsletter-title") ||
    !form
  ) {
    throw new Error("homepage newsletter markup is missing accessible labeling");
  }
  const labels = parseTags(html, "label");
  const inputs = parseTags(html, "input");
  const buttons = parseTags(html, "button");
  const email = inputs.find((tag) => tag.attributes.get("id") === "newsletter-email");
  const consent = inputs.find((tag) => tag.attributes.get("name") === "newsletter-consent");
  const button = buttons.find((tag) => tag.attributes.get("type") === "submit");
  if (
    !email ||
    !consent ||
    !button ||
    email.attributes.get("type") !== "email" ||
    email.attributes.get("name") !== "email" ||
    email.attributes.get("autocomplete") !== "email" ||
    email.attributes.get("aria-describedby") !== "newsletter-consent newsletter-status" ||
    !ids.has("newsletter-consent") ||
    !ids.has("newsletter-status") ||
    !labels.some((tag) => tag.attributes.get("for") === "newsletter-email")
  ) {
    throw new Error("homepage newsletter controls are not accessible");
  }
  if (mode === "disabled") {
    if (
      !email.attributes.has("disabled") ||
      !consent.attributes.has("disabled") ||
      !button.attributes.has("disabled") ||
      form.attributes.has("action") ||
      form.attributes.has("method")
    ) {
      throw new Error("newsletter disabled mode is not fail-closed");
    }
    return;
  }
  let action: URL;
  try {
    action = new URL(form.attributes.get("action") ?? "");
  } catch {
    throw new Error("newsletter enabled mode is not configured with HTTPS action");
  }
  if (
    action.protocol !== "https:" ||
    action.username ||
    action.password ||
    action.hash ||
    form.attributes.get("method")?.toLowerCase() !== "post" ||
    !email.attributes.has("required") ||
    !consent.attributes.has("required") ||
    email.attributes.has("disabled") ||
    consent.attributes.has("disabled") ||
    button.attributes.has("disabled") ||
    button.attributes.get("aria-disabled") === "true"
  ) {
    throw new Error("newsletter enabled mode does not require secure native submission controls");
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

export async function loadReleaseManifest(
  path = manifestDefault,
  expectedManifestSha256?: string,
): Promise<ReleaseManifest> {
  const absolute = resolve(path);
  if (basename(absolute) !== ARTIFACT_MANIFEST_NAME) {
    throw new Error("release manifest path must point to .market-deployment.json");
  }
  return await readDeploymentManifest(dirname(absolute), {
    expectedManifestSha256,
  }) as ReleaseManifest;
}

async function main(args: string[]): Promise<void> {
  const baseIndex = args.indexOf("--base-url");
  const baseUrl = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
  if (!baseUrl || baseUrl.startsWith("--")) throw new Error("--base-url is required");
  const manifestIndex = args.indexOf("--manifest");
  const expectedManifestIndex = args.indexOf("--expected-manifest-sha256");
  const expectedManifestSha256 =
    expectedManifestIndex >= 0 ? args[expectedManifestIndex + 1] : undefined;
  if (
    !expectedManifestSha256 ||
    expectedManifestSha256.startsWith("--") ||
    !/^[a-f0-9]{64}$/.test(expectedManifestSha256)
  ) {
    throw new Error("--expected-manifest-sha256 is required");
  }
  const manifest = await loadReleaseManifest(
    manifestIndex >= 0 ? args[manifestIndex + 1] : undefined,
    expectedManifestSha256,
  );
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
