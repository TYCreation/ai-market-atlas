import { readFile } from "node:fs/promises";
import { assertMarketSnapshot } from "../schema.ts";
import type { SourceAdapter } from "./types.ts";
import { AdapterError } from "./types.ts";

type CandidateOutcome = { outcome?: unknown };

export function jsonCandidateAdapter(path: string): SourceAdapter {
  return {
    id: "json-candidate",
    async collect() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error: unknown) {
        if (isMissingFile(error)) throw new AdapterError("NO_DATA", `Candidate is unavailable: ${path}`);
        throw new AdapterError("UNAVAILABLE", `Could not read candidate: ${path}`);
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        throw new AdapterError("FORMAT_CHANGED", "Candidate JSON is malformed");
      }
      if (isRateLimitedOutcome(candidate)) throw new AdapterError("RATE_LIMITED", "Candidate collection was rate limited");
      try {
        assertMarketSnapshot(candidate);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Candidate does not match the market snapshot contract";
        throw new AdapterError("FORMAT_CHANGED", message);
      }
      return candidate;
    },
  };
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRateLimitedOutcome(value: unknown): value is CandidateOutcome {
  return typeof value === "object" && value !== null && "outcome" in value && value.outcome === "rate-limited";
}
