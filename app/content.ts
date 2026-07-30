export type DashboardConfig = {
  slug: string;
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
  }>;
};

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
