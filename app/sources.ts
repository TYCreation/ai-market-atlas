export type Locale = "zh" | "en";

export type SourceReference = {
  id: string;
  kind: "atlas" | "official" | "company" | "research" | "pricing" | "market";
  publisher: string;
  title: string;
  url?: string;
  published: string;
  scope: Record<Locale, string>;
};

export type SourceBundle = {
  reviewed: string;
  sources: SourceReference[];
  kpiSources: string[][];
};

const atlasModel: SourceReference = {
  id: "atlas-model",
  kind: "atlas",
  publisher: "AI Market Atlas",
  title: "Directional weekly market model",
  published: "July 2026 edition",
  scope: {
    zh: "彙整下列公開資料後建立的方向性模型；模型值不是官方統計、即時行情或經稽核財務資料。",
    en: "A directional model built from the public materials below; model outputs are not official statistics, live prices, or audited financial data.",
  },
};

const stanfordEconomy: SourceReference = {
  id: "stanford-economy",
  kind: "research",
  publisher: "Stanford HAI",
  title: "2026 AI Index Report · Economy",
  url: "https://hai.stanford.edu/ai-index/2026-ai-index-report/economy",
  published: "2026",
  scope: {
    zh: "AI 投資、企業採用、營收與生產力的基準背景。",
    en: "Benchmark context for AI investment, enterprise adoption, revenue, and productivity.",
  },
};

const nvidiaQ1: SourceReference = {
  id: "nvidia-q1-fy27",
  kind: "company",
  publisher: "NVIDIA Investor Relations",
  title: "First Quarter Fiscal 2027 Financial Results",
  url: "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-First-Quarter-Fiscal-2027/default.aspx",
  published: "May 20, 2026",
  scope: {
    zh: "資料中心營收、成長率、平台進度與公司展望。",
    en: "Data-center revenue, growth, platform progress, and company outlook.",
  },
};

const broadcomQ2: SourceReference = {
  id: "broadcom-q2-fy26",
  kind: "company",
  publisher: "Broadcom Investor Relations",
  title: "Second Quarter Fiscal Year 2026 Financial Results",
  url: "https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announces-second-quarter-fiscal-year-2026-financial",
  published: "June 3, 2026",
  scope: {
    zh: "客製 AI 加速器、AI 網路與半導體營收的公司揭露。",
    en: "Company disclosures on custom AI accelerators, AI networking, and semiconductor revenue.",
  },
};

const tsmcQ1: SourceReference = {
  id: "tsmc-q1-2026",
  kind: "company",
  publisher: "TSMC Investor Relations",
  title: "First Quarter 2026 Management Report",
  url: "https://investor.tsmc.com/english/encrypt/files/encrypt_file/qr/phase4_reports/2026-04/9f060092ba29ff3630cfdaefd67774026195e135/1Q26ManagementReport.pdf",
  published: "April 2026",
  scope: {
    zh: "先進製程、資本支出、營收組合與產能展望。",
    en: "Advanced-node, capital-expenditure, revenue-mix, and capacity outlook.",
  },
};

const ieaEnergyAi: SourceReference = {
  id: "iea-energy-ai",
  kind: "official",
  publisher: "International Energy Agency",
  title: "Energy and AI · Executive summary",
  url: "https://www.iea.org/reports/energy-and-ai/executive-summary",
  published: "2025; continuously maintained",
  scope: {
    zh: "全球資料中心用電、2030 年情境、供電結構與專案延誤風險。",
    en: "Global data-center electricity demand, 2030 scenarios, supply mix, and project-delay risk.",
  },
};

const ieaDataCentres: SourceReference = {
  id: "iea-data-centres",
  kind: "official",
  publisher: "International Energy Agency",
  title: "Data Centres & Networks · Latest findings",
  url: "https://www.iea.org/energy-system/digitalisation/data-centres-and-data-transmission-networks",
  published: "Updated June 2026",
  scope: {
    zh: "資料中心用電量、成長速度與最新全球趨勢。",
    en: "Latest global data-center electricity consumption and growth trends.",
  },
};

const doeDataCenters: SourceReference = {
  id: "doe-data-centers",
  kind: "official",
  publisher: "U.S. Department of Energy / LBNL",
  title: "2024 Report on U.S. Data Center Energy Use",
  url: "https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers",
  published: "December 20, 2024",
  scope: {
    zh: "美國資料中心用電歷史、2028 年預測區間與需求成長。",
    en: "U.S. data-center electricity history, 2028 forecast range, and demand growth.",
  },
};

const stanfordTechnical: SourceReference = {
  id: "stanford-technical",
  kind: "research",
  publisher: "Stanford HAI",
  title: "2026 AI Index Report · Technical Performance",
  url: "https://hai.stanford.edu/ai-index/2026-ai-index-report/technical-performance",
  published: "2026",
  scope: {
    zh: "模型能力、基準測試、推理進展與技術競爭背景。",
    en: "Model capability, benchmarks, reasoning progress, and technical competition.",
  },
};

const openAiPricing: SourceReference = {
  id: "openai-pricing",
  kind: "pricing",
  publisher: "OpenAI",
  title: "API pricing",
  url: "https://openai.com/api/pricing/",
  published: "Live provider page",
  scope: {
    zh: "官方 API 定價；價格變動時以供應商頁面為準。",
    en: "Official API list pricing; the provider page governs when prices change.",
  },
};

const geminiPricing: SourceReference = {
  id: "gemini-pricing",
  kind: "pricing",
  publisher: "Google AI for Developers",
  title: "Gemini Developer API pricing",
  url: "https://ai.google.dev/gemini-api/docs/pricing",
  published: "Live provider page",
  scope: {
    zh: "Gemini 模型與工具的官方 API 定價及更新時間。",
    en: "Official Gemini model and tool pricing, including its latest update time.",
  },
};

const wolfspeedAi: SourceReference = {
  id: "wolfspeed-ai",
  kind: "company",
  publisher: "Wolfspeed",
  title: "Artificial Intelligence news and SiC product updates",
  url: "https://www.wolfspeed.com/company/news-events/news/category/artificial-intelligence-news/",
  published: "Live company newsroom",
  scope: {
    zh: "300mm SiC、AI 資料中心功率與先進封裝的公司公告。",
    en: "Company announcements on 300mm SiC, AI data-center power, and advanced packaging.",
  },
};

const onsemiAi: SourceReference = {
  id: "onsemi-ai",
  kind: "company",
  publisher: "onsemi",
  title: "How onsemi Is Powering the Next Generation of AI Factories",
  url: "https://www.onsemi.com/company/newsroom/news-and-insights/how-onsemi-is-powering-the-next-generation-of-ai-factories",
  published: "May 29, 2026",
  scope: {
    zh: "AI 資料中心的矽、SiC 與 GaN 功率產品及供應鏈觀點。",
    en: "Silicon, SiC, and GaN power products and supply-chain context for AI data centers.",
  },
};

const stQ1: SourceReference = {
  id: "stm-q1-2026",
  kind: "company",
  publisher: "STMicroelectronics Investor Relations",
  title: "Q1 2026 Earnings Results",
  url: "https://investors.st.com/static-files/1e089b38-2b28-48c9-8585-fe8f4ba74f33",
  published: "April 23, 2026",
  scope: {
    zh: "SiC 業務、800V AI 資料中心電力架構與公司展望。",
    en: "SiC business, 800V AI data-center power architecture, and company outlook.",
  },
};

const infineon200mm: SourceReference = {
  id: "infineon-200mm",
  kind: "company",
  publisher: "Infineon",
  title: "Next milestone on 200 mm silicon carbide",
  url: "https://www.infineon.com/assets/row/public/documents/corporate/press/press-releases/business-financial-press/2025/next-milestone-200-mm-silicon-carbide.pdf",
  published: "2025",
  scope: {
    zh: "200mm SiC 量產進度與產品時程的公司公告。",
    en: "Company disclosure on 200mm SiC production progress and product timing.",
  },
};

export const sourceBundles: Record<string, SourceBundle> = {
  "/": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, stanfordEconomy, nvidiaQ1, ieaEnergyAi, ieaDataCentres],
    kpiSources: [
      ["atlas-model", "stanford-economy"],
      ["atlas-model", "nvidia-q1-fy27"],
      ["atlas-model", "iea-energy-ai", "iea-data-centres"],
      ["atlas-model", "stanford-economy"],
    ],
  },
  "/stocks": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, nvidiaQ1, broadcomQ2, tsmcQ1, stanfordEconomy],
    kpiSources: [
      ["atlas-model"],
      ["atlas-model"],
      ["atlas-model", "nvidia-q1-fy27", "broadcom-q2-fy26", "tsmc-q1-2026"],
      ["atlas-model", "nvidia-q1-fy27", "broadcom-q2-fy26", "tsmc-q1-2026"],
    ],
  },
  "/compute": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, nvidiaQ1, broadcomQ2, tsmcQ1],
    kpiSources: [
      ["atlas-model", "nvidia-q1-fy27", "broadcom-q2-fy26"],
      ["atlas-model", "tsmc-q1-2026"],
      ["atlas-model", "tsmc-q1-2026"],
      ["atlas-model", "nvidia-q1-fy27"],
    ],
  },
  "/energy": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, ieaEnergyAi, ieaDataCentres, doeDataCenters],
    kpiSources: [
      ["atlas-model", "iea-energy-ai", "iea-data-centres"],
      ["atlas-model", "iea-energy-ai"],
      ["atlas-model", "doe-data-centers"],
      ["atlas-model", "iea-data-centres"],
    ],
  },
  "/models": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, stanfordEconomy, stanfordTechnical, openAiPricing, geminiPricing],
    kpiSources: [
      ["atlas-model", "stanford-economy"],
      ["atlas-model", "stanford-economy"],
      ["atlas-model", "openai-pricing", "gemini-pricing"],
      ["atlas-model", "stanford-economy"],
    ],
  },
  "/sic": {
    reviewed: "July 30, 2026",
    sources: [atlasModel, wolfspeedAi, onsemiAi, stQ1, infineon200mm],
    kpiSources: [
      ["atlas-model", "wolfspeed-ai", "stm-q1-2026", "infineon-200mm"],
      ["atlas-model", "wolfspeed-ai", "infineon-200mm"],
      ["atlas-model", "wolfspeed-ai"],
      ["atlas-model", "onsemi-ai", "stm-q1-2026"],
    ],
  },
};
