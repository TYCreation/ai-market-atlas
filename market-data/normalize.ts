import { assertMarketSnapshot } from "./schema.ts";
import { assertCompletedSession } from "./session.ts";
import type { MarketSnapshot } from "./types.ts";

const UNIT_CONVERSIONS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "billion-usd": { "billion-usd": 1, "$B": 1, "trillion-usd": 0.001, "$T": 0.001 },
  "$B": { "billion-usd": 1, "$B": 1, "trillion-usd": 0.001, "$T": 0.001 },
  "trillion-usd": { "billion-usd": 1000, "$B": 1000, "trillion-usd": 1, "$T": 1 },
  "$T": { "billion-usd": 1000, "$B": 1000, "trillion-usd": 1, "$T": 1 },
  percent: { percent: 1, "%": 1 },
  "%": { percent: 1, "%": 1 },
  decimal: { decimal: 1, fraction: 1, percent: 100, "%": 100 },
  fraction: { decimal: 1, fraction: 1, percent: 100, "%": 100 },
  gigawatt: { gigawatt: 1, GW: 1, megawatt: 1000, MW: 1000, terawatt: 0.001, TW: 0.001 },
  GW: { gigawatt: 1, GW: 1, megawatt: 1000, MW: 1000, terawatt: 0.001, TW: 0.001 },
  megawatt: { gigawatt: 0.001, GW: 0.001, megawatt: 1, MW: 1, terawatt: 0.000001, TW: 0.000001 },
  MW: { gigawatt: 0.001, GW: 0.001, megawatt: 1, MW: 1, terawatt: 0.000001, TW: 0.000001 },
  terawatt: { gigawatt: 1000, GW: 1000, megawatt: 1_000_000, MW: 1_000_000, terawatt: 1, TW: 1 },
  TW: { gigawatt: 1000, GW: 1000, megawatt: 1_000_000, MW: 1_000_000, terawatt: 1, TW: 1 },
  "trillion-tokens": { "trillion-tokens": 1, "T tokens": 1, "billion-tokens": 1000, "B tokens": 1000 },
  "T tokens": { "trillion-tokens": 1, "T tokens": 1, "billion-tokens": 1000, "B tokens": 1000 },
  "billion-tokens": { "trillion-tokens": 0.001, "T tokens": 0.001, "billion-tokens": 1, "B tokens": 1 },
  "B tokens": { "trillion-tokens": 0.001, "T tokens": 0.001, "billion-tokens": 1, "B tokens": 1 },
};

/** Converts between explicitly-supported report units without guessing a dimension. */
export function normalizeUnit(value: number, from: string, to: string): number {
  const factor = UNIT_CONVERSIONS[from]?.[to];
  if (factor === undefined) {
    throw new Error(`Unsupported unit conversion: ${from} to ${to}`);
  }
  return value * factor;
}

export function normalizeCandidate(
  candidate: MarketSnapshot,
  previous: MarketSnapshot,
  now: Date,
): MarketSnapshot {
  assertMarketSnapshot(candidate);
  const metrics = Object.fromEntries(
    Object.entries(candidate.metrics)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, metric]) => {
        assertCompletedSession(metric, now);
        return [
          id,
          {
            ...metric,
            previousNumericValue: previous.metrics[id]?.numericValue,
            sourceIds: [...metric.sourceIds].sort(),
          },
        ];
      }),
  );
  return {
    ...candidate,
    sources: Object.fromEntries(
      Object.entries(candidate.sources).sort(([a], [b]) => a.localeCompare(b)),
    ),
    metrics,
  };
}
