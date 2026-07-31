import type { Metadata } from "next";
import Link from "next/link";
import { listMonthlyArchives } from "../../../market-data/monthly.ts";
import { CollectionStructuredData } from "../../components/StructuredData";
import { buildEnglishMetadata, pageSeoEn } from "../../seo";

export const metadata: Metadata = buildEnglishMetadata("/archive");
export default function EnglishArchiveIndexPage() {
  const archives = listMonthlyArchives();
  return (
    <>
      <CollectionStructuredData path="/en/archive" name="AI Market Intelligence Archive" description={pageSeoEn["/archive"].description} />
      <main className="archive-main archive-index">
        <Link className="archive-back" href="/en">← AI Market Atlas <span>Market home</span></Link>
        <header className="archive-header">
          <p className="eyebrow">AI Market Atlas · Permanent records</p>
          <h1>AI Market Intelligence Archive</h1>
          <p className="archive-summary">Monthly records of market data, theses, and public source provenance, published on the final Saturday of each month.</p>
        </header>
        <section className="archive-index-list" aria-label="Monthly AI market intelligence archives">
          {archives.map((archive) => (
            <Link className="archive-index-card" href={`/en/archive/${archive.month}`} key={archive.month}>
              <span>{archive.month}</span><strong>{archive.summary.en}</strong>
              <em>AI equity basket · {archive.basketChange.display.en} <b>View archive →</b></em>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
