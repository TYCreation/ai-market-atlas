export type Locale = "zh" | "en";
export type RunCadence = "wednesday" | "saturday" | "month-end";
export type MetricKind = "published" | "modeled";
export type Confidence = "high" | "medium" | "low";
export type MetricStatus = "verified" | "waiting";
export type SessionState = "closed" | "holiday";
export type PageSlug = "/" | "/stocks" | "/compute" | "/energy" | "/models" | "/sic";
export type ThesisStance = "bullish" | "neutral" | "bearish";
export type BilingualText = Record<Locale, string>;

export type SourceRecord = {
  id: string;
  kind: "official" | "company" | "research" | "pricing" | "market" | "atlas";
  publisher: string;
  title: string;
  url?: string;
  publishedAt: string;
  retrievedAt: string;
  scope: Record<Locale, string>;
};

export type MetricObservation = { sourceId: string; numericValue: number; asOf: string };

export type MetricRecord = {
  id: string;
  page: PageSlug;
  required: boolean;
  kind: MetricKind;
  numericValue: number;
  previousNumericValue?: number;
  display: Record<Locale, string>;
  unit: string;
  currency?: string;
  market?: string;
  marketTimezone?: string;
  primaryListing?: string;
  securityType?: "primary" | "adr" | "not-applicable";
  asOf: string;
  sessionState: SessionState;
  sourceIds: string[];
  observations: MetricObservation[];
  confidence: Confidence;
  status: MetricStatus;
};

export type PageReport = {
  eyebrow: BilingualText;
  title: BilingualText;
  summary: BilingualText;
  signal: BilingualText;
  thesis: { title: BilingualText; body: BilingualText; tags: Record<Locale, string[]> };
  supportingEvidence: Array<{ text: BilingualText; metricIds: string[] }>;
  opposingEvidence: Array<{ text: BilingualText; metricIds: string[] }>;
  catalysts: BilingualText[];
  risks: BilingualText[];
  nextObservations: BilingualText[];
};

export type PageState = {
  changed: boolean;
  changeReasons: Array<
    "first-party-event" | "rounded-value-change" | "gate-worthy-movement" | "conclusion-changing-evidence"
  >;
  verifiedAt: string;
  thesisStance: ThesisStance;
  previousThesisStance: ThesisStance;
  thesisMetricIds: string[];
  report: PageReport;
};

export type MarketSnapshot = {
  schemaVersion: 1;
  runId: string;
  cadence: RunCadence;
  generatedAt: string;
  dataCutoff: string;
  pages: Record<PageSlug, PageState>;
  sources: Record<string, SourceRecord>;
  metrics: Record<string, MetricRecord>;
  keySignalIds: string[];
};
