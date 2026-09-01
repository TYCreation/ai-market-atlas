import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityHubPage } from "../../components/EntityHubPage";
import { extractEntityHubs, getEntityHub } from "../../../market-data/entity-pages";
import { listPublishedBriefs } from "../../../market-data/briefs";
import { buildMetadata } from "../../seo";

export const dynamicParams = false;

async function entities() {
  return extractEntityHubs(await listPublishedBriefs());
}

export async function generateStaticParams() {
  return (await entities()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const entity = getEntityHub(await entities(), (await params).slug);
  return entity ? buildMetadata("/", {
    title: `${entity.name.zh} 證據索引`,
    description: `${entity.name.zh}：保留市場快報中的可追溯指標與公開來源。`,
    route: `/entity/${entity.slug}`,
  }) : {};
}

export default async function EntityPage({ params }: { params: Promise<{ slug: string }> }) {
  const entity = getEntityHub(await entities(), (await params).slug);
  if (!entity) notFound();
  return <EntityHubPage entity={entity} locale="zh" />;
}
