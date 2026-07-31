"use client";

import { useState } from "react";

type Locale = "zh" | "en";

const copy = {
  zh: {
    kicker: "00 · HyperFrames 動態快報",
    title: "30 秒掌握本週 AI 市場",
    replay: "重新播放",
    replayLabel: "重新播放本週 AI 市場動態快報",
    frameTitle: "本週 AI 市場 30 秒動態快報",
    note:
      "以已發布週報快照呈現市場溫度、產業輪動、重點股票與催化劑；非即時行情或投資建議。",
  },
  en: {
    kicker: "00 · HyperFrames motion brief",
    title: "The AI market in 30 seconds",
    replay: "Replay",
    replayLabel: "Replay this week’s animated AI market brief",
    frameTitle: "This week’s AI market in a 30-second motion brief",
    note:
      "A promoted weekly snapshot of market temperature, sector rotation, key equities, and catalysts—not live pricing or investment advice.",
  },
} as const;

export function WeeklyMarketBrief({ locale }: { locale: Locale }) {
  const [playback, setPlayback] = useState(0);
  const ui = copy[locale];
  const src = `/market-brief/index.html?lang=${locale}&embed=1&playback=${playback}`;

  return (
    <section className="section market-film-section" id="weekly-brief">
      <div className="section-head market-film-head">
        <div>
          <p className="section-kicker">{ui.kicker}</p>
          <h2>{ui.title}</h2>
        </div>
        <button
          className="market-film-replay"
          type="button"
          onClick={() => setPlayback((current) => current + 1)}
          aria-label={ui.replayLabel}
        >
          <span aria-hidden="true">↻</span>
          {ui.replay}
        </button>
      </div>

      <div className="market-film-frame">
        <iframe
          key={`${locale}-${playback}`}
          src={src}
          title={ui.frameTitle}
          loading="eager"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
      <p className="market-film-note">{ui.note}</p>
    </section>
  );
}
