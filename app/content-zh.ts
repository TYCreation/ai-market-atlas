import type { DashboardConfig } from "./content";
import type { PageSlug } from "../market-data/types";

export const marketPulseZh: DashboardConfig = {
  slug: "/",
  eyebrow: "AI 經濟 · 高層總覽",
  title: "市場變動，信號留存。",
  summary:
    "每週掌握 AI 經濟的營運全貌，將算力供給、電力可用性、模型經濟與企業採用整合成一份可直接決策的情報簡報。",
  signal: "制約輪動",
  orbitValue: "74",
  orbitLabel: "市場熱度",
  kpis: [
    {
      label: "AI 基礎設施投資管線",
      value: "$2.8T",
      foot: "2026–30 模型化支出",
      delta: "較 Q1 ↑ 18%",
    },
    {
      label: "加速器市場",
      value: "$242B",
      foot: "年化品類規模",
      delta: "年增 ↑ 31%",
    },
    {
      label: "電力排隊容量",
      value: "36.2GW",
      foot: "已公佈的 AI 可用容量",
      delta: "已承諾 12.8GW",
    },
    {
      label: "企業代理",
      value: "220+",
      foot: "追蹤中的正式環境計畫",
      delta: "本季 ↑ 44 個",
    },
  ],
  thesis: {
    title: "制約堆疊正從矽晶片轉向電力。",
    body:
      "加速器供應正不均衡地改善，但電網併網、發電合約與冷卻改造，現在決定已公佈的 AI 容量能多快轉化為營收。在軟體層，Token 價格下降擴大採用，同時把差異化轉向工作流程所有權、專有情境與可衡量的任務完成率。",
    tags: ["算力供給", "電力取得", "代理經濟"],
  },
  chart: {
    label: "綜合市場強度",
    values: [26, 31, 29, 38, 45, 42, 54, 61, 57, 69, 72, 84],
    caption: {
      "30D": "基礎設施承諾增速快於軟體重新定價，市場動能因而加速。",
      Q3: "基準情境仍將電力與網路視為信心最高的兩項制約。",
      "2027": "長週期產能陸續上線，代理經濟將成為主要的篩選壓力。",
    },
  },
  clusters: [
    {
      name: "算力",
      score: 92,
      state: "供應緊張",
      note: "HBM 與先進封裝仍是關鍵卡點。",
    },
    {
      name: "電力",
      score: 88,
      state: "關鍵",
      note: "併網取代矽晶片，成為交期最長的項目。",
      critical: true,
    },
    {
      name: "模型",
      score: 64,
      state: "壓力緩解",
      note: "API 價格下滑，但高階推理仍保有溢價。",
    },
    {
      name: "代理",
      score: 71,
      state: "加速建立",
      note: "工作流程所有權正成為新的護城河。",
    },
  ],
  table: {
    title: "資本輪動追蹤板",
    columns: ["領域", "目前信號", "30 日變化", "信心", "下一個催化劑"],
    rows: [
      ["算力系統", "供應仍具選擇性", "+5.8%", "高", "Q3 供應商法說"],
      ["電力與冷卻", "需求超越排隊容量", "+8.1%", "高", "公用事業標案"],
      ["基礎模型", "性價比重置", "−2.4%", "中", "新推理層級"],
      ["企業代理", "從試點進入正式環境", "+6.3%", "高", "預算重新配置"],
      ["AI 應用", "垂直領域分化", "+1.9%", "中", "續約群組數據"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "電力可用性",
      body:
        "追蹤已簽約的兆瓦，而不是已公佈的園區。兩者之間的差距，正成為檢驗成長真實度的最佳指標。",
      owner: "下一讀 · 公用事業排隊",
    },
    {
      priority: "02 · 高",
      title: "模型商品化",
      body:
        "觀察價格壓縮能否讓總工作負載快速擴張，足以抵銷每 Token 收入下降。",
      owner: "下一讀 · API 定價",
    },
    {
      priority: "03 · 高",
      title: "代理單位經濟",
      body:
        "完成率、人工覆核負擔與毛利率，比席次或試點數量更重要。",
      owner: "下一讀 · 正式環境群組",
    },
  ],
};

export const computeZh: DashboardConfig = {
  slug: "/compute",
  eyebrow: "基礎設施層 · 算力與晶片",
  title: "算力看似充足，直到它突然不足。",
  summary:
    "從加速器、記憶體、封裝與網路供應鏈切入，區分可持續的實際產能與新聞標題中的容量承諾。",
  signal: "選擇性緊張",
  orbitValue: "82",
  orbitLabel: "供應壓力",
  kpis: [
    {
      label: "加速器營收池",
      value: "$242B",
      foot: "2026 模型化年化規模",
      delta: "年增 ↑ 31%",
    },
    {
      label: "HBM 位元需求",
      value: "+94%",
      foot: "模型化年成長率",
      delta: "H1 仍偏緊",
    },
    {
      label: "封裝交期",
      value: "28週",
      foot: "高階中介層系統",
      delta: "↓ 6 週",
    },
    {
      label: "推論單位成本",
      value: "−58%",
      foot: "近十二個月指數變化",
      delta: "已調整效能",
    },
  ],
  thesis: {
    title: "短缺正在分化，而不是消失。",
    body:
      "一般加速器的取得正改善，但高階堆疊仍受 HBM 良率、先進封裝與高速網路限制。策略問題已不再只是誰能買到 GPU，而是誰能組出平衡的系統、取得電力，並維持足夠高的利用率來守住報酬。",
    tags: ["HBM", "先進封裝", "高速網路"],
  },
  chart: {
    label: "高階算力可用性",
    values: [24, 29, 37, 34, 43, 47, 51, 58, 62, 69, 73, 78],
    caption: {
      "30D": "系統層級的可用性改善，但高階記憶體配置仍然緊張。",
      Q3: "封裝供給預計先舒緩，記憶體供應則較晚完全正常化。",
      "2027": "客製晶片市占提升，但領先 GPU 平台仍保有最廣泛的軟體吸引力。",
    },
  },
  clusters: [
    {
      name: "加速器",
      score: 84,
      state: "改善中",
      note: "最新系統以外的配額壓力正在緩解。",
    },
    {
      name: "HBM",
      score: 94,
      state: "關鍵",
      note: "認證與良率使高階記憶體持續稀缺。",
      critical: true,
    },
    {
      name: "封裝",
      score: 86,
      state: "緊張",
      note: "產能擴張的同時，系統複雜度也同步上升。",
    },
    {
      name: "網路",
      score: 79,
      state: "選擇性供應",
      note: "Scale-up 互連正成為系統級差異化因素。",
    },
  ],
  table: {
    title: "算力價值鏈追蹤",
    columns: ["層級", "市場定位", "信號", "曝險", "下一步觀察"],
    rows: [
      ["NVIDIA", "平台領導者", "需求持久", "加速器／網路", "下一代架構量產"],
      ["AMD", "規模化挑戰者", "市占建立中", "加速器／CPU", "機櫃級採用"],
      ["Broadcom", "客製晶片推動者", "訂單管線強勁", "ASIC／網路", "客戶集中度"],
      ["TSMC", "晶圓代工瓶頸", "產能擴張中", "先進製程／封裝", "CoWoS 產出"],
      ["SK hynix", "HBM 領導者", "配額緊張", "高階記憶體", "良率與產品組合"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "HBM 認證",
      body:
        "記憶體只有通過平台認證後才構成有效供應。應追蹤已核准產能，而非總晶圓投入量。",
      owner: "下一讀 · 供應商組合",
    },
    {
      priority: "02 · 高",
      title: "機櫃利用率",
      body:
        "下一個利潤池屬於能讓昂貴叢集持續有工作、排程順暢且網路充足的營運商。",
      owner: "下一讀 · 工作負載密度",
    },
    {
      priority: "03 · 中",
      title: "客製晶片",
      body:
        "ASIC 動能確實存在，但軟體可攜性與部署規模才決定市占真正轉移的位置。",
      owner: "下一讀 · 出貨放量",
    },
  ],
};

export const energyZh: DashboardConfig = {
  slug: "/energy",
  eyebrow: "實體層 · 資料中心與能源",
  title: "AI 競賽已進入電網。",
  summary:
    "以專案為單位追蹤電力承諾、併網延遲、冷卻轉型，以及把模型真正轉化為可用容量所需的基礎設施。",
  signal: "電力受限",
  orbitValue: "88",
  orbitLabel: "排隊壓力",
  kpis: [
    {
      label: "已公佈 AI 可用電力",
      value: "36.2GW",
      foot: "追蹤中的全球管線",
      delta: "季增 ↑ 4.1GW",
    },
    {
      label: "已確定承諾",
      value: "12.8GW",
      foot: "已簽約或興建中",
      delta: "占管線 35%",
    },
    {
      label: "併網等待時間",
      value: "4.6年",
      foot: "關鍵市場模型化中位數",
      delta: "仍在上升",
    },
    {
      label: "液冷設計占比",
      value: "42%",
      foot: "新建 AI 機房設計",
      delta: "年增 ↑ 13 點",
    },
  ],
  thesis: {
    title: "已簽約兆瓦，就是新的算力庫存。",
    body:
      "資料中心策略正轉變為能源採購專業。具備可用發電、較快許可流程與成熟冷卻供應鏈的市場，可以提早數年把需求轉成營收。溢價正轉向穩定電力、彈性負載設計，以及能在不延誤啟用的情況下支援更高機櫃密度的園區。",
    tags: ["電網接取", "穩定發電", "液冷"],
  },
  chart: {
    label: "已承諾容量指數",
    values: [18, 22, 27, 25, 31, 39, 43, 49, 58, 63, 69, 76],
    caption: {
      "30D": "已承諾電力的成長慢於已公佈容量，可信度缺口持續擴大。",
      Q3: "公用事業標案與表後發電，是最重要的專案轉化信號。",
      "2027": "高電力密度地區取得更多市占，園區設計將圍繞彈性發電與冷卻重構。",
    },
  },
  clusters: [
    {
      name: "電網",
      score: 96,
      state: "關鍵",
      note: "併網與輸電是交期最長的項目。",
      critical: true,
    },
    {
      name: "發電",
      score: 83,
      state: "簽約中",
      note: "受限地區的穩定電力溢價持續上升。",
    },
    {
      name: "冷卻",
      score: 76,
      state: "規模化",
      note: "直接液冷設計正成為標準規格。",
    },
    {
      name: "功率半導體",
      score: 69,
      state: "建立中",
      note: "更高電壓架構帶動新的元件需求。",
    },
  ],
  table: {
    title: "區域容量追蹤板",
    columns: ["市場", "目前定位", "電力信號", "建置阻力", "下一個催化劑"],
    rows: [
      ["北維吉尼亞", "最大既有基地", "嚴重受限", "輸電／許可", "新公用事業區域"],
      ["德州", "美國擴張最快市場", "節點差異大", "發電波動", "穩定電力合約"],
      ["北歐", "低碳專業市場", "相對有利", "延遲／市場深度", "新海底電纜容量"],
      ["馬來西亞", "區域成長樞紐", "逐步緊張", "電網與用水", "容量配置"],
      ["中東", "主權級新進者", "電力具優勢", "生態系成熟度", "園區啟用"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "已確定 vs. 已公佈",
      body:
        "只有在土地、電力、設備與客戶承諾同時到位後，才能把專案視為真實容量。",
      owner: "下一讀 · 專案轉化",
    },
    {
      priority: "02 · 高",
      title: "冷卻密度",
      body:
        "機櫃密度上升速度快於改造準備。應追蹤冷卻液配送與排熱能力。",
      owner: "下一讀 · 設計導入",
    },
    {
      priority: "03 · 高",
      title: "發電組合",
      body:
        "天然氣、核能、儲能與需量反應正匯聚成全天候算力的新型供電組合。",
      owner: "下一讀 · PPA 品質",
    },
  ],
};

export const modelsZh: DashboardConfig = {
  slug: "/models",
  eyebrow: "應用層 · 模型與代理",
  title: "模型更便宜，成果並沒有。",
  summary:
    "從商業角度觀察模型性價比、企業代理部署、工作流程所有權，以及區分試點與正式環境的單位經濟。",
  signal: "採用面擴大",
  orbitValue: "71",
  orbitLabel: "部署熱度",
  kpis: [
    {
      label: "正式環境代理計畫",
      value: "220+",
      foot: "追蹤中的企業計畫",
      delta: "本季 ↑ 44 個",
    },
    {
      label: "AI 軟體支出",
      value: "+37%",
      foot: "模型化年成長率",
      delta: "預算正在整併",
    },
    {
      label: "受管理 Token",
      value: "1.8T",
      foot: "每月追蹤工作負載",
      delta: "年增 ↑ 2.6×",
    },
    {
      label: "API 主導部署",
      value: "68%",
      foot: "正式環境架構占比",
      delta: "混合架構上升",
    },
  ],
  thesis: {
    title: "勝出的代理是重新設計的工作流程，不是聊天視窗。",
    body:
      "模型能力的收斂速度快於企業流程改造。當代理負責可衡量的任務、使用可信情境、清楚升級例外，並透過回饋改善時，才會產生持久價值。推論價格下降後，分發與工作流程深度，而非單純模型存取，將取得更大比例的經濟價值。",
    tags: ["工作流程所有權", "可信情境", "任務完成"],
  },
  chart: {
    label: "正式環境部署指數",
    values: [12, 15, 19, 24, 28, 34, 41, 49, 55, 62, 72, 81],
    caption: {
      "30D": "正式環境計畫在程式開發、客戶營運與內部研究領域擴張最快。",
      Q3: "平台整併將有利於同時具備治理、評估與工作流程整合能力的供應商。",
      "2027": "代理定價將從席次與 Token，轉向完成任務與受管理成果。",
    },
  },
  clusters: [
    {
      name: "前沿實驗室",
      score: 73,
      state: "持續進步",
      note: "前沿高階推理仍保有定價能力。",
    },
    {
      name: "API 層",
      score: 58,
      state: "價格壓縮",
      note: "性價比提升擴大可服務的工作負載。",
    },
    {
      name: "代理平台",
      score: 78,
      state: "建立中",
      note: "治理與評估成為企業採購標準。",
    },
    {
      name: "流程既有業者",
      score: 82,
      state: "防守中",
      note: "既有分發優勢抵銷較慢的產品週期。",
      critical: true,
    },
  ],
  table: {
    title: "企業部署追蹤板",
    columns: ["工作流程", "採用階段", "價值信號", "主要風險", "下一個驗證點"],
    rows: [
      ["軟體工程", "規模化正式環境", "週期時間", "覆核負擔", "跨多儲存庫自主性"],
      ["客戶營運", "早期正式環境", "解決率", "升級品質", "端到端自主處理"],
      ["研究與分析", "廣泛試點", "分析師產出", "來源可靠性", "可稽核工作流程"],
      ["財務營運", "受控試點", "關帳效率", "治理", "例外處理"],
      ["銷售執行", "廣泛試點", "覆蓋率提升", "信號品質", "商機轉化"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "任務完成率",
      body:
        "衡量覆核後真正完成的工作，而不是生成的內容。兩者差距會揭露隱藏營運成本。",
      owner: "下一讀 · 成果群組",
    },
    {
      priority: "02 · 高",
      title: "情境優勢",
      body:
        "最具防禦力的代理能從專有工作流程學習，同時不犧牲治理。",
      owner: "下一讀 · 資料飛輪",
    },
    {
      priority: "03 · 中",
      title: "定價轉型",
      body:
        "成果定價提高上行空間，但也把模型、覆核與例外風險轉回供應商。",
      owner: "下一讀 · 毛利率",
    },
  ],
};

export const sicZh: DashboardConfig = {
  slug: "/sic",
  eyebrow: "材料層 · SiC 與功率半導體",
  title: "AI 的電力堆疊，離不開 SiC。",
  summary:
    "每週追蹤碳化矽在 AI 晶片封裝、800V 資料中心電力、電動車逆變器、晶圓擴徑與供應鏈競局中的最新變化。",
  signal: "跨入 AI 封裝",
  orbitValue: "86",
  orbitLabel: "戰略熱度",
  kpis: [
    {
      label: "SiC 市場規模",
      value: "$23B",
      foot: "2030 年估計",
      delta: "年複合成長約 30%",
    },
    {
      label: "12 吋晶圓進展",
      value: "300mm",
      foot: "Wolfspeed 進入生產",
      delta: "中國展示 14 吋",
    },
    {
      label: "AI 封裝熱負載",
      value: "1000W+",
      foot: "單晶片功耗需求",
      delta: "B300／Ruby 級",
    },
    {
      label: "電動車 SiC 滲透率",
      value: "35%+",
      foot: "2026 年模型化採用率",
      delta: "牽引逆變器",
    },
  ],
  thesis: {
    title: "SiC 正從電動車紅海，移向 AI 基礎設施。",
    body:
      "12 吋 SiC 已不只是電動車的降本題材。它的高導熱、高電壓性能，以及與 800V 資料中心架構的相容性，正於 AI 封裝與電力傳輸形成第二條需求曲線。機會能否落地，取決於晶圓品質、客戶認證，以及先進封裝從驗證走向量產的速度。",
    tags: ["300mm 晶圓", "AI 封裝", "800V 電力"],
  },
  chart: {
    label: "SiC 市場擴張指數",
    values: [9, 15, 25, 37, 50, 65, 80, 100],
    caption: {
      "30D": "專利動態、200mm 擴產與 AI 電力設計導入，讓產業的戰略溢價維持高檔。",
      Q3: "客戶認證里程碑與高階產能擴張，仍是最清楚的商業轉化信號。",
      "2027": "AI 資料中心電力與封裝，將與電動車採用並列為第二成長引擎。",
    },
  },
  clusters: [
    {
      name: "AI 封裝",
      score: 91,
      state: "藍海",
      note: "熱密度與大型中介層，開出新的 SiC 認證路徑。",
      critical: true,
    },
    {
      name: "晶圓擴徑",
      score: 87,
      state: "推進中",
      note: "200mm 走向量產，300mm 建立策略前沿。",
    },
    {
      name: "800V 電力",
      score: 84,
      state: "建置中",
      note: "資料中心架構把 SiC 帶入更高電壓的轉換級。",
    },
    {
      name: "中國產能",
      score: 78,
      state: "價格壓力",
      note: "補貼擴產壓低基板價格，也提高出口管制風險。",
    },
  ],
  table: {
    title: "SiC 價值鏈追蹤板",
    columns: ["公司", "市場定位", "最新信號", "AI 曝險", "下一步觀察"],
    rows: [
      ["Wolfspeed", "300mm SiC 領導者", "三項 AI 封裝認證", "中介層／高電壓", "客戶轉單"],
      ["Infineon", "車用 SiC 領導者", "200mm 產能目標 +40%", "AI 電力／充電", "Villach 產出"],
      ["onsemi", "規模化車用供應商", "轉向實體 AI 產品組合", "電力／邊緣系統", "Synaptics 整合"],
      ["STMicro", "晶圓與元件平台", "800V 架構合作", "資料中心電力", "200mm 量產"],
      ["Coherent", "基板／磊晶", "200mm 與 10kV 平台", "光學＋電力", "認證組合"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "300mm 客戶認證",
      body:
        "追蹤具名客戶認證與量產訂單，而不是晶圓展示。這才是從技術證明跨向營收的橋梁。",
      owner: "下一讀 · 封裝客戶",
    },
    {
      priority: "02 · 最高",
      title: "專利訴訟",
      body:
        "Wolfspeed 與 Navitas 的爭議，可能重塑 SiC 與 GaN 功率元件的設計自由與智慧財產價值。",
      owner: "下一讀 · 禁制令進度",
    },
    {
      priority: "03 · 高",
      title: "800V 部署",
      body:
        "觀察參考設計能否變成已簽署的資料中心訂單。電力架構採用，是 AI 營收實質化的最快路徑。",
      owner: "下一讀 · 設計導入",
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
        title: "Navitas 與 Magnachip 建立高電壓 SiC 合作",
        source: "FinancialContent",
        summary: "合作鎖定高壓與超高壓功率系統，希望加快市場採用。",
        tags: ["合作", "功率"],
      },
      {
        date: "2026-07-16",
        title: "Wolfspeed 專利訴訟持續施壓 Navitas",
        source: "Semiconductor Digest",
        summary: "美國銷售禁制令若成立，可能改寫 SiC 與 GaN 元件的智慧財產版圖。",
        tags: ["專利", "風險"],
      },
      {
        date: "2026-07-15",
        title: "Infineon 推進 200mm SiC 擴產",
        source: "Compound Semiconductor",
        summary: "Villach 產能進度超前，第三季擴產目標約 40%。",
        tags: ["產能", "AI 電力"],
      },
      {
        date: "2026-07-14",
        title: "Bosch 加州 SiC 廠取得政策支援",
        source: "electrive.com",
        summary: "最高 2.25 億美元支援車用與功率市場的 SiC 晶片在地製造。",
        tags: ["產業", "美國"],
      },
      {
        date: "2026-07-13",
        title: "L&T 與 Azuremoto 鎖定 AI 資料中心 SiC",
        source: "ET CIO",
        summary: "印度加入 SiC 供應競賽，開發面向 AI 資料中心基礎設施的功率元件。",
        tags: ["AI 資料中心", "印度"],
      },
      {
        date: "2026-07-11",
        title: "Wolfspeed 發表更低導通電阻的 SiC MOSFET",
        source: "Wolfspeed",
        summary: "新平台鎖定電動車牽引逆變器與高密度 AI 資料中心電力。",
        tags: ["產品", "電動車"],
      },
    ],
    roadmap: [
      {
        route: "150mm SiC → 電動車功率",
        market: "紅海競爭",
        state: "成熟",
        opportunity: "舊產能退出，既有供應商防守市占。",
      },
      {
        route: "200mm SiC → 電動車／工業",
        market: "過渡市場",
        state: "放量",
        opportunity: "單顆晶粒成本下降，但認證與良率仍構成門檻。",
      },
      {
        route: "300mm SiC → AI 封裝／資料中心",
        market: "藍海機會",
        state: "認證中",
        opportunity: "CoWoS 相容性、800V 電力與熱密度創造新市場。",
      },
    ],
    properties: [
      { property: "熱導率", sic: "490 W/mK", silicon: "150 W/mK", advantage: "3.3×" },
      { property: "崩潰電場", sic: "3.3 MV/cm", silicon: "0.3 MV/cm", advantage: "10×" },
      { property: "能隙", sic: "3.26 eV", silicon: "1.12 eV", advantage: "2.9×" },
      { property: "最高工作溫度", sic: "600°C", silicon: "150°C", advantage: "4×" },
      { property: "電壓級距", sic: "800V–10kV+", silicon: "約 600V", advantage: "新應用域" },
    ],
    players: [
      {
        company: "Wolfspeed",
        position: "300mm 領導者",
        development: "AI 封裝認證、第五代 MOSFET、航太合作",
        signal: "反彈中",
      },
      {
        company: "Infineon",
        position: "車用領導者",
        development: "200mm 擴產、百萬瓦充電、205°C 逆變器模組",
        signal: "穩定",
      },
      {
        company: "onsemi",
        position: "車用第二大",
        development: "實體 AI 路線圖與更多車廠採用",
        signal: "轉型中",
      },
      {
        company: "STMicro",
        position: "晶圓＋元件",
        development: "提高資料中心目標；與 NVIDIA 合作 800V",
        signal: "偏多",
      },
      {
        company: "Coherent",
        position: "基板／磊晶",
        development: "200mm 出貨與完成認證的 10kV 厚磊晶平台",
        signal: "擴張中",
      },
      {
        company: "ROHM",
        position: "功率模組",
        development: "為 AI 資料中心推出頂部冷卻 1200V／600A 模組",
        signal: "新產品",
      },
    ],
    bull: [
      {
        title: "AI 封裝成為結構性需求",
        body: "300mm 認證與熱密度，創造車用功率以外的新市場。",
      },
      {
        title: "800V 資料中心升級週期",
        body: "參考架構把 SiC 帶入高效率電力轉換與保護。",
      },
      {
        title: "電動車滲透率持續擴大",
        body: "主流車款提供耐久需求底座，支撐新興 AI 機會。",
      },
      {
        title: "政策支援在地供應",
        body: "美國製造獎勵與國防計畫，提高本土 SiC 的策略價值。",
      },
    ],
    bear: [
      {
        title: "估值與融資風險",
        body: "高波動與資本密集度，可能蓋過原本強勁的技術信號。",
      },
      {
        title: "中國產能與價格壓力",
        body: "受補貼的基板擴產，威脅中低階市場的利潤率。",
      },
      {
        title: "AI 封裝時程仍不確定",
        body: "中介層商業化可能要到 2028–2030 年才具實質規模。",
      },
      {
        title: "出口管制具有雙面效果",
        body: "限制可能干擾西方設備供應，同時加速中國本土替代。",
      },
    ],
  },
};

export const stocksZh: DashboardConfig = {
  slug: "/stocks",
  eyebrow: "資本層 · AI 公開市場股票",
  title: "AI 故事，最終都要接受市場定價。",
  summary:
    "每週連結 AI 基礎設施題材與公開市場股票，追蹤領漲結構、相對強弱、估值、財報催化劑，以及藏在表面動能下的風險。",
  signal: "領漲範圍擴大",
  orbitValue: "79",
  orbitLabel: "市場風險偏好",
  kpis: [
    {
      label: "AI 股票籃子",
      value: "+6.4%",
      foot: "模型化 30 日報酬",
      delta: "標普 500 +3.1%",
    },
    {
      label: "正向市場廣度",
      value: "68%",
      foot: "站上 50 日線的追蹤股票",
      delta: "本月 ↑ 11 點",
    },
    {
      label: "預估本益比中位數",
      value: "31.8×",
      foot: "12 檔 AI 觀察股票",
      delta: "溢價仍高",
    },
    {
      label: "近期催化劑",
      value: "12",
      foot: "未來四週",
      delta: "財報＋產品事件",
    },
  ],
  thesis: {
    title: "下一段行情需要獲利擴散，而不是另一則新聞標題。",
    body:
      "AI 股票領漲結構正從加速器供應商，擴散至網路、電力、冷卻與工作流程軟體。持久的信號不再只是資本支出公告，而是整個堆疊的獲利預估同步上修。相對強弱仍具建設性，但高估值讓營收轉化與利潤品質成為市場下一道篩選器。",
    tags: ["獲利擴散", "相對強弱", "估值紀律"],
  },
  chart: {
    label: "AI 股票領漲指數",
    values: [38, 42, 39, 48, 52, 57, 55, 64, 69, 73, 71, 79],
    caption: {
      "30D": "電力、網路與軟體股票加入加速器行情，領漲範圍因而擴大。",
      Q3: "獲利預估上修與已入帳的基礎設施營收，是信心最高的確認信號。",
      "2027": "市場將獎勵能把 AI 資本支出轉化為可重複自由現金流，而非只有題材曝險的公司。",
    },
  },
  clusters: [
    {
      name: "算力",
      score: 91,
      state: "領漲",
      note: "加速器、HBM、晶圓代工與網路仍保有最強相對強弱。",
      critical: true,
    },
    {
      name: "能源",
      score: 76,
      state: "擴散中",
      note: "資料中心瓶頸向下游移動，冷卻與電力股票開始接棒。",
    },
    {
      name: "SiC 與功率",
      score: 58,
      state: "高波動",
      note: "AI 選擇權升高，但車用曝險仍造成獲利分化。",
    },
    {
      name: "軟體",
      score: 67,
      state: "選擇性",
      note: "掌握工作流程的業者，優於缺乏差異化的 AI 功能題材。",
    },
  ],
  table: {
    title: "AI 主題配置追蹤板",
    columns: ["主題", "一週", "一個月", "市場廣度", "市場信號"],
    rows: [
      ["算力領導者", "+3.8%", "+9.7%", "83%", "動能完整"],
      ["記憶體與晶圓代工", "+2.6%", "+7.1%", "75%", "預估上修"],
      ["電力與冷卻", "+4.4%", "+11.8%", "72%", "領漲擴散"],
      ["SiC 與功率元件", "−1.9%", "+2.4%", "42%", "高度分化"],
      ["AI 軟體", "+1.7%", "+5.9%", "61%", "品質選股"],
    ],
  },
  watchlist: [
    {
      priority: "01 · 最高",
      title: "獲利預估修正",
      body:
        "追蹤未來十二個月的預估變化。只有股價上漲、獲利沒有上修，是最脆弱的 AI 領漲型態。",
      owner: "下一讀 · 上修廣度",
    },
    {
      priority: "02 · 高",
      title: "市場廣度",
      body:
        "健康的 AI 週期會從少數大型股，擴散到記憶體、網路、電力與應用領導者。",
      owner: "下一讀 · 50 日線參與率",
    },
    {
      priority: "03 · 高",
      title: "資本支出轉化",
      body:
        "當估值已反映成長時，已入帳營收、利用率與自由現金流，比公佈的產能更重要。",
      owner: "下一讀 · 現金轉化",
    },
  ],
  equityDive: {
    updated: "由已發布市場快照提供",
    sectors: [
      { key: "compute", name: "算力領導者", week: "+3.8%", month: "+9.7%", breadth: 83, signal: "動能完整" },
      { key: "energy", name: "電力與冷卻", week: "+4.4%", month: "+11.8%", breadth: 72, signal: "突破" },
      { key: "sic", name: "SiC 與功率元件", week: "−1.9%", month: "+2.4%", breadth: 42, signal: "高度分化" },
      { key: "software", name: "AI 軟體", week: "+1.7%", month: "+5.9%", breadth: 61, signal: "品質選股" },
    ],
    equities: [
      {
        ticker: "NVDA",
        company: "NVIDIA",
        sector: "compute",
        strength: 96,
        forwardPe: "34.8×",
        revenueGrowth: "+48%",
        catalyst: "Rubin 平台放量",
        risk: "客戶集中",
        stance: "領導者",
      },
      {
        ticker: "AVGO",
        company: "Broadcom",
        sector: "compute",
        strength: 93,
        forwardPe: "32.1×",
        revenueGrowth: "+31%",
        catalyst: "客製 AI 晶片專案",
        risk: "專案集中",
        stance: "領導者",
      },
      {
        ticker: "AMD",
        company: "AMD",
        sector: "compute",
        strength: 86,
        forwardPe: "37.6×",
        revenueGrowth: "+29%",
        catalyst: "機櫃級部署",
        risk: "軟體執行力",
        stance: "建立中",
      },
      {
        ticker: "TSM",
        company: "台積電",
        sector: "compute",
        strength: 84,
        forwardPe: "25.4×",
        revenueGrowth: "+24%",
        catalyst: "先進封裝產出",
        risk: "地緣政治",
        stance: "核心",
      },
      {
        ticker: "VRT",
        company: "Vertiv",
        sector: "energy",
        strength: 94,
        forwardPe: "36.2×",
        revenueGrowth: "+27%",
        catalyst: "液冷訂單",
        risk: "估值壓縮",
        stance: "突破",
      },
      {
        ticker: "ETN",
        company: "Eaton",
        sector: "energy",
        strength: 81,
        forwardPe: "29.7×",
        revenueGrowth: "+14%",
        catalyst: "資料中心電力訂單",
        risk: "長週期正常化",
        stance: "核心",
      },
      {
        ticker: "CEG",
        company: "Constellation Energy",
        sector: "energy",
        strength: 89,
        forwardPe: "30.5×",
        revenueGrowth: "+18%",
        catalyst: "核能電力合約",
        risk: "政策與電價",
        stance: "領導者",
      },
      {
        ticker: "WOLF",
        company: "Wolfspeed",
        sector: "sic",
        strength: 24,
        forwardPe: "不適用",
        revenueGrowth: "+19%",
        catalyst: "300mm 客戶認證",
        risk: "融資與執行",
        stance: "投機",
      },
      {
        ticker: "ON",
        company: "onsemi",
        sector: "sic",
        strength: 57,
        forwardPe: "18.9×",
        revenueGrowth: "+8%",
        catalyst: "實體 AI 產品組合",
        risk: "車用週期疲弱",
        stance: "觀察",
      },
      {
        ticker: "NOW",
        company: "ServiceNow",
        sector: "software",
        strength: 78,
        forwardPe: "46.7×",
        revenueGrowth: "+22%",
        catalyst: "代理工作流程採用",
        risk: "高估值",
        stance: "品質",
      },
      {
        ticker: "PLTR",
        company: "Palantir",
        sector: "software",
        strength: 91,
        forwardPe: "71.5×",
        revenueGrowth: "+36%",
        catalyst: "企業平台擴張",
        risk: "極高本益比",
        stance: "動能",
      },
      {
        ticker: "CRM",
        company: "Salesforce",
        sector: "software",
        strength: 52,
        forwardPe: "24.6×",
        revenueGrowth: "+10%",
        catalyst: "Agentforce 變現",
        risk: "席次成長壓力",
        stance: "待證明",
      },
    ],
    catalysts: [
      {
        date: "07.31",
        event: "雲端資本支出讀數",
        companies: "MSFT · AMZN · GOOGL",
        impact: "檢驗已下單的加速器與資料中心需求是否仍領先供給。",
      },
      {
        date: "08.06",
        event: "電力與冷卻財報",
        companies: "VRT · ETN",
        impact: "訂單品質與交期說明，可確認基礎設施行情是否持續擴散。",
      },
      {
        date: "08.12",
        event: "AI 軟體財報群組",
        companies: "PLTR · CRM · NOW",
        impact: "正式環境部署與合約擴張，將工作流程價值和功能採用區分開來。",
      },
      {
        date: "08.19",
        event: "半導體供應更新",
        companies: "TSM · AMD · AVGO",
        impact: "先進封裝、網路與客製晶片能見度，決定下一輪預估修正。",
      },
    ],
    baskets: [
      {
        name: "算力核心",
        focus: "橫跨加速器、客製晶片、晶圓代工與網路的平台領導者。",
        performance: "+9.7%／30 日",
        risk: "高",
        tickers: ["NVDA", "AVGO", "AMD", "TSM"],
      },
      {
        name: "電力瓶頸",
        focus: "受惠 AI 資料中心建置的電氣設備、冷卻與發電業者。",
        performance: "+11.8%／30 日",
        risk: "中",
        tickers: ["VRT", "ETN", "CEG"],
      },
      {
        name: "SiC 選擇權",
        focus: "目前有電動車需求、未來具 AI 電力上行空間的寬能隙元件。",
        performance: "+2.4%／30 日",
        risk: "極高",
        tickers: ["WOLF", "ON", "STM"],
      },
      {
        name: "工作流程贏家",
        focus: "掌握企業情境、分發能力與可衡量成果的軟體供應商。",
        performance: "+5.9%／30 日",
        risk: "高",
        tickers: ["NOW", "PLTR", "CRM"],
      },
    ],
    risks: [
      {
        title: "估值壓縮",
        level: "high",
        metric: "本益比中位數 31.8×",
        body: "當市場預期已高，利率或利潤率的小幅衝擊，就可能抹去數月漲幅。",
      },
      {
        title: "獲利集中",
        level: "high",
        metric: "4 檔占 61%",
        body: "投資籃子的模型化獲利成長與指數貢獻，仍集中在少數股票。",
      },
      {
        title: "資本支出消化",
        level: "medium",
        metric: "$2.8T 投資管線",
        body: "已公佈的基礎設施必須轉化為有利用率的產能，否則客戶報酬將承壓。",
      },
      {
        title: "政策與地緣政治",
        level: "medium",
        metric: "3 個供應節點",
        body: "出口管制、關稅與地域集中，可能同時擾動需求與製造。",
      },
    ],
  },
};

export const chineseDashboards: Record<PageSlug, DashboardConfig> = {
  "/": marketPulseZh,
  "/compute": computeZh,
  "/energy": energyZh,
  "/models": modelsZh,
  "/sic": sicZh,
  "/stocks": stocksZh,
};
