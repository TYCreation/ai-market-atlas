import type { GateIssue } from "./quality-gate.ts";
import { sortGateIssues } from "./quality-gate.ts";
import type { MarketSnapshot, MetricRecord, SourceRecord } from "./types.ts";

export type SourceFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FetchResult = {
  reachable: boolean;
  status?: number;
};

const TRUSTED_SOURCE_KINDS = new Set<SourceRecord["kind"]>([
  "official",
  "company",
  "research",
  "pricing",
  "market",
]);

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

async function fetchSource(fetcher: SourceFetcher, url: string): Promise<FetchResult> {
  try {
    const response = await fetcher(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return {
      reachable: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch {
    return { reachable: false };
  }
}

export async function checkSourceHealth(
  snapshot: MarketSnapshot,
  fetcher: SourceFetcher,
): Promise<GateIssue[]> {
  const metricIds = checkedMetricIds(snapshot);
  const citedUrls = new Set<string>();
  for (const metricId of metricIds) {
    const metric = snapshot.metrics[metricId];
    if (!metric) continue;
    for (const source of urlSources(snapshot, metric)) citedUrls.add(source.url!);
  }

  const cache = new Map<string, Promise<FetchResult>>();
  for (const url of [...citedUrls].sort()) cache.set(url, fetchSource(fetcher, url));
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
          : `Required source ${source.id} is unreachable.`,
        sourceIds: [source.id],
      });
    }
  }
  return sortGateIssues(issues);
}
