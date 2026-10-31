import { inventoryMapResources, listInventory } from "@/lib/openinventory";
import ResourcesPageClient from "./ResourcesPageClient";
export const dynamic = "force-dynamic";
export default async function ResourcesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {};
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const type = typeof params.type === "string" ? params.type.trim() : "";
  const resourcesPromise = listInventory({ query, type }).catch(() => ({ resources: [], count: null, errorMessage: "Das Inventar ist momentan nicht erreichbar. Bitte später erneut versuchen." }));
  const mapBasemapResourcesPromise = inventoryMapResources().catch(() => ({ resources: [] }));
  return <ResourcesPageClient resourcesPromise={resourcesPromise} mapBasemapResourcesPromise={mapBasemapResourcesPromise} initialQueryText={query} initialResourceType={type} />;
}
