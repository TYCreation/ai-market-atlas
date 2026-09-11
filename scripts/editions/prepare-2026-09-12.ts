/** Research-backed draft only. Validation, network review and guarded deployment remain mandatory.
 * This one-off authoring command never promotes current.json or changes an archive.
 * Official publications were read on 2026-09-11; company claims are not independently audited.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertMarketSnapshot } from "../../market-data/schema.ts";
import { normalizeCandidate } from "../../market-data/normalize.ts";
import type { BilingualText, MarketSnapshot, MetricRecord, PageSlug, SourceRecord } from "../../market-data/types.ts";

const text = (en: string, zh: string): BilingualText => ({ en, zh });
const previousPath = resolve(process.argv[2] ?? "data/market/current.json");
const output = resolve(process.argv[3] ?? "candidate/2026-09-12-saturday.json");
const previous = JSON.parse(await readFile(previousPath, "utf8")) as MarketSnapshot;
const cutoff = new Date().toISOString();
if (cutoff < "2026-09-11T00:00:00.000Z" || cutoff > "2026-09-12T01:00:00.000Z") throw new Error("This research draft is scoped to the September 12 edition; collect new research for a later run");
const sources: Record<string, SourceRecord> = {};
const metrics: Record<string, MetricRecord> = {};

function source(id: string, publisher: string, title: string, url: string, publishedAt: string, scope: BilingualText) {
  sources[id] = { id, kind: "company", publisher, title, url, publishedAt, retrievedAt: cutoff, scope };
}
source("broadcom-q3-2026", "Broadcom Investor Relations", "Third Quarter Fiscal Year 2026 Financial Results", "https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announces-third-quarter-fiscal-year-2026-financial", "2026-09-02T00:00:00.000Z", text("Company-reported fiscal quarter ended August 2; revenue and GAAP versus adjusted earnings, not stock returns.", "公司截至八月二日財季的營收與 GAAP／調整後盈餘；不是股票報酬。"));
source("openai-work-september", "OpenAI", "The Work Now Within Reach", "https://openai.com/index/the-work-now-within-reach/", "2026-09-08T00:00:00.000Z", text("Company-reported adoption, serving software cost reduction and chip benchmark. Rated chip power is not facility power; benchmark endpoints are not fleet averages.", "公司揭露的採用、服務軟體成本降幅與晶片基準；額定晶片功率不是機房用電，區間端點不是全機群平均。"));
source("openai-research-september", "OpenAI", "Research acceleration: The view inside OpenAI", "https://openai.com/index/research-acceleration-view-inside-openai/", "2026-09-06T00:00:00.000Z", text("Publication reporting internal research agent-workday intensity from mid-August; not an economy-wide productivity measurement.", "公告回顧八月中旬內部研究代理工作日強度；不是整體經濟生產力。"));
source("broadcom-q3-2026-prn", "Broadcom via PR Newswire", "Third Quarter Fiscal Year 2026 Financial Results", "https://www.prnewswire.com/news-releases/broadcom-inc-announces-third-quarter-fiscal-year-2026-financial-results-and-quarterly-dividend-302868129.html", "2026-09-02T20:15:00.000Z", text("Issuer-distributed mirror of the same quarterly release; not independent corroboration.", "同一公司季報的發行人分發版本，並非獨立佐證。"));
source("onsemi-q2-2026-nasdaq", "onsemi via GlobeNewswire / Nasdaq", "onsemi Reports Second Quarter 2026 Results", "https://www.nasdaq.com/press-release/onsemi-reports-second-quarter-2026-results-2026-08-03", "2026-08-03T20:05:00.000Z", text("Issuer press release distributed by GlobeNewswire and hosted by Nasdaq, including company revenue and GAAP margin. This is the same release, not independent corroboration.", "GlobeNewswire 分發、Nasdaq 刊載的公司新聞稿，含營收與 GAAP 毛利率；同一公告並非獨立佐證。"));
source("onsemi-q2-2026-exhibit-mirror", "onsemi filing exhibit hosted by Yahoo Finance", "onsemi quarterly results, Exhibit 99.1", "https://cdn.yahoofinance.com/prod/sec-filings/0001097864/000114036126030989/ef20079200_ex99-1.htm", "2026-08-03T20:54:23.000Z", text("Mirror of the issuer's financial-results filing exhibit, not a Yahoo editorial article or an SEC-hosted endpoint.", "公司財報申報附件鏡像，非 Yahoo 編輯報導，亦非 SEC 託管端點。"));
for (const id of ["vertiv-q2-2026", "vertiv-q2-2026-prn", "onsemi-q2-2026-gnw", "onsemi-q2-2026-sec"]) {
  if (!previous.sources[id]) throw new Error(`Trusted prior source missing: ${id}`);
  sources[id] = { ...structuredClone(previous.sources[id]), retrievedAt: cutoff };
}

function metric(id: string, page: PageSlug, numericValue: number, unit: string, display: BilingualText, sourceId: string): string {
  const asOf = sources[sourceId].publishedAt;
  metrics[id] = { id, page, required: true, kind: "published", numericValue, unit, display, asOf, sourceIds: [sourceId], observations: [{ sourceId, numericValue, asOf }], confidence: "high", status: "verified", ...(unit === "$B" || unit === "USD" ? { currency: "USD" } : {}) };
  return id;
}
function retained(id: string) {
  const original = previous.metrics[id];
  if (!original || original.kind !== "published") throw new Error(`Trusted published metric missing: ${id}`);
  const record = structuredClone(original);
  delete record.sessionState;
  metrics[id] = { ...record, required: true };
  return id;
}
const pulseRevenue = metric("pulse.broadcom_ai_revenue", "/", 16.7, "$B", text("$16.7B", "$16.7B"), "broadcom-q3-2026");
const serving = metric("pulse.openai_serving_cost_reduction", "/", 20, "%", text("20% reduction", "降低 20%"), "openai-work-september");
const revenue = metric("stocks.broadcom_revenue", "/stocks", 29.6, "$B", text("$29.6B", "$29.6B"), "broadcom-q3-2026");
const gaap = metric("stocks.broadcom_gaap_eps", "/stocks", 2.68, "USD", text("$2.68 GAAP", "$2.68 GAAP"), "broadcom-q3-2026");
const adjusted = metric("stocks.broadcom_adjusted_eps", "/stocks", 3.32, "USD", text("$3.32 adjusted", "$3.32 調整後"), "broadcom-q3-2026");
const growth = metric("compute.broadcom_ai_revenue_growth", "/compute", 221, "%", text("+221% YoY", "年增 221%"), "broadcom-q3-2026");
const throughput = metric("compute.openai_inference_throughput_per_watt_lower_bound", "/compute", 1.5, "x", text("1.5–1.9x benchmark range", "基準區間 1.5–1.9 倍"), "openai-work-september");
const vertiv = retained("energy.vertiv_q2_revenue_growth");
const watts = metric("energy.openai_inference_throughput_per_watt_lower_bound", "/energy", 1.5, "x", text("1.5–1.9x benchmark range", "基準區間 1.5–1.9 倍"), "openai-work-september");
const businesses = metric("models.openai_business_count", "/models", 2.5, "million businesses", text("2.5 million businesses", "250 萬家企業"), "openai-work-september");
const intensity = metric("models.openai_frontier_output_intensity", "/models", 3.1, "agent-workdays / human-workday", text("3.1 agent-workdays", "3.1 個代理工作日"), "openai-research-september");
const onRevenue = retained("sic.onsemi_q2_revenue");
const margin = metric("sic.onsemi_gaap_gross_margin", "/sic", 38.4, "%", text("38.4% GAAP", "38.4% GAAP"), "onsemi-q2-2026-gnw");
for (const observation of Object.values(metrics)) {
  if (observation.sourceIds.includes("broadcom-q3-2026")) {
    observation.sourceIds = ["broadcom-q3-2026-prn"];
    observation.asOf = sources["broadcom-q3-2026-prn"].publishedAt;
    observation.observations = [{ sourceId: "broadcom-q3-2026-prn", numericValue: observation.numericValue, asOf: observation.asOf }];
  }
  if (observation.page === "/sic") {
    // Replace failed delivery endpoints in this draft, not in the trusted prior.
    // The fiscal observation date and value stay unchanged.
    observation.sourceIds = ["onsemi-q2-2026-nasdaq", "onsemi-q2-2026-exhibit-mirror"];
    observation.observations = observation.sourceIds.map((sourceId) => ({ sourceId, numericValue: observation.numericValue, asOf: sources[sourceId].publishedAt }));
  }
}

type Editorial = {
  title: BilingualText; thesis: BilingualText; support: BilingualText; oppose: BilingualText;
  supportIds: string[]; opposeIds: string[]; kpis: Array<[string, BilingualText]>;
  stance: "bullish" | "bearish"; note: BilingualText; check: string; by: string;
};
const editorial: Record<PageSlug, Editorial> = {
  "/": {
    title: text("AI spending grows; efficiency changes who captures it", "AI 支出成長，效率改變獲利分配"),
    thesis: text("Constructive on realized infrastructure demand, with less conviction in spending extrapolations. Company revenue and serving efficiency point in different directions for revenue per task.", "看好已實現的基礎設施需求，但降低對支出線性外推的信心。公司營收與服務效率，對每項任務收入的含義並不相同。"),
    support: text("Broadcom reports AI semiconductor revenue of $16.7B.", "Broadcom 揭露 AI 半導體營收 $16.7B。"),
    oppose: text("OpenAI reports a 20% serving-cost reduction; this challenges a constant-cost demand model.", "OpenAI 揭露服務成本降低 20%，對固定成本需求模型構成反證。"),
    supportIds: [pulseRevenue], opposeIds: [serving], kpis: [[pulseRevenue, text("Broadcom quarterly AI revenue", "Broadcom 季度 AI 營收")], [serving, text("OpenAI reported serving-cost reduction", "OpenAI 揭露服務成本降幅")]], stance: "bullish", check: pulseRevenue, by: "2026-12-15",
    note: text("Analyst interpretation: adoption can absorb efficiency gains, but neither disclosure establishes aggregate market size. The obsolete model estimates are retired, not refreshed.", "分析判斷：採用可能吸收效率提升，但兩項揭露都不能證明整體市場規模。舊模型估值已退役，並非更新日期。"),
  },
  "/stocks": {
    title: text("Broadcom earnings strengthen the operating case", "Broadcom 財報強化營運論點"),
    thesis: text("Constructive on operating momentum, without a valuation or share-price call. Reported sales support demand; adjusted earnings alone overstate what GAAP shareholders earned.", "看好營運動能，但不作估值或股價判斷。已認列營收支持需求，僅看調整後盈餘則會高估 GAAP 股東盈餘。"),
    support: text("Broadcom reports quarterly revenue of $29.6B.", "Broadcom 揭露季度營收 $29.6B。"),
    oppose: text("GAAP EPS is $2.68 versus adjusted EPS of $3.32; the earnings basis matters.", "GAAP 每股盈餘 $2.68，調整後為 $3.32；盈餘口徑影響判讀。"),
    supportIds: [revenue], opposeIds: [gaap, adjusted], kpis: [[revenue, text("Broadcom quarterly revenue", "Broadcom 季度營收")], [gaap, text("Broadcom GAAP EPS", "Broadcom GAAP 每股盈餘")], [adjusted, text("Broadcom adjusted EPS", "Broadcom 調整後每股盈餘")]], stance: "bullish", check: revenue, by: "2026-12-15",
    note: text("Analyst interpretation: the demand case is stronger than a blanket stock-buying case. No quote provider is configured, so this edition does not publish prices, returns or multiples.", "分析判斷：需求論點比全面買股論點更有依據。未配置報價供應商，本期不發布股價、報酬或本益比。"),
  },
  "/compute": {
    title: text("Accelerator demand meets a tougher efficiency benchmark", "加速器需求面對更高效率基準"),
    thesis: text("Constructive on delivered AI silicon demand; cautious on assuming the same revenue for each unit of useful output. Efficiency is a competitive variable, not proof of falling total demand.", "看好已交付 AI 晶片需求，但不假設每單位有效產出的收入固定。效率是競爭變數，並非總需求下降的證明。"),
    support: text("Broadcom reports AI semiconductor revenue growth of 221% year over year.", "Broadcom 揭露 AI 半導體營收年增 221%。"),
    oppose: text("OpenAI reports 1.5–1.9x peak tokens per rated chip watt in selected benchmarks; this challenges a fixed hardware-intensity assumption.", "OpenAI 揭露指定基準每額定晶片瓦的峰值 Token 為 1.5–1.9 倍，挑戰固定硬體強度假設。"),
    supportIds: [growth], opposeIds: [throughput], kpis: [[growth, text("Broadcom AI revenue growth", "Broadcom AI 營收年增率")], [throughput, text("OpenAI chip benchmark, not fleet average", "OpenAI 晶片基準，非機群平均")]], stance: "bullish", check: growth, by: "2026-12-15",
    note: text("Analyst interpretation: compare useful workload delivery, not peak claims alone. The benchmark range is dated and company-reported; its lower endpoint is the numeric observation.", "分析判斷：應比較有效工作交付，不只峰值宣稱。區間是具日期的公司基準揭露，數值觀測採下限。"),
  },
  "/energy": {
    title: text("Power infrastructure growth needs workload-level checks", "電力基礎設施成長需以工作負載核對"),
    thesis: text("Constructive on realized power and cooling supplier demand. Do not translate a chip-efficiency benchmark into a forecast of grid demand or project energization.", "看好電力與冷卻供應商的已實現需求。但不能把晶片效率基準換算成電網需求或專案通電預測。"),
    support: text("Vertiv reported quarterly revenue growth of 24%; the original publication date is retained.", "Vertiv 已公布季度營收年增 24%；保留原公告日期。"),
    oppose: text("The cited chip-efficiency range challenges constant energy per token; facility-wide savings remain unmeasured here.", "所引晶片效率區間挑戰固定每 Token 能耗；此處並無機房整體節能實測。"),
    supportIds: [vertiv], opposeIds: [watts], kpis: [[vertiv, text("Vertiv quarterly revenue growth", "Vertiv 季度營收年增率")], [watts, text("Chip benchmark range, not grid savings", "晶片基準區間，非電網節省量")]], stance: "bullish", check: vertiv, by: "2026-11-15",
    note: text("Analyst interpretation: equipment revenue is stronger evidence than an announced power queue. This page carries forward a still-valid quarterly result; it does not imply a new earnings release.", "分析判斷：設備營收比公告電力排隊量更具證據力。本頁沿用仍在有效期內的季報，並非宣稱發布了新財報。"),
  },
  "/models": {
    title: text("Business reach expands; internal agent effort is not ROI", "企業觸及擴大，內部代理工時不等於投資報酬"),
    thesis: text("Constructive on distribution into business workflows. Keep internal research intensity separate from customer productivity, retention and profitability.", "看好企業工作流程的分發能力，但將內部研究使用強度與客戶生產力、留存及獲利分開。"),
    support: text("OpenAI reports reaching 2.5 million businesses.", "OpenAI 揭露觸及 250 萬家企業。"),
    oppose: text("The internal research figure is 3.1 agent-workdays per human-workday, not verified customer output or paid-seat retention.", "內部研究數字是每人類工作日 3.1 個代理工作日，不是已驗證的客戶產出或付費席次留存。"),
    supportIds: [businesses], opposeIds: [intensity], kpis: [[businesses, text("OpenAI reported business reach", "OpenAI 揭露企業觸及")], [intensity, text("Internal research effort ratio", "內部研究投入比率")]], stance: "bullish", check: businesses, by: "2026-12-15",
    note: text("Analyst interpretation: distribution is necessary but insufficient for durable economics. The research figure describes a mid-August internal observation published later, not a fresh weekly measurement.", "分析判斷：分發是持續獲利的必要而非充分條件。研究數字是稍後公布的八月中旬內部觀測，不是新的每週量測。"),
  },
  "/sic": {
    title: text("Do not treat diversified power revenue as pure SiC demand", "勿將多元功率營收當成純 SiC 需求"),
    thesis: text("Bearish on using diversified company results as a pure SiC growth proxy. Operating recovery is real evidence, but material-specific demand needs separate disclosure.", "不看好將多元公司業績當作純 SiC 成長代理指標。營運復甦具證據，但材料別需求需要獨立揭露。"),
    support: text("The reported GAAP gross margin of 38.4% is company-wide, not a disclosed SiC margin; it does not establish a material-specific advantage.", "揭露的 GAAP 毛利率 38.4% 屬全公司而非 SiC 毛利率，不能證明特定材料優勢。"),
    oppose: text("onsemi reported $1.604B revenue, evidence of operating scale that argues against dismissing the supplier's recovery.", "onsemi 揭露營收 $1.604B，營運規模是不能忽視供應商復甦的反向證據。"),
    supportIds: [margin], opposeIds: [onRevenue], kpis: [[onRevenue, text("onsemi quarterly company revenue", "onsemi 季度全公司營收")], [margin, text("onsemi company GAAP gross margin", "onsemi 全公司 GAAP 毛利率")]], stance: "bearish", check: margin, by: "2026-11-15",
    note: text("Analyst interpretation: the company release covers multiple power technologies. A stronger company margin would weaken our cautious proxy thesis, but would still not isolate SiC revenue.", "分析判斷：公司公告涵蓋多種功率技術。全公司毛利率走強會削弱我們對代理指標的審慎論點，但仍無法拆出 SiC 營收。"),
  },
};
const pages = Object.fromEntries(Object.entries(editorial).map(([slug, item]) => {
  const ids = [...new Set([...item.supportIds, ...item.opposeIds])];
  const observed = metrics[item.check];
  const comparison = { metricId: item.check, operator: item.stance === "bearish" ? ">" as const : "<" as const, value: observed.numericValue, unit: observed.unit, ...(observed.currency ? { currency: observed.currency } : {}) };
  const condition = item.stance === "bearish" ? text("The next comparable company margin exceeds this edition's cited level.", "下次可比全公司毛利率超過本期引用水準。") : text("The next comparable company disclosure falls below this edition's cited level.", "下次可比公司揭露低於本期引用水準。" );
  const consequence = text("Reassess the directional thesis; do not carry it forward automatically. No new disclosure means this test remains unresolved.", "重新檢驗方向性論點，不自動沿用；若無新揭露，此檢驗仍未決。" );
  return [slug, { kpis: item.kpis.map(([metricId, label]) => ({ metricId, label })), changed: true, changeReasons: ["thesis-reexamined-restated", "conclusion-changing-evidence"], verifiedAt: cutoff, thesisStance: item.stance, previousThesisStance: previous.pages[slug as PageSlug].thesisStance, thesisMetricIds: ids, report: {
    eyebrow: text("Evidence-led market review", "證據導向市場檢視"), title: item.title, summary: item.thesis, signal: item.kpis[0][1],
    thesis: { title: item.title, body: item.thesis, tags: { en: ["Company disclosure", "Analyst interpretation"], zh: ["公司揭露", "分析判斷"] } },
    thesisSurvivalRationale: { text: item.note, metricIds: ids }, supportingEvidence: [{ text: item.support, metricIds: item.supportIds }], opposingEvidence: [{ text: item.oppose, metricIds: item.opposeIds }],
    catalysts: [text("The next comparable issuer disclosure and independently measured customer outcomes.", "下次可比發行人揭露與獨立量測的客戶成果。")], analystNotes: [item.note],
    risks: [{ condition, by: item.by, comparison, consequence }], nextObservations: [{ what: text("Recheck the cited metric on the same reporting basis.", "以相同揭露口徑重新查核引用指標。"), by: item.by, threshold: condition, comparison, consequence }],
  } }];
})) as MarketSnapshot["pages"];
const citedSourceIds = new Set(Object.values(metrics).flatMap((record) => record.sourceIds));
const citedSources = Object.fromEntries(Object.entries(sources).filter(([id]) => citedSourceIds.has(id)));
const snapshot: MarketSnapshot = { schemaVersion: 2, runId: "2026-09-12-saturday", cadence: "saturday", generatedAt: cutoff, dataCutoff: cutoff, sources: citedSources, metrics, pages, keySignalIds: [pulseRevenue, revenue, growth, vertiv, businesses, onRevenue] };
assertMarketSnapshot(snapshot);
const normalized = normalizeCandidate(snapshot, previous, new Date(cutoff));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(normalized, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ draft: output, runId: normalized.runId, metrics: Object.keys(metrics).length, promoted: false }));
