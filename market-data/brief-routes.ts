import type { PublishedBrief } from "./briefs.ts";
import type { PageSlug } from "./types.ts";

const BRIEF_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBriefDate(value: string): boolean {
  const match = BRIEF_DATE.exec(value);
  if (!match) return false;
  const normalized = `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
  return !Number.isNaN(Date.parse(normalized)) && new Date(normalized).toISOString() === normalized;
}

export function briefRoutePaths(briefs: PublishedBrief[]): string[] {
  const dates = briefs.map(({ date }) => date);
  return [
    ...dates.map((date) => `/brief/${date}/`),
    ...dates.map((date) => `/en/brief/${date}/`),
  ];
}

export function briefsForPillar(
  briefs: PublishedBrief[],
  pillar: PageSlug,
): PublishedBrief[] {
  return briefs.filter(({ snapshot }) => snapshot.pages[pillar].changed);
}
