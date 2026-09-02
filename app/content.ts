import type { createMarketViewModel, LocalizedPageReport, MetricView } from "../market-data/view-model";
import { KPI_CATALOG } from "../market-data/catalog.ts";
import type { Locale, MetricStatus, PageSlug } from "../market-data/types";

type MarketViewModel = ReturnType<typeof createMarketViewModel>;

// Historical editions are reconstructed from the retained snapshot and this
// code-owned presentation map. They must not borrow mutable live-dashboard
// labels (or expose storage-oriented metric IDs) from the current config.
const historicalKpiLabels: Record<string, Record<Locale, string>> = {
  "pulse.infrastructure_spend": { en: "AI infrastructure investment", zh: "AI 基礎設施投資" },
  "pulse.accelerator_market": { en: "Accelerator market", zh: "加速器市場" },
  "pulse.power_queue": { en: "Power queue", zh: "電力排隊容量" },
  "pulse.enterprise_agents": { en: "Enterprise agents", zh: "企業代理" },
  "stocks.basket_30d": { en: "AI stock basket", zh: "AI 股票籃子" },
  "stocks.positive_breadth": { en: "Positive breadth", zh: "正向市場廣度" },
  "stocks.median_forward_pe": { en: "Median forward P/E", zh: "預估本益比中位數" },
  "stocks.catalyst_count": { en: "Recent catalysts", zh: "近期催化劑" },
  "compute.accelerator_pool": { en: "Accelerator revenue pool", zh: "加速器營收池" },
  "compute.hbm_demand": { en: "HBM bit demand", zh: "HBM 位元需求" },
  "compute.packaging_lead_weeks": { en: "Packaging lead time", zh: "封裝交期" },
  "compute.inference_cost_change": { en: "Inference unit cost", zh: "推論單位成本" },
  "energy.announced_power_gw": { en: "Announced AI-ready power", zh: "已公佈 AI 可用電力" },
  "energy.committed_power_gw": { en: "Firmly committed", zh: "已確定承諾" },
  "energy.interconnection_years": { en: "Interconnection wait", zh: "併網等待時間" },
  "energy.liquid_cooling_share": { en: "Liquid-cooled share", zh: "液冷設計占比" },
  "models.production_agents": { en: "Production agent programs", zh: "正式環境代理計畫" },
  "models.software_spend_growth": { en: "AI software spend", zh: "AI 軟體支出" },
  "models.managed_tokens": { en: "Managed tokens", zh: "受管理 Token" },
  "models.api_deployment_share": { en: "API-led deployments", zh: "API 主導部署" },
  "sic.market_2030_usd_b": { en: "SiC market size", zh: "SiC 市場規模" },
  "sic.wafer_frontier_mm": { en: "12-inch wafer progress", zh: "12 吋晶圓進展" },
  "sic.packaging_watts": { en: "AI package thermal load", zh: "AI 封裝熱負載" },
  "sic.ev_penetration": { en: "EV SiC penetration", zh: "電動車 SiC 滲透率" },
};

function historicalKpiLabel(metricId: string, locale: Locale): string {
  const label = historicalKpiLabels[metricId]?.[locale];
  if (!label) throw new Error(`No historical KPI label for ${metricId}`);
  return label;
}

function historicalComparisonLabel(metricId: string, locale: Locale): string {
  return historicalKpiLabels[metricId]?.[locale] ?? metricId
    .replace(/^[^.]+\./, "")
    .replace(/[._]+/g, " ");
}

export type DeepDiveConfig = {
  forecast: Array<{
    year: string;
    value: number;
  }>;
  news: Array<{
    date: string;
    title: string;
    source: string;
    summary: string;
    tags: string[];
  }>;
  roadmap: Array<{
    route: string;
    market: string;
    state: string;
    opportunity: string;
  }>;
  properties: Array<{
    property: string;
    sic: string;
    silicon: string;
    advantage: string;
  }>;
  players: Array<{
    company: string;
    position: string;
    development: string;
    signal: string;
  }>;
  bull: Array<{
    title: string;
    body: string;
  }>;
  bear: Array<{
    title: string;
    body: string;
  }>;
};

export type EquityDeepDiveConfig = {
  updated: string;
  sectors: Array<{
    key: "compute" | "energy" | "sic" | "software";
    name: string;
    week: string;
    month: string;
    breadth: number;
    signal: string;
  }>;
  equities: Array<{
    ticker: string;
    company: string;
    sector: "compute" | "energy" | "sic" | "software";
    strength: number;
    forwardPe: string;
    revenueGrowth: string;
    catalyst: string;
    risk: string;
    stance: string;
  }>;
  catalysts: Array<{
    date: string;
    event: string;
    companies: string;
    impact: string;
  }>;
  baskets: Array<{
    name: string;
    focus: string;
    performance: string;
    risk: string;
    tickers: string[];
  }>;
  risks: Array<{
    title: string;
    level: "high" | "medium" | "low";
    metric: string;
    body: string;
  }>;
};

export type DashboardConfig = {
  slug: PageSlug;
  eyebrow: string;
  title: string;
  summary: string;
  signal: string;
  orbitValue: string;
  orbitLabel: string;
  kpis: Array<{
    label: string;
    value: string;
    foot: string;
    delta: string;
    metricId?: string;
    status?: MetricStatus;
    provenance?: MetricView;
  }>;
  thesis: {
    title: string;
    body: string;
    tags: string[];
  };
  chart: {
    label: string;
    values: number[];
    caption: Record<string, string>;
  };
  clusters: Array<{
    name: string;
    score: number;
    state: string;
    note: string;
    critical?: boolean;
  }>;
  table: {
    title: string;
    columns: string[];
    rows: string[][];
  };
  watchlist: Array<{
    priority: string;
    title: string;
    body: string;
    owner: string;
    deadline?: string | null;
    legacy?: boolean;
    consequence?: string;
    comparison?: string;
  }>;
  deepDive?: DeepDiveConfig;
  equityDive?: EquityDeepDiveConfig;
  report?: LocalizedPageReport;
};

export function hydrateDashboard(
  config: DashboardConfig,
  locale: Locale,
  viewModel: MarketViewModel,
  options: { historical?: boolean } = {},
): DashboardConfig {
  const report = viewModel.getPageReport(config.slug, locale);
  const edition = viewModel.getEditionMeta(locale);
  const historical = options.historical === true;
  const equityDive = config.equityDive
    ? {
        ...config.equityDive,
        updated: edition.dataCutoff,
      }
    : undefined;

  // A permanent brief must not serialize live dashboard configuration into
  // its RSC payload. Keep only its route identity and reconstruct every
  // rendered datum from the immutable snapshot/report instead.
  const snapshotOnlyConfig: DashboardConfig = {
    slug: config.slug,
    eyebrow: "",
    title: "",
    summary: "",
    signal: "",
    orbitValue: "",
    orbitLabel: "",
    kpis: [],
    thesis: { title: "", body: "", tags: [] },
    chart: { label: "", values: [], caption: { "30D": "", Q3: "", "2027": "" } },
    clusters: [],
    table: { title: "", columns: [], rows: [] },
    watchlist: [],
  };

  return {
    ...(historical ? snapshotOnlyConfig : config),
    eyebrow: report.eyebrow,
    title: report.title,
    summary: report.summary,
    signal: report.signal,
    thesis: report.thesis,
    kpis: historical
      ? KPI_CATALOG.filter(([page]) => page === config.slug).map(([, , metricId]) => {
          const metric = viewModel.getMetric(metricId, locale);
          if (!metric) throw new Error(`Historical KPI is unavailable: ${metricId}`);
          return {
            label: historicalKpiLabel(metric.metricId, locale),
            value: metric.value,
            foot: metric.asOf,
            delta: "",
            status: viewModel.getMetricStatus(metric.metricId),
            provenance: metric,
          };
        })
      : config.kpis.map((kpi, index) => {
          const metric = viewModel.getKpi(config.slug, index, locale);
          return {
            ...kpi,
            metricId: metric.metricId,
            value: metric.value,
            status: viewModel.getMetricStatus(metric.metricId),
            provenance: metric,
          };
        }),
    watchlist: Array.from({ length: Math.max(report.risks.length, report.nextObservations.length) }, (_, index) => {
      const risk = report.risks[index];
      const observation = report.nextObservations[index];
      const fallback = historical ? undefined : (config.watchlist[index] ?? config.watchlist[0]);
      const comparison = risk?.comparison ?? observation?.comparison;
      return {
        priority: historical ? `${index + 1}` : (fallback?.priority ?? `${index + 1}`),
        title: observation?.what ?? fallback?.title ?? risk?.condition ?? report.title,
        body: risk?.condition ?? observation?.consequence ?? fallback?.body ?? "",
        owner: observation?.threshold ?? fallback?.owner ?? "",
        deadline: observation?.by,
        legacy: observation?.legacy,
        consequence: observation?.consequence,
        comparison: comparison
          ? `${historical ? historicalComparisonLabel(comparison.metricId, locale) : comparison.metricId} ${comparison.operator} ${comparison.value}${comparison.unit}${comparison.currency ? ` ${comparison.currency}` : ""}`
          : undefined,
      };
    }),
    report,
    ...(!historical && config.deepDive ? { deepDive: config.deepDive } : {}),
    ...(!historical && equityDive ? { equityDive } : {}),
  };
}

export const marketPulse: DashboardConfig = {
  slug: "/",
  eyebrow: "AI economy · executive overview",
  title: "Markets move. Signals remain.",
  summary:
    "A weekly operating view of the AI economy—connecting compute supply, power availability, model economics, and enterprise adoption in one decision-ready brief.",
  signal: "Constraint rotation",
  orbitValue: "74",
  orbitLabel: "market heat",
  kpis: [
    {
      label: "AI infrastructure pipeline",
      value: "$2.8T",
      foot: "2026–30 modeled spend",
      delta: "↑ 18% vs Q1",
    },
    {
      label: "Accelerator market",
      value: "$242B",
      foot: "annualized category run-rate",
      delta: "↑ 31% YoY",
    },
    {
      label: "Power queue",
      value: "36.2GW",
      foot: "announced AI-ready capacity",
      delta: "12.8GW committed",
    },
    {
      label: "Enterprise agents",
      value: "220+",
      foot: "production programs tracked",
      delta: "↑ 44 this quarter",
    },
  ],
  thesis: {
    title: "The constraint stack is rotating from silicon to electrons.",
    body:
      "Accelerator availability is improving unevenly, but grid interconnection, generation contracts, and cooling retrofits now determine how quickly announced AI capacity becomes revenue. At the software layer, falling token prices widen adoption while shifting differentiation toward workflow ownership, proprietary context, and measurable task completion.",
    tags: ["Compute supply", "Power access", "Agent economics"],
  },
  chart: {
    label: "Composite market intensity",
    values: [26, 31, 29, 38, 45, 42, 54, 61, 57, 69, 72, 84],
    caption: {
      "30D":
        "Momentum accelerated as infrastructure commitments outpaced software repricing.",
      Q3: "The base case keeps power and networking as the highest-conviction constraints.",
      "2027":
        "Long-cycle capacity enters service while agent economics become the primary selection pressure.",
    },
  },
  clusters: [
    {
      name: "Compute",
      score: 92,
      state: "Supply tight",
      note: "HBM and advanced packaging remain the gating layers.",
    },
    {
      name: "Power",
      score: 88,
      state: "Critical",
      note: "Interconnection replaces silicon as the longest lead item.",
      critical: true,
    },
    {
      name: "Models",
      score: 64,
      state: "Easing",
      note: "API prices compress while premium reasoning holds.",
    },
    {
      name: "Agents",
      score: 71,
      state: "Building",
      note: "Workflow ownership is emerging as the new moat.",
    },
  ],
  table: {
    title: "Capital rotation board",
    columns: ["Segment", "Current signal", "30D move", "Conviction", "Next catalyst"],
    rows: [
      ["Compute systems", "Supply remains selective", "+5.8%", "High", "Q3 supplier calls"],
      ["Power & cooling", "Demand outruns queue", "+8.1%", "High", "Utility awards"],
      ["Foundation models", "Price / performance reset", "−2.4%", "Medium", "New reasoning tier"],
      ["Enterprise agents", "Pilot-to-production", "+6.3%", "High", "Budget reallocation"],
      ["AI applications", "Vertical separation", "+1.9%", "Medium", "Renewal cohort data"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "Power availability",
      body:
        "Track signed megawatts, not announced campuses. The spread between the two is becoming the best reality check on growth.",
      owner: "Next read · utility queue",
    },
    {
      priority: "02 · High",
      title: "Model commoditization",
      body:
        "Watch whether price compression expands total workloads fast enough to offset falling revenue per token.",
      owner: "Next read · API pricing",
    },
    {
      priority: "03 · High",
      title: "Agent unit economics",
      body:
        "Completion rate, human review burden, and gross margin matter more than seats or pilots.",
      owner: "Next read · production cohort",
    },
  ],
};

export const compute: DashboardConfig = {
  slug: "/compute",
  eyebrow: "Infrastructure layer · compute & chips",
  title: "Compute is abundant—until it isn’t.",
  summary:
    "A supply-chain view of accelerators, memory, packaging, and networking, built to separate durable capacity from headline announcements.",
  signal: "Selective tightness",
  orbitValue: "82",
  orbitLabel: "supply pressure",
  kpis: [
    {
      label: "Accelerator revenue pool",
      value: "$242B",
      foot: "modeled 2026 run-rate",
      delta: "↑ 31% YoY",
    },
    {
      label: "HBM bit demand",
      value: "+94%",
      foot: "modeled annual growth",
      delta: "Tight through H1",
    },
    {
      label: "Packaging lead time",
      value: "28wk",
      foot: "high-end interposer systems",
      delta: "↓ 6 weeks",
    },
    {
      label: "Inference unit cost",
      value: "−58%",
      foot: "indexed twelve-month change",
      delta: "Performance-adjusted",
    },
  ],
  thesis: {
    title: "The shortage is fragmenting, not disappearing.",
    body:
      "General accelerator access is improving, but the premium stack remains constrained by HBM yield, advanced packaging, and high-speed networking. The strategic question is no longer simply who can buy GPUs—it is who can assemble a balanced system, secure power, and keep utilization high enough to defend returns.",
    tags: ["HBM", "Advanced packaging", "Networking"],
  },
  chart: {
    label: "Premium compute availability",
    values: [24, 29, 37, 34, 43, 47, 51, 58, 62, 69, 73, 78],
    caption: {
      "30D":
        "Availability improved at the system level, while premium memory configurations stayed tight.",
      Q3: "Packaging relief is expected before memory supply fully normalizes.",
      "2027":
        "Custom silicon gains share, but leading-edge GPU platforms retain the broadest software pull.",
    },
  },
  clusters: [
    {
      name: "Accelerators",
      score: 84,
      state: "Improving",
      note: "Allocation pressure eases outside the newest systems.",
    },
    {
      name: "HBM",
      score: 94,
      state: "Critical",
      note: "Qualification and yield keep premium memory scarce.",
      critical: true,
    },
    {
      name: "Packaging",
      score: 86,
      state: "Tight",
      note: "Capacity expands, but complexity rises in parallel.",
    },
    {
      name: "Networking",
      score: 79,
      state: "Selective",
      note: "Scale-up fabrics become a system-level differentiator.",
    },
  ],
  table: {
    title: "Compute value-chain tracker",
    columns: ["Layer", "Market position", "Signal", "Exposure", "Watch next"],
    rows: [
      ["NVIDIA", "Platform leader", "Demand durable", "Accelerators / networking", "Next architecture ramp"],
      ["AMD", "Scaled challenger", "Share building", "Accelerators / CPUs", "Rack-level adoption"],
      ["Broadcom", "Custom silicon enabler", "Pipeline strong", "ASIC / networking", "Customer concentration"],
      ["TSMC", "Foundry bottleneck", "Capacity expanding", "Leading edge / packaging", "CoWoS output"],
      ["SK hynix", "HBM leader", "Tight allocation", "Premium memory", "Yield and mix"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "HBM qualification",
      body:
        "Memory supply matters only after platform qualification. Track approved capacity rather than aggregate wafer starts.",
      owner: "Next read · supplier mix",
    },
    {
      priority: "02 · High",
      title: "Rack utilization",
      body:
        "The next profit pool belongs to operators that can keep expensive clusters fed, scheduled, and networked.",
      owner: "Next read · workload density",
    },
    {
      priority: "03 · Medium",
      title: "Custom silicon",
      body:
        "ASIC momentum is real, but software portability and deployment scale decide where share actually shifts.",
      owner: "Next read · volume ramps",
    },
  ],
};

export const energy: DashboardConfig = {
  slug: "/energy",
  eyebrow: "Physical layer · data centers & energy",
  title: "The AI race has entered the grid.",
  summary:
    "A project-level view of power commitments, interconnection delays, cooling transitions, and the infrastructure required to turn models into capacity.",
  signal: "Power constrained",
  orbitValue: "88",
  orbitLabel: "queue pressure",
  kpis: [
    {
      label: "Announced AI-ready power",
      value: "36.2GW",
      foot: "tracked global pipeline",
      delta: "↑ 4.1GW QoQ",
    },
    {
      label: "Firmly committed",
      value: "12.8GW",
      foot: "contracted or in build",
      delta: "35% of pipeline",
    },
    {
      label: "Interconnection wait",
      value: "4.6yr",
      foot: "modeled key-market median",
      delta: "Still rising",
    },
    {
      label: "Liquid-cooled share",
      value: "42%",
      foot: "new AI hall designs",
      delta: "↑ 13 pts YoY",
    },
  ],
  thesis: {
    title: "Signed megawatts are the new compute inventory.",
    body:
      "Data-center strategy is becoming an energy procurement discipline. Markets with available generation, faster permitting, and mature cooling supply chains can convert demand into revenue years earlier. The premium is shifting toward firm power, flexible load design, and campuses that can support higher rack density without delaying commissioning.",
    tags: ["Grid access", "Firm generation", "Liquid cooling"],
  },
  chart: {
    label: "Committed capacity index",
    values: [18, 22, 27, 25, 31, 39, 43, 49, 58, 63, 69, 76],
    caption: {
      "30D":
        "Committed power grew more slowly than announced capacity, widening the credibility gap.",
      Q3: "Utility awards and behind-the-meter generation are the most important conversion signals.",
      "2027":
        "Power-dense regions gain share as campuses redesign around flexible generation and cooling.",
    },
  },
  clusters: [
    {
      name: "Grid",
      score: 96,
      state: "Critical",
      note: "Interconnection and transmission are the longest lead items.",
      critical: true,
    },
    {
      name: "Generation",
      score: 83,
      state: "Contracting",
      note: "Firm power premiums rise across constrained regions.",
    },
    {
      name: "Cooling",
      score: 76,
      state: "Scaling",
      note: "Direct-to-chip designs move into standard specifications.",
    },
    {
      name: "Power silicon",
      score: 69,
      state: "Building",
      note: "Higher-voltage architectures pull new component demand.",
    },
  ],
  table: {
    title: "Regional capacity board",
    columns: ["Market", "Current position", "Power signal", "Build friction", "Next catalyst"],
    rows: [
      ["Northern Virginia", "Largest installed base", "Severely constrained", "Transmission / permits", "New utility zones"],
      ["Texas", "Fastest scaling US market", "Mixed by node", "Generation volatility", "Firming contracts"],
      ["Nordics", "Low-carbon specialist", "Relatively favorable", "Latency / market depth", "New subsea capacity"],
      ["Malaysia", "Regional growth hub", "Tightening", "Grid and water", "Capacity allocation"],
      ["Middle East", "Sovereign-scale entrant", "Power advantaged", "Ecosystem maturity", "Campus commissioning"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "Firm vs. announced",
      body:
        "Treat projects as real only after land, power, equipment, and customer commitments converge.",
      owner: "Next read · project conversion",
    },
    {
      priority: "02 · High",
      title: "Cooling density",
      body:
        "Rack density is rising faster than retrofit readiness. Watch coolant distribution and heat rejection capacity.",
      owner: "Next read · design wins",
    },
    {
      priority: "03 · High",
      title: "Generation mix",
      body:
        "Gas, nuclear, storage, and demand response are converging into a new portfolio for always-on compute.",
      owner: "Next read · PPA quality",
    },
  ],
};

export const models: DashboardConfig = {
  slug: "/models",
  eyebrow: "Application layer · models & agents",
  title: "Models are cheaper. Outcomes are not.",
  summary:
    "A commercial view of model price-performance, enterprise agent deployment, workflow ownership, and the unit economics separating pilots from production.",
  signal: "Adoption broadening",
  orbitValue: "71",
  orbitLabel: "deployment heat",
  kpis: [
    {
      label: "Production agent programs",
      value: "220+",
      foot: "enterprise programs tracked",
      delta: "↑ 44 this quarter",
    },
    {
      label: "AI software spend",
      value: "+37%",
      foot: "modeled annual growth",
      delta: "Budgets consolidating",
    },
    {
      label: "Managed tokens",
      value: "1.8T",
      foot: "monthly tracked workload",
      delta: "↑ 2.6× YoY",
    },
    {
      label: "API-led deployments",
      value: "68%",
      foot: "production architecture share",
      delta: "Hybrid rising",
    },
  ],
  thesis: {
    title: "The winning agent is a redesigned workflow, not a chat window.",
    body:
      "Model capability is converging faster than enterprise process change. Durable value appears where agents own a measurable task, operate against trusted context, escalate cleanly, and improve through feedback. As inference prices fall, distribution and workflow depth—not raw model access—capture a larger share of the economics.",
    tags: ["Workflow ownership", "Trusted context", "Task completion"],
  },
  chart: {
    label: "Production deployment index",
    values: [12, 15, 19, 24, 28, 34, 41, 49, 55, 62, 72, 81],
    caption: {
      "30D":
        "Production programs expanded fastest in coding, customer operations, and internal research.",
      Q3: "Consolidation favors platforms with governance, evaluation, and workflow integration.",
      "2027":
        "Agent pricing shifts from seats and tokens toward completed tasks and managed outcomes.",
    },
  },
  clusters: [
    {
      name: "Frontier labs",
      score: 73,
      state: "Advancing",
      note: "Premium reasoning retains pricing power at the frontier.",
    },
    {
      name: "API layer",
      score: 58,
      state: "Compressing",
      note: "Price-performance gains widen the addressable workload.",
    },
    {
      name: "Agent platforms",
      score: 78,
      state: "Building",
      note: "Governance and evaluation become enterprise buying criteria.",
    },
    {
      name: "Workflow incumbents",
      score: 82,
      state: "Defending",
      note: "Embedded distribution offsets slower product cycles.",
      critical: true,
    },
  ],
  table: {
    title: "Enterprise deployment board",
    columns: ["Workflow", "Adoption stage", "Value signal", "Primary risk", "Next proof point"],
    rows: [
      ["Software engineering", "Scaled production", "Cycle time", "Review burden", "Multi-repo autonomy"],
      ["Customer operations", "Early production", "Resolution rate", "Escalation quality", "End-to-end containment"],
      ["Research & analysis", "Broad pilot", "Analyst throughput", "Source reliability", "Auditable workflows"],
      ["Finance operations", "Controlled pilot", "Close efficiency", "Governance", "Exception handling"],
      ["Sales execution", "Broad pilot", "Coverage expansion", "Signal quality", "Pipeline conversion"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "Task completion",
      body:
        "Measure completed work after review, not generated content. The gap exposes hidden operating cost.",
      owner: "Next read · outcome cohort",
    },
    {
      priority: "02 · High",
      title: "Context advantage",
      body:
        "The most defensible agents learn from proprietary workflows without compromising governance.",
      owner: "Next read · data flywheel",
    },
    {
      priority: "03 · Medium",
      title: "Pricing transition",
      body:
        "Outcome pricing expands upside but transfers model, review, and exception risk back to the vendor.",
      owner: "Next read · gross margin",
    },
  ],
};

export const sic: DashboardConfig = {
  slug: "/sic",
  eyebrow: "Materials layer · SiC & power electronics",
  title: "AI’s power stack runs through SiC.",
  summary:
    "A weekly view of silicon carbide across AI chip packaging, 800V data-center power, EV inverters, wafer scaling, and the supply-chain contest shaping the next infrastructure cycle.",
  signal: "AI packaging crossover",
  orbitValue: "86",
  orbitLabel: "strategic heat",
  kpis: [
    {
      label: "SiC market size",
      value: "$23B",
      foot: "2030 estimate",
      delta: "~30% CAGR",
    },
    {
      label: "12-inch wafer progress",
      value: "300mm",
      foot: "Wolfspeed in production",
      delta: "China 14-inch demo",
    },
    {
      label: "AI packaging thermal load",
      value: "1000W+",
      foot: "per-chip power demand",
      delta: "B300 / Ruby class",
    },
    {
      label: "EV SiC penetration",
      value: "35%+",
      foot: "modeled 2026 adoption",
      delta: "Traction inverters",
    },
  ],
  thesis: {
    title: "SiC is moving from the EV red ocean into AI infrastructure.",
    body:
      "Twelve-inch SiC is no longer only an EV cost story. Its thermal conductivity, high-voltage performance, and compatibility with 800V data-center architectures create a second demand curve in AI packaging and power delivery. The opportunity depends on wafer quality, customer qualification, and how quickly advanced packaging moves from evaluation to production.",
    tags: ["300mm wafers", "AI packaging", "800V power"],
  },
  chart: {
    label: "SiC market scale-up index",
    values: [9, 15, 25, 37, 50, 65, 80, 100],
    caption: {
      "30D":
        "Patent activity, 200mm expansion, and AI power-design wins kept the sector’s strategic premium elevated.",
      Q3: "Qualification milestones and high-end capacity additions remain the clearest conversion signals.",
      "2027":
        "AI data-center power and packaging become a material second growth engine alongside EV adoption.",
    },
  },
  clusters: [
    {
      name: "AI packaging",
      score: 91,
      state: "Blue ocean",
      note: "Thermal density and larger interposers create a new SiC qualification path.",
      critical: true,
    },
    {
      name: "Wafer scaling",
      score: 87,
      state: "Advancing",
      note: "200mm moves into volume while 300mm establishes the strategic frontier.",
    },
    {
      name: "800V power",
      score: 84,
      state: "Building",
      note: "Data-center architectures pull SiC into higher-voltage conversion stages.",
    },
    {
      name: "China capacity",
      score: 78,
      state: "Price pressure",
      note: "Subsidized expansion lowers substrate prices and raises export-control risk.",
    },
  ],
  table: {
    title: "SiC value-chain tracker",
    columns: ["Company", "Position", "Latest signal", "AI exposure", "Watch next"],
    rows: [
      ["Wolfspeed", "300mm SiC leader", "Three AI packaging qualifications", "Interposer / high voltage", "Customer conversion"],
      ["Infineon", "Automotive SiC leader", "200mm capacity +40% target", "AI power / charging", "Villach output"],
      ["onsemi", "Scaled automotive supplier", "Physical AI portfolio shift", "Power / edge systems", "Synaptics integration"],
      ["STMicro", "Wafer + device platform", "800V architecture collaboration", "Data-center power", "200mm production"],
      ["Coherent", "Substrate / epitaxy", "200mm and 10kV platforms", "Optics + power", "Qualification mix"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "300mm qualification",
      body:
        "Track named customer qualification and production orders, not wafer demonstrations. That is the bridge from technical proof to revenue.",
      owner: "Next read · packaging customers",
    },
    {
      priority: "02 · Highest",
      title: "Patent litigation",
      body:
        "The Wolfspeed–Navitas dispute could reshape design freedom and IP value across SiC and GaN power devices.",
      owner: "Next read · injunction status",
    },
    {
      priority: "03 · High",
      title: "800V deployment",
      body:
        "Watch reference designs become signed data-center orders. Power architecture adoption is the fastest path to material AI revenue.",
      owner: "Next read · design wins",
    },
  ],
  deepDive: {
    forecast: [
      { year: "2023", value: 2.1 },
      { year: "2024", value: 3.5 },
      { year: "2025", value: 5.8 },
      { year: "2026E", value: 8.5 },
      { year: "2027E", value: 11.5 },
      { year: "2028E", value: 15 },
      { year: "2029E", value: 18.5 },
      { year: "2030E", value: 23 },
    ],
    news: [
      {
        date: "2026-07-23",
        title: "Navitas and Magnachip form a high-voltage SiC partnership",
        source: "FinancialContent",
        summary: "The partnership targets faster adoption across high- and ultra-high-voltage power systems.",
        tags: ["Partnership", "Power"],
      },
      {
        date: "2026-07-16",
        title: "Wolfspeed patent litigation keeps pressure on Navitas",
        source: "Semiconductor Digest",
        summary: "The requested US sales injunction could redraw the IP landscape for SiC and GaN devices.",
        tags: ["Patent", "Risk"],
      },
      {
        date: "2026-07-15",
        title: "Infineon advances its 200mm SiC expansion",
        source: "Compound Semiconductor",
        summary: "Villach capacity is running ahead of plan with a Q3 expansion target of roughly 40%.",
        tags: ["Capacity", "AI power"],
      },
      {
        date: "2026-07-14",
        title: "Bosch secures support for a California SiC facility",
        source: "electrive.com",
        summary: "Up to $225 million supports localized SiC chip manufacturing for automotive and power markets.",
        tags: ["Industry", "US"],
      },
      {
        date: "2026-07-13",
        title: "L&T and Azuremoto target AI data-center SiC",
        source: "ET CIO",
        summary: "India joins the SiC supply race with power devices designed for AI data-center infrastructure.",
        tags: ["AI DC", "India"],
      },
      {
        date: "2026-07-11",
        title: "Wolfspeed launches a lower-resistance SiC MOSFET generation",
        source: "Wolfspeed",
        summary: "The new platform targets EV traction inverters and high-density AI data-center power.",
        tags: ["Product", "EV"],
      },
    ],
    roadmap: [
      { route: "150mm SiC → EV power", market: "Red-ocean competition", state: "Mature", opportunity: "Legacy capacity exits while established suppliers defend share." },
      { route: "200mm SiC → EV / industrial", market: "Transition", state: "Scaling", opportunity: "Lower cost per die with qualification and yield still creating barriers." },
      { route: "300mm SiC → AI packaging / DC", market: "Blue-ocean opportunity", state: "Qualification", opportunity: "CoWoS compatibility, 800V power, and thermal density create a new market." },
    ],
    properties: [
      { property: "Thermal conductivity", sic: "490 W/mK", silicon: "150 W/mK", advantage: "3.3×" },
      { property: "Breakdown field", sic: "3.3 MV/cm", silicon: "0.3 MV/cm", advantage: "10×" },
      { property: "Bandgap", sic: "3.26 eV", silicon: "1.12 eV", advantage: "2.9×" },
      { property: "Maximum temperature", sic: "600°C", silicon: "150°C", advantage: "4×" },
      { property: "Voltage class", sic: "800V–10kV+", silicon: "~600V", advantage: "New domain" },
    ],
    players: [
      { company: "Wolfspeed", position: "300mm leader", development: "AI packaging qualifications, Gen-5 MOSFET, aerospace partnership", signal: "Rebounding" },
      { company: "Infineon", position: "Automotive leader", development: "200mm expansion, megawatt charging, 205°C inverter module", signal: "Stable" },
      { company: "onsemi", position: "Automotive #2", development: "Physical AI roadmap and wider OEM adoption", signal: "Transforming" },
      { company: "STMicro", position: "Wafer + device", development: "Data-center target raised; NVIDIA 800V collaboration", signal: "Bullish" },
      { company: "Coherent", position: "Substrate / epitaxy", development: "200mm shipments and qualified 10kV thick-epitaxy platform", signal: "Expanding" },
      { company: "ROHM", position: "Power modules", development: "Top-side cooled 1200V / 600A modules for AI DC", signal: "New product" },
    ],
    bull: [
      { title: "AI packaging becomes structural demand", body: "300mm qualification and thermal density create a market beyond automotive power." },
      { title: "The 800V data-center upgrade cycle", body: "Reference architectures pull SiC into high-efficiency conversion and protection." },
      { title: "EV penetration keeps broadening", body: "Mainstream vehicle programs add a durable base beneath the emerging AI opportunity." },
      { title: "Policy supports local supply", body: "US manufacturing incentives and defense programs raise the strategic value of domestic SiC." },
    ],
    bear: [
      { title: "Valuation and financing risk", body: "High volatility and capital intensity can overwhelm otherwise strong technology signals." },
      { title: "China capacity and price pressure", body: "Subsidized substrate expansion threatens margins across lower-end segments." },
      { title: "AI packaging timing remains uncertain", body: "Interposer commercialization may not become material until 2028–2030." },
      { title: "Export controls cut both ways", body: "Restrictions may disrupt Western equipment supply while accelerating domestic substitution in China." },
    ],
  },
};

export const stocks: DashboardConfig = {
  slug: "/stocks",
  eyebrow: "Capital layer · AI public equities",
  title: "AI stories meet market prices.",
  summary:
    "A weekly capital-markets view connecting AI infrastructure themes to public equities—tracking leadership, relative strength, valuation, earnings catalysts, and the risks hidden beneath headline momentum.",
  signal: "Leadership broadening",
  orbitValue: "79",
  orbitLabel: "market appetite",
  kpis: [
    {
      label: "AI equity basket",
      value: "+6.4%",
      foot: "modeled 30-day return",
      delta: "vs. S&P 500 +3.1%",
    },
    {
      label: "Positive breadth",
      value: "68%",
      foot: "tracked names above 50D MA",
      delta: "↑ 11 pts this month",
    },
    {
      label: "Median forward P/E",
      value: "31.8×",
      foot: "12-stock AI monitor",
      delta: "premium remains wide",
    },
    {
      label: "Near-term catalysts",
      value: "12",
      foot: "next four weeks",
      delta: "earnings + product events",
    },
  ],
  thesis: {
    title: "The next leg needs earnings breadth, not another headline.",
    body:
      "AI equity leadership is widening from accelerator vendors into networking, power, cooling, and workflow software. The durable signal is no longer capex announcements alone; it is upward earnings revisions across the stack. Relative strength remains constructive, but elevated valuation makes revenue conversion and margin quality the market’s next filter.",
    tags: ["Earnings breadth", "Relative strength", "Valuation discipline"],
  },
  chart: {
    label: "AI equity leadership index",
    values: [38, 42, 39, 48, 52, 57, 55, 64, 69, 73, 71, 79],
    caption: {
      "30D":
        "Leadership broadened as power, networking, and software names joined the accelerator trade.",
      Q3: "Earnings revisions and booked infrastructure revenue are the highest-conviction confirmation signals.",
      "2027":
        "The market rewards companies that turn AI capex into repeatable free cash flow rather than narrative exposure.",
    },
  },
  clusters: [
    {
      name: "Compute",
      score: 91,
      state: "Leadership",
      note: "Accelerators, HBM, foundry, and networking retain the strongest relative strength.",
      critical: true,
    },
    {
      name: "Energy",
      score: 76,
      state: "Broadening",
      note: "Cooling and power names gain as data-center bottlenecks move downstream.",
    },
    {
      name: "SiC & power",
      score: 58,
      state: "Volatile",
      note: "AI optionality is rising, but automotive exposure keeps earnings dispersion high.",
    },
    {
      name: "Software",
      score: 67,
      state: "Selective",
      note: "Workflow owners outperform undifferentiated AI feature stories.",
    },
  ],
  table: {
    title: "AI theme allocation board",
    columns: ["Theme", "1 week", "1 month", "Breadth", "Market signal"],
    rows: [
      ["Compute leaders", "+3.8%", "+9.7%", "83%", "Momentum intact"],
      ["Memory & foundry", "+2.6%", "+7.1%", "75%", "Estimates rising"],
      ["Power & cooling", "+4.4%", "+11.8%", "72%", "Leadership broadening"],
      ["SiC & devices", "−1.9%", "+2.4%", "42%", "High dispersion"],
      ["AI software", "+1.7%", "+5.9%", "61%", "Quality selective"],
    ],
  },
  watchlist: [
    {
      priority: "01 · Highest",
      title: "Earnings revisions",
      body:
        "Track changes in next-twelve-month estimates. Rising prices without rising earnings create the most fragile form of AI leadership.",
      owner: "Next read · revision breadth",
    },
    {
      priority: "02 · High",
      title: "Market breadth",
      body:
        "A healthy AI cycle spreads beyond one or two mega-caps into memory, networking, power, and application leaders.",
      owner: "Next read · 50-day participation",
    },
    {
      priority: "03 · High",
      title: "Capex conversion",
      body:
        "Booked revenue, utilization, and free cash flow matter more than announced capacity when valuations already price in growth.",
      owner: "Next read · cash conversion",
    },
  ],
  equityDive: {
    updated: "Provided by the promoted market snapshot",
    sectors: [
      { key: "compute", name: "Compute leaders", week: "+3.8%", month: "+9.7%", breadth: 83, signal: "Momentum intact" },
      { key: "energy", name: "Power & cooling", week: "+4.4%", month: "+11.8%", breadth: 72, signal: "Breakout" },
      { key: "sic", name: "SiC & devices", week: "−1.9%", month: "+2.4%", breadth: 42, signal: "High dispersion" },
      { key: "software", name: "AI software", week: "+1.7%", month: "+5.9%", breadth: 61, signal: "Quality selective" },
    ],
    equities: [
      {
        ticker: "NVDA",
        company: "NVIDIA",
        sector: "compute",
        strength: 96,
        forwardPe: "34.8×",
        revenueGrowth: "+48%",
        catalyst: "Rubin platform ramp",
        risk: "Customer concentration",
        stance: "Leader",
      },
      {
        ticker: "AVGO",
        company: "Broadcom",
        sector: "compute",
        strength: 93,
        forwardPe: "32.1×",
        revenueGrowth: "+31%",
        catalyst: "Custom AI silicon wins",
        risk: "Program concentration",
        stance: "Leader",
      },
      {
        ticker: "AMD",
        company: "AMD",
        sector: "compute",
        strength: 86,
        forwardPe: "37.6×",
        revenueGrowth: "+29%",
        catalyst: "Rack-scale deployments",
        risk: "Software execution",
        stance: "Building",
      },
      {
        ticker: "TSM",
        company: "TSMC",
        sector: "compute",
        strength: 84,
        forwardPe: "25.4×",
        revenueGrowth: "+24%",
        catalyst: "Advanced packaging output",
        risk: "Geopolitical exposure",
        stance: "Core",
      },
      {
        ticker: "VRT",
        company: "Vertiv",
        sector: "energy",
        strength: 94,
        forwardPe: "36.2×",
        revenueGrowth: "+27%",
        catalyst: "Liquid-cooling backlog",
        risk: "Valuation compression",
        stance: "Breakout",
      },
      {
        ticker: "ETN",
        company: "Eaton",
        sector: "energy",
        strength: 81,
        forwardPe: "29.7×",
        revenueGrowth: "+14%",
        catalyst: "Data-center power orders",
        risk: "Long-cycle normalization",
        stance: "Core",
      },
      {
        ticker: "CEG",
        company: "Constellation Energy",
        sector: "energy",
        strength: 89,
        forwardPe: "30.5×",
        revenueGrowth: "+18%",
        catalyst: "Nuclear power contracts",
        risk: "Policy and power pricing",
        stance: "Leader",
      },
      {
        ticker: "WOLF",
        company: "Wolfspeed",
        sector: "sic",
        strength: 24,
        forwardPe: "N/M",
        revenueGrowth: "+19%",
        catalyst: "300mm qualifications",
        risk: "Financing and execution",
        stance: "Speculative",
      },
      {
        ticker: "ON",
        company: "onsemi",
        sector: "sic",
        strength: 57,
        forwardPe: "18.9×",
        revenueGrowth: "+8%",
        catalyst: "Physical AI portfolio",
        risk: "Auto-cycle weakness",
        stance: "Watch",
      },
      {
        ticker: "NOW",
        company: "ServiceNow",
        sector: "software",
        strength: 78,
        forwardPe: "46.7×",
        revenueGrowth: "+22%",
        catalyst: "Agentic workflow adoption",
        risk: "Premium valuation",
        stance: "Quality",
      },
      {
        ticker: "PLTR",
        company: "Palantir",
        sector: "software",
        strength: 91,
        forwardPe: "71.5×",
        revenueGrowth: "+36%",
        catalyst: "Enterprise platform expansion",
        risk: "Extreme multiple",
        stance: "Momentum",
      },
      {
        ticker: "CRM",
        company: "Salesforce",
        sector: "software",
        strength: 52,
        forwardPe: "24.6×",
        revenueGrowth: "+10%",
        catalyst: "Agentforce monetization",
        risk: "Seat-growth pressure",
        stance: "Prove it",
      },
    ],
    catalysts: [
      {
        date: "07.31",
        event: "Cloud capex read-through",
        companies: "MSFT · AMZN · GOOGL",
        impact: "Tests whether booked accelerator and data-center demand remains ahead of supply.",
      },
      {
        date: "08.06",
        event: "Power and cooling earnings",
        companies: "VRT · ETN",
        impact: "Backlog quality and lead-time commentary can confirm the broadening infrastructure trade.",
      },
      {
        date: "08.12",
        event: "AI software cohort",
        companies: "PLTR · CRM · NOW",
        impact: "Production deployments and contract expansion separate workflow value from feature adoption.",
      },
      {
        date: "08.19",
        event: "Semiconductor supply update",
        companies: "TSM · AMD · AVGO",
        impact: "Advanced packaging, networking, and custom silicon visibility set the next estimate revision cycle.",
      },
    ],
    baskets: [
      {
        name: "Compute core",
        focus: "Platform leaders across accelerators, custom silicon, foundry, and networking.",
        performance: "+9.7% / 30D",
        risk: "High",
        tickers: ["NVDA", "AVGO", "AMD", "TSM"],
      },
      {
        name: "Power bottleneck",
        focus: "Electrical equipment, cooling, and generation exposed to AI data-center buildouts.",
        performance: "+11.8% / 30D",
        risk: "Medium",
        tickers: ["VRT", "ETN", "CEG"],
      },
      {
        name: "SiC optionality",
        focus: "Wide-bandgap devices with EV demand today and AI power upside tomorrow.",
        performance: "+2.4% / 30D",
        risk: "Very high",
        tickers: ["WOLF", "ON", "STM"],
      },
      {
        name: "Workflow winners",
        focus: "Software vendors that own enterprise context, distribution, and measurable outcomes.",
        performance: "+5.9% / 30D",
        risk: "High",
        tickers: ["NOW", "PLTR", "CRM"],
      },
    ],
    risks: [
      {
        title: "Valuation compression",
        level: "high",
        metric: "31.8× median P/E",
        body: "A modest rate or margin shock can erase months of performance when expectations are already elevated.",
      },
      {
        title: "Earnings concentration",
        level: "high",
        metric: "4 names = 61%",
        body: "A narrow share of the basket still drives most modeled earnings growth and index contribution.",
      },
      {
        title: "Capex digestion",
        level: "medium",
        metric: "$2.8T pipeline",
        body: "Announced infrastructure must become utilized capacity before customer returns come under pressure.",
      },
      {
        title: "Policy and geopolitics",
        level: "medium",
        metric: "3 supply nodes",
        body: "Export controls, tariffs, and geographic concentration can disrupt both demand and manufacturing.",
      },
    ],
  },
};
