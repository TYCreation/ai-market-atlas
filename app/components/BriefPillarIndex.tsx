import Link from "next/link";
import { listPublishedBriefs } from "../../market-data/briefs";
import { briefsForPillar } from "../../market-data/brief-routes";
import type { PageSlug } from "../../market-data/types";

export async function BriefPillarIndex({
  pillar,
  locale,
}: {
  pillar: PageSlug;
  locale: "zh" | "en";
}) {
  const briefs = briefsForPillar(await listPublishedBriefs(), pillar);
  if (briefs.length === 0) return null;
  const zh = locale === "zh";
  return (
    <section className="brief-pillar-index" aria-label={zh ? "歷史市場快報" : "Historical market briefs"}>
      <p className="eyebrow">AI Market Atlas · Permanent briefs</p>
      <h2>{zh ? "本主題的歷史市場快報" : "Historical briefs for this pillar"}</h2>
      <p>{zh ? "保留每一個有實質更新的已發布版本。" : "Every published edition with a material update to this pillar."}</p>
      <ul>
        {briefs.map((brief) => {
          const report = brief.snapshot.pages[pillar].report;
          const href = zh ? `/brief/${brief.date}` : `/en/brief/${brief.date}`;
          return <li key={brief.date}><Link href={href}><time dateTime={brief.snapshot.dataCutoff}>{brief.date}</time><strong>{report.title[locale]}</strong><span>{report.summary[locale]}</span></Link></li>;
        })}
      </ul>
    </section>
  );
}
