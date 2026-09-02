import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { SaxesParser } from "saxes";
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

const RAW_TEXT_ELEMENTS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "script",
  "style",
  "template",
  "textarea",
  "title",
  "xmp",
]);

function canonical(route: string): string {
  return `${SITE_ORIGIN}${route === "/" ? "/" : route.endsWith("/") ? route : `${route}/`}`;
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
    if (attributes.has(attributeName)) {
      throw new Error(`duplicate attribute ${attributeName} in ${tag}`);
    }
    attributes.set(attributeName, attributeValue);
  }
  return { name, attributes };
}

function findTagEnd(html: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function crawlerVisibleHtml(html: string): string {
  let visible = "";
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[index] !== "<") {
      visible += html[index++];
      continue;
    }
    const opening = /^<([a-z][a-z0-9:-]*)\b/i.exec(html.slice(index));
    if (!opening) {
      visible += html[index++];
      continue;
    }
    const end = findTagEnd(html, index);
    if (end < 0) break;
    const tagName = opening[1].toLowerCase();
    const openingTag = html.slice(index, end + 1);
    visible += openingTag;
    index = end + 1;
    if (tagName === "plaintext") {
      // PLAINTEXT consumes the remainder of the document as text; apparent
      // closing tags must not become live markup.
      index = html.length;
      continue;
    }
    if (RAW_TEXT_ELEMENTS.has(tagName)) {
      const closing = new RegExp(`</${tagName}\\s*>`, "ig");
      closing.lastIndex = index;
      const match = closing.exec(html);
      index = match ? match.index + match[0].length : html.length;
    }
  }
  return visible;
}

function parseAllTags(html: string): ParsedTag[] {
  const visible = crawlerVisibleHtml(html);
  const tags: ParsedTag[] = [];
  let index = 0;
  while (index < visible.length) {
    const start = visible.indexOf("<", index);
    if (start < 0) break;
    const opening = /^<([a-z][a-z0-9:-]*)\b/i.exec(visible.slice(start));
    if (!opening) {
      index = start + 1;
      continue;
    }
    const end = findTagEnd(visible, start);
    if (end < 0) break;
    tags.push(parseTag(visible.slice(start, end + 1)));
    index = end + 1;
  }
  return tags;
}

function parseTags(html: string, name: string): ParsedTag[] {
  const expected = name.toLowerCase();
  return parseAllTags(html).filter((tag) => tag.name === expected);
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
  return new Set(parseAllTags(html).flatMap((tag) => {
    const id = tag.attributes.get("id");
    return id ? [id] : [];
  }));
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
    if (!language) throw new Error(`${route} has an alternate link without hreflang`);
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
  const visible = crawlerVisibleHtml(html);
  const emptyMarkers = (attribute: string, value: string): ParsedTag[] => {
    const matches: ParsedTag[] = [];
    const expression = /<span\b[^>]*>/gi;
    for (const match of visible.matchAll(expression)) {
      const tag = parseTag(match[0]);
      if (
        tag.attributes.get(attribute) === value &&
        tag.attributes.has("hidden") &&
        /^\s*<\/span>/i.test(visible.slice((match.index ?? 0) + match[0].length))
      ) {
        matches.push(tag);
      }
    }
    return matches;
  };
  if (identity.kind === "current") {
    const value = `${identity.runId} ${identity.dataCutoff}`;
    if (emptyMarkers("data-market-route-identity", value).length !== 1) {
      throw new Error(`${route} current route identity marker is missing or not hidden`);
    }
  }
  if (identity.kind === "archive-detail") {
    const value = `${identity.runId} ${identity.dataCutoff}`;
    const archiveMarkers = parseTags(html, "span").filter((tag) => tag.attributes.has("data-archive-route-identity"));
    if (archiveMarkers.length !== 1 || emptyMarkers("data-archive-route-identity", value).length !== 1) {
      throw new Error(`${route} archive route identity marker is missing or incorrect`);
    }
  }
}

function expectedLastmod(route: string, manifest: ReleaseManifest): string {
  const identity = manifest.routeIdentities[route];
  if (identity.kind === "current" || identity.kind === "market-brief") return manifest.dataCutoff;
  if (identity.kind === "archive-detail" || identity.kind === "brief-detail") return identity.dataCutoff;
  if (identity.kind === "entity-detail") return identity.lastModified;
  return manifest.dataCutoff;
}

export function assertSitemap(xml: string, manifest: ReleaseManifest): void {
  const expectedEntries = new Map(
    manifest.routes
      .filter((route) => route !== "/market-brief/")
      .map((route) => [canonical(route), expectedLastmod(route, manifest)]),
  );
  const actualEntries = new Map<string, string>();
  const parser = new SaxesParser({ xmlns: true });
  const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const stack: Array<{ name: string; uri: string; text: string; children: Set<string>; fields: Map<string, string> }> = [];
  let rootSeen = false;
  let parserError: unknown;
  const fail = (message: string): never => { throw new Error(`sitemap XML is invalid: ${message}`); };
  parser.on("error", (error) => { parserError ??= error; });
  parser.on("doctype", () => fail("DOCTYPE is not supported"));
  parser.on("processinginstruction", () => fail("processing instructions are not supported"));
  parser.on("opentag", (tag) => {
    const name = tag.local ?? tag.name;
    const uri = tag.uri ?? "";
    if (stack.length === 0) {
      if (rootSeen || name !== "urlset" || uri !== sitemapNamespace) fail("root must be the sitemap urlset schema");
      rootSeen = true;
      const attributes = Object.keys(tag.attributes);
      if (attributes.some((attribute) => attribute !== "xmlns")) fail("urlset has unexpected attributes");
    } else {
      const parent = stack[stack.length - 1];
      if (uri !== sitemapNamespace) fail(`unexpected namespace on ${name}`);
      if (parent.name === "urlset" && name !== "url") fail(`urlset has unexpected child ${name}`);
      if (parent.name === "url" && (name !== "loc" && name !== "lastmod")) fail(`url has unexpected child ${name}`);
      if (parent.name === "loc" || parent.name === "lastmod") fail(`${parent.name} cannot contain child elements`);
      if (parent.name === "url" && parent.children.has(name)) fail(`url has duplicate ${name}`);
      if (parent.name === "url") parent.children.add(name);
      if (Object.keys(tag.attributes).length > 0) fail(`${name} has unexpected attributes`);
    }
    stack.push({ name, uri, text: "", children: new Set(), fields: new Map() });
  });
  parser.on("text", (text) => {
    const current = stack[stack.length - 1];
    if (current) current.text += text;
    else if (/\S/.test(text)) fail("text is outside the root element");
  });
  parser.on("cdata", (text) => {
    const current = stack[stack.length - 1];
    if (current) current.text += text;
    else if (/\S/.test(text)) fail("CDATA is outside the root element");
  });
  parser.on("closetag", (tag) => {
    const current = stack.pop();
    const name = typeof tag === "string" ? tag : tag.local ?? tag.name;
    if (!current || current.name !== name) fail("element nesting is malformed");
    if (current.name === "loc" || current.name === "lastmod") {
      const parent = stack[stack.length - 1];
      if (!parent || parent.name !== "url") fail(`${current.name} is outside a url entry`);
      parent.fields.set(current.name, current.text);
    }
    if (current.name === "url") {
      const location = current.fields.get("loc");
      const lastmod = current.fields.get("lastmod");
      if (!location || !lastmod || current.fields.size !== 2) fail("url entries must include exactly loc and lastmod");
      if (location.includes("/market-brief/")) fail("sitemap must exclude market-brief");
      if (actualEntries.has(location)) fail(`sitemap has duplicate route entries: ${location}`);
      actualEntries.set(location, lastmod);
    }
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    parserError ??= error;
  }
  if (parserError) fail(parserError instanceof Error ? parserError.message : String(parserError));
  if (!rootSeen || stack.length !== 0) fail("document has no complete root element");
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
    } else if (!parseTags(html, "meta").some((tag) =>
      tag.attributes.get("name")?.toLowerCase() === "robots" &&
      tag.attributes.get("content")?.toLowerCase() === "noindex, follow"
    )) {
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

export type ReleaseVerificationArgs = {
  baseUrl: string;
  manifestPath: string | undefined;
  expectedManifestSha256: string;
  newsletterMode: "enabled" | "disabled";
};

export function parseReleaseVerificationArgs(args: string[]): ReleaseVerificationArgs {
  let baseUrl: string | undefined;
  let manifestPath: string | undefined;
  let expectedManifestSha256: string | undefined;
  let newsletterMode: "enabled" | "disabled" | undefined;
  const singleton = (name: string, current: unknown): void => {
    if (current !== undefined) throw new Error(`duplicate ${name} flag`);
  };
  const valueFor = (argsIndex: number, flag: string): string => {
    const value = args[argsIndex + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--base-url") {
      singleton(flag, baseUrl);
      baseUrl = valueFor(index, flag);
      index += 1;
    } else if (flag === "--manifest") {
      singleton(flag, manifestPath);
      manifestPath = valueFor(index, flag);
      index += 1;
    } else if (flag === "--expected-manifest-sha256") {
      singleton(flag, expectedManifestSha256);
      expectedManifestSha256 = valueFor(index, flag);
      index += 1;
    } else if (flag === "--newsletter") {
      singleton(flag, newsletterMode);
      const value = valueFor(index, flag);
      if (value !== "enabled" && value !== "disabled") throw new Error("--newsletter must be enabled or disabled");
      newsletterMode = value;
      index += 1;
    } else if (flag.startsWith("--newsletter=")) {
      singleton("--newsletter", newsletterMode);
      const value = flag.slice("--newsletter=".length);
      if (value !== "enabled" && value !== "disabled") throw new Error("--newsletter must be enabled or disabled");
      newsletterMode = value;
    } else {
      throw new Error(`unknown flag: ${flag}`);
    }
  }
  if (!baseUrl) throw new Error("--base-url is required");
  if (!expectedManifestSha256 || !/^[a-f0-9]{64}$/.test(expectedManifestSha256)) {
    throw new Error("--expected-manifest-sha256 is required and must be 64 lowercase hex characters");
  }
  if (!newsletterMode) throw new Error("--newsletter enabled|disabled is required");
  return { baseUrl, manifestPath, expectedManifestSha256, newsletterMode };
}

async function main(args: string[]): Promise<void> {
  const parsed = parseReleaseVerificationArgs(args);
  const manifest = await loadReleaseManifest(parsed.manifestPath, parsed.expectedManifestSha256);
  await verifyReleaseEndpoint(parsed.baseUrl, manifest, parsed.newsletterMode);
  process.stdout.write(`Release verification passed for ${parsed.baseUrl}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
