import type { Metadata } from "next";
import Link from "next/link";
import { listMonthlyArchives } from "../../market-data/monthly.ts";
import { CollectionStructuredData } from "../components/StructuredData";
import { SiteCredit } from "../components/SiteCredit";
import { buildMetadata, pageSeo } from "../seo";

export const metadata: Metadata = buildMetadata("/archive");

export default function ArchiveIndexPage() {
  const archives = listMonthlyArchives();

  return (
    <>
      <CollectionStructuredData
        path="/archive"
        name="AI 市場情報月度封存"
        description={pageSeo["/archive"].description}
      />
      <main className="archive-main archive-index">
        <Link className="archive-back" href="/">← AI Market Atlas <span>市場首頁</span></Link>
        <header className="archive-header">
          <p className="eyebrow">AI Market Atlas · Permanent records</p>
          <h1>AI 市場情報：月度市場封存</h1>
          <p className="archive-title-en">Monthly AI market intelligence archives</p>
          <p className="archive-summary">每月最後一個週六的市場資料、論點與公開來源封存。</p>
          <p className="archive-summary archive-summary-en">Monthly records of market data, theses, and public source provenance.</p>
        </header>
        <section className="archive-index-list" aria-label="Monthly market archives">
          {archives.map((archive) => (
            <Link className="archive-index-card" href={`/archive/${archive.month}`} key={archive.month}>
              <span>{archive.month}</span>
              <strong>{archive.summary.zh}</strong>
              <small>{archive.summary.en}</small>
              <em>AI 股票籃子 · {archive.basketChange.display.zh} <b>查看封存 →</b></em>
            </Link>
          ))}
        </section>
        <SiteCredit />
      </main>
    </>
  );
}
