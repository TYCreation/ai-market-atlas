import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityHubPage } from "../../../components/EntityHubPage";
import { extractEntityHubs, getEntityHub } from "../../../../market-data/entity-pages";
import { listPublishedBriefs } from "../../../../market-data/briefs";
import { buildEnglishMetadata } from "../../../seo";

export const dynamicParams = false;

async function entities() {
  return extractEntityHubs(await listPublishedBriefs());
}

export async function generateStaticParams() {
  return (await entities()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const entity = getEntityHub(await entities(), (await params).slug);
  return entity ? buildEnglishMetadata("/", {
    title: `${entity.name.en} evidence index`,
    description: `${entity.name.en}: traceable metrics and public sources in retained market briefs.`,
    route: `/entity/${entity.slug}`,
  }) : {};
}

export default async function EnglishEntityPage({ params }: { params: Promise<{ slug: string }> }) {
  const entity = getEntityHub(await entities(), (await params).slug);
  if (!entity) notFound();
  return <EntityHubPage entity={entity} locale="en" />;
}
