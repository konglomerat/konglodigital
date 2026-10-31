import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveResourceIdByPrettyTitle } from "@/lib/resource-pretty-title";
import { INVENTORY_URL, inventoryIdentifier, toPublicInventoryResource, type InventoryResource } from "./openinventory-contract";

export class InventoryApiError extends Error {
  constructor(public status: number) { super("Das Inventar ist momentan nicht erreichbar. Bitte später erneut versuchen."); }
}

export async function inventoryFetch(path: string, headers?: HeadersInit) {
  const token = process.env.OPENINVENTORY_API_TOKEN;
  if (!token) throw new InventoryApiError(503);
  if (!path.startsWith("/api/") || path.includes("..") || path.includes("\\")) throw new InventoryApiError(400);
  const response = await fetch(`${INVENTORY_URL}${path}`, {
    headers: { ...Object.fromEntries(new Headers(headers)), Authorization: `Bearer ${token}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
  });
  return response;
}
async function api<T>(path: string): Promise<T> {
  const response = await inventoryFetch(path);
  if (!response.ok) throw new InventoryApiError(response.status);
  return response.json() as Promise<T>;
}

type InventoryPage = { resources: InventoryResource[]; pagination: { pages: number; total: number } };
// Short server-only cache combines concurrent page/media requests, with changes
// visible within 15 seconds. No old Supabase inventory fallback on API failure.
const allInventory = unstable_cache(async () => {
  const query = "/api/v1/resources?pageSize=500&media=all&sort=priority&direction=desc";
  const first = await api<InventoryPage>(query);
  const rows = [...first.resources];
  for (let page = 2; page <= first.pagination.pages; page++) {
    rows.push(...(await api<InventoryPage>(`${query}&page=${page}`)).resources);
  }
  return rows.filter(row => row.type !== "project").map(toPublicInventoryResource);
}, ["openinventory-public-catalog-v1"], { revalidate: 15 });

export async function listInventory({ query = "", type = "", offset = 0, limit = 100 } = {}) {
  const rows = await allInventory();
  const needle = query.trim().toLocaleLowerCase();
  const resources = rows.filter(row => (!type || row.type === type) && (!needle ||
    [row.name, row.excerpt, row.description, ...(row.tags ?? [])].some(value => value?.toLocaleLowerCase().includes(needle))));
  return { resources: resources.slice(offset, offset + limit), count: resources.length, errorMessage: null };
}
export async function inventoryMapResources() { return { resources: await allInventory() }; }

export const inventoryRawResource = unstable_cache(async (id: string) => {
  const result = await api<{ resource: InventoryResource }>(`/api/v1/resources/${encodeURIComponent(id)}`);
  if (result.resource.type === "project") throw new InventoryApiError(404);
  return result.resource;
}, ["openinventory-resource-v1"], { revalidate: 15 });

export const inventoryResource = cache(async (identifier: string) => {
  const id = inventoryIdentifier(identifier);
  let raw: InventoryResource;
  try { raw = await inventoryRawResource(id); }
  catch (error) {
    if (!(error instanceof InventoryApiError) || error.status !== 404) throw error;
    // The migration retained historical umlaut aliases in the old alias table.
    // Only resolve their ID here; all displayed content comes from OpenInventory.
    const alias = await resolveResourceIdByPrettyTitle(createSupabaseAdminClient(), id);
    if (!alias) return null;
    try { raw = await inventoryRawResource(alias.resourceId); }
    catch (error) { if (error instanceof InventoryApiError && error.status === 404) return null; throw error; }
  }
  const resource = toPublicInventoryResource(raw);
  type Related = { id: string; name: string; type: string };
  const { relations } = await api<{ relations: { source: Related | null; target: Related | null }[] }>(`/api/v1/resources/${encodeURIComponent(raw.id)}/relations`);
  const related = relations.map(relation => relation.source?.id === raw.id ? relation.target : relation.source).filter((row): row is Related => Boolean(row && row.type !== "project"));
  resource.relatedResources = [...new Map(related.map(row => [row.id, { id: row.id, name: row.name }])).values()];
  return resource;
});
