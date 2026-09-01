import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLlmsTxt,
  buildNewsSitemapXml,
  buildRssXml,
  eligibleNewsBriefs,
} from "../../market-data/discovery-feeds.ts";

function brief(date: string, runId = `${date}-saturday`) {
  const cutoff = `${date}T01:00:00.000Z`;
  return {
    date,
    snapshot: {
      runId,
      dataCutoff: cutoff,
      pages: {
        "/": {
          report: {
            title: { en: "Weekly <AI> brief", zh: "每週 AI 快報" },
          },
        },
      },
    },
  } as never;
}

test("RSS lists every permanent dated brief with canonical trailing URLs", () => {
  const xml = buildRssXml([brief("2026-08-26"), brief("2026-08-22")]);

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<link>https:\/\/aimarketatlas\.net\/brief\/2026-08-26\/</);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/aimarketatlas\.net\/brief\/2026-08-26\/<\/guid>/);
  assert.match(xml, /Weekly &lt;AI&gt; brief/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
});

test("XML output removes XML 1.0-forbidden controls from RSS and news titles", () => {
  const briefWithControl = brief("2026-08-26");
  briefWithControl.snapshot.pages["/"].report.title.en = "Weekly\u0001 <AI> brief";
  briefWithControl.snapshot.pages["/"].report.title.zh = "每週\u0001 AI 快報";
  const rss = buildRssXml([briefWithControl]);
  const news = buildNewsSitemapXml([briefWithControl], "2026-08-26T12:00:00.000Z");
  assert.doesNotMatch(rss, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.doesNotMatch(news, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.match(rss, /Weekly &lt;AI&gt; brief/);
  assert.match(news, /每週 AI 快報/);
});

test("news sitemap is a deterministic 48-hour window around an explicit reference time", () => {
  const briefs = [brief("2026-08-26"), brief("2026-08-25"), brief("2026-08-23")];
  assert.deepEqual(
    eligibleNewsBriefs(briefs, "2026-08-26T12:00:00.000Z").map((item) => item.date),
    ["2026-08-26", "2026-08-25"],
  );
  const xml = buildNewsSitemapXml(briefs, "2026-08-26T12:00:00.000Z");
  assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  assert.match(xml, /<news:publication_date>2026-08-26T01:00:00\.000Z<\/news:publication_date>/);
  assert.doesNotMatch(xml, /2026-08-23/);
  assert.equal(buildNewsSitemapXml(briefs, "2026-08-27T12:00:00.000Z"), buildNewsSitemapXml(briefs, new Date("2026-08-27T12:00:00.000Z")));
});

test("llms.txt links feeds, bilingual pillars, permanent briefs, and selected entity hubs", () => {
  const txt = buildLlmsTxt(
    [brief("2026-08-26"), brief("2026-08-22")],
    [{ slug: "hbm", name: { en: "HBM", zh: "HBM" } }],
  );

  assert.match(txt, /^# AI Market Atlas/m);
  assert.match(txt, /https:\/\/aimarketatlas\.net\/rss\.xml/);
  assert.match(txt, /https:\/\/aimarketatlas\.net\/news-sitemap\.xml/);
  assert.match(txt, /https:\/\/aimarketatlas\.net\/entity\/hbm\//);
  assert.match(txt, /https:\/\/aimarketatlas\.net\/brief\/2026-08-26\//);
  assert.match(txt, /\/en\/brief\/2026-08-26\//);
});
