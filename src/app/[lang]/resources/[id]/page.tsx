import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { inventoryResource, inventoryMapResources } from "@/lib/openinventory";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { localizePathname } from "@/i18n/config";
import ResourceDetailClient from "./ResourceDetailClient";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string; lang?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resource = await inventoryResource((await params).id);
  return { title: resource ? `${resource.name} | Konglomerat Digitale Werkstätten` : "Inventar", description: resource?.excerpt || resource?.description?.slice(0, 180) };
}
export default async function ResourceDetailPage({ params }: Props) {
  const { id, lang } = await params;
  const [resource, { resources }] = await Promise.all([inventoryResource(id), inventoryMapResources()]);
  if (!resource) notFound();
  const canonical = localizePathname(buildResourcePath(resource), lang === "en" ? "en" : "de");
  if (canonical !== localizePathname(`/resources/${id}`, lang === "en" ? "en" : "de")) redirect(canonical);
  return <ResourceDetailClient resourceId={resource.id} initialResource={resource} initialMapBasemapResources={resources} initialErrorMessage={null} />;
}
