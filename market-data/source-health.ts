import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { GateIssue } from "./quality-gate.ts";
import { sortGateIssues } from "./quality-gate.ts";
import type { MarketSnapshot, MetricRecord, SourceRecord } from "./types.ts";

export type SourceFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HostnameResolver = (hostname: string) => Promise<readonly string[]>;

type FetchResult = {
  reachable: boolean;
  status?: number;
};

type RequestResult = {
  status?: number;
  location?: string;
  failed: boolean;
};

const MAX_REDIRECTS = 5;
const TRUSTED_SOURCE_KINDS = new Set<SourceRecord["kind"]>([
  "official",
  "company",
  "research",
  "pricing",
  "market",
]);

export const resolveHostname: HostnameResolver = async (hostname) => (
  await lookup(hostname, { all: true, verbatim: true })
).map(({ address }) => address);

function checkedMetricIds(snapshot: MarketSnapshot): string[] {
  const ids = new Set<string>(snapshot.keySignalIds);
  for (const metric of Object.values(snapshot.metrics)) {
    if (metric.required) ids.add(metric.id);
  }
  for (const page of Object.values(snapshot.pages)) {
    for (const metricId of page.thesisMetricIds) ids.add(metricId);
  }
  return [...ids].sort();
}

function urlSources(snapshot: MarketSnapshot, metric: MetricRecord): SourceRecord[] {
  return metric.sourceIds
    .map((id) => snapshot.sources[id])
    .filter((source): source is SourceRecord => source?.url !== undefined);
}

function parseIpv4(address: string): number[] | undefined {
  const octets = address.split(".");
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^(?:0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)
  ) {
    return undefined;
  }
  return octets.map(Number);
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return false;
  }
  return true;
}

function ipv6Hextets(address: string): number[] | undefined {
  if (address.includes("%")) return undefined;
  const withoutZone = address.split("%", 1)[0].toLowerCase();
  if (withoutZone.split("::").length > 2) return undefined;
  let normalized = withoutZone;
  const lastColon = normalized.lastIndexOf(":");
  const ipv4Tail = normalized.slice(lastColon + 1);
  if (ipv4Tail.includes(".")) {
    const octets = parseIpv4(ipv4Tail);
    if (!octets) return undefined;
    normalized = `${normalized.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [leftRaw, rightRaw] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    (normalized.includes("::") ? left.length + right.length >= 8 : left.length !== 8)
  ) {
    return undefined;
  }
  const zeros = normalized.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array.from({ length: zeros }, () => "0"), ...right].map(
    (part) => Number.parseInt(part, 16),
  );
}

function isPublicIpv6(address: string): boolean {
  const hextets = ipv6Hextets(address);
  if (!hextets || hextets.length !== 8) return false;
  const isIpv4Mapped =
    hextets.slice(0, 5).every((part) => part === 0) &&
    hextets[5] === 0xffff;
  const isIpv4Compatible = hextets.slice(0, 6).every((part) => part === 0);
  if (isIpv4Mapped || isIpv4Compatible) {
    const ipv4 = [
      hextets[6] >> 8,
      hextets[6] & 0xff,
      hextets[7] >> 8,
      hextets[7] & 0xff,
    ].join(".");
    return isPublicIpv4(ipv4);
  }
  if ((hextets[0] & 0xe000) !== 0x2000) return false;
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return false;
  return true;
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? isPublicIpv4(address)
    : family === 6
      ? isPublicIpv6(address)
      : false;
}

function normalizedHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    !hostname.includes(".")
  );
}

async function isPublicTarget(
  url: URL,
  resolver: HostnameResolver,
  resolutionCache: Map<string, Promise<readonly string[]>>,
): Promise<boolean> {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return false;
  }
  const hostname = normalizedHostname(url);
  if (!hostname || isLocalHostname(hostname)) return false;
  if (isIP(hostname) !== 0) return isPublicAddress(hostname);
  let addresses = resolutionCache.get(hostname);
  if (!addresses) {
    addresses = resolver(hostname);
    resolutionCache.set(hostname, addresses);
  }
  try {
    const resolved = await addresses;
    return resolved.length > 0 && resolved.every(isPublicAddress);
  } catch {
    return false;
  }
}

function sourceRequester(fetcher: SourceFetcher, resolver: HostnameResolver) {
  const requestCache = new Map<string, Promise<RequestResult>>();
  const resolutionCache = new Map<string, Promise<readonly string[]>>();

  const request = (rawUrl: string): Promise<RequestResult> => {
    const cached = requestCache.get(rawUrl);
    if (cached) return cached;
    const pending = (async () => {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return { failed: true };
      }
      if (!await isPublicTarget(url, resolver, resolutionCache)) return { failed: true };
      try {
        const response = await fetcher(url.href, {
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        return {
          failed: false,
          status: response.status,
          location: response.headers.get("location") ?? undefined,
        };
      } catch {
        return { failed: true };
      }
    })();
    requestCache.set(rawUrl, pending);
    return pending;
  };

  const follow = async (
    rawUrl: string,
    redirects: number,
    visited: Set<string>,
  ): Promise<FetchResult> => {
    const result = await request(rawUrl);
    if (result.failed || result.status === undefined) return { reachable: false };
    if (result.status >= 200 && result.status < 300) {
      return { reachable: true, status: result.status };
    }
    if (result.status >= 300 && result.status < 400) {
      if (!result.location) return { reachable: true, status: result.status };
      if (redirects >= MAX_REDIRECTS) return { reachable: false, status: result.status };
      let redirected: string;
      try {
        redirected = new URL(result.location, rawUrl).href;
      } catch {
        return { reachable: false, status: result.status };
      }
      if (visited.has(redirected)) return { reachable: false, status: result.status };
      return follow(redirected, redirects + 1, new Set([...visited, redirected]));
    }
    return { reachable: false, status: result.status };
  };

  return (url: string) => follow(url, 0, new Set([url]));
}

export async function checkSourceHealth(
  snapshot: MarketSnapshot,
  fetcher: SourceFetcher,
  resolver: HostnameResolver = resolveHostname,
): Promise<GateIssue[]> {
  const metricIds = checkedMetricIds(snapshot);
  const citedUrls = new Set<string>();
  for (const metricId of metricIds) {
    const metric = snapshot.metrics[metricId];
    if (!metric) continue;
    for (const source of urlSources(snapshot, metric)) citedUrls.add(source.url!);
  }

  const fetchSource = sourceRequester(fetcher, resolver);
  const cache = new Map<string, Promise<FetchResult>>();
  for (const url of [...citedUrls].sort()) cache.set(url, fetchSource(url));
  await Promise.all(cache.values());

  const issues: GateIssue[] = [];
  for (const metricId of metricIds) {
    const metric = snapshot.metrics[metricId];
    if (!metric) continue;
    const sources = urlSources(snapshot, metric);
    for (const source of sources) {
      const result = await cache.get(source.url!)!;
      if (result.reachable) continue;
      const hasReachableTrustedBackup = (
        result.status === 403 || result.status === 405
      ) && (
        await Promise.all(
          sources
            .filter((candidate) => candidate.id !== source.id && TRUSTED_SOURCE_KINDS.has(candidate.kind))
            .map((candidate) => cache.get(candidate.url!)!),
        )
      ).some((candidate) => candidate.reachable);
      issues.push({
        code: "SOURCE_UNREACHABLE",
        severity: hasReachableTrustedBackup ? "warn" : "block",
        metricId: metric.id,
        page: metric.page,
        message: hasReachableTrustedBackup
          ? `Source ${source.id} denied automated access, but a second trusted source is reachable.`
          : `Required source ${source.id} is unreachable or resolves to a non-public target.`,
        sourceIds: [source.id],
      });
    }
  }
  return sortGateIssues(issues);
}
