import type { MarketSnapshot, RunCadence } from "../types.ts";

export type CollectionContext = {
  runId: string;
  cadence: RunCadence;
  runStartedAt: string;
  previous: MarketSnapshot;
};

export interface SourceAdapter {
  id: string;
  collect(context: CollectionContext): Promise<MarketSnapshot>;
}

export class AdapterError extends Error {
  public code: "FORMAT_CHANGED" | "UNAVAILABLE" | "RATE_LIMITED" | "NO_DATA";

  constructor(
    code: "FORMAT_CHANGED" | "UNAVAILABLE" | "RATE_LIMITED" | "NO_DATA",
    message: string,
  ) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
  }
}
