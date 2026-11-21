import "server-only";
import { cache } from "react";
import { getPayloadCmsBaseUrl, type PayloadPost } from "@/lib/payload-cms";
import { toPayloadShowcase, type ShowcaseRecord } from "@/lib/payload-showcases";
export type { ShowcaseAuthor, ShowcaseRecord } from "@/lib/payload-showcases";

export const SHOWCASES_CACHE_TAG = "showcases";
async function readPosts(params: URLSearchParams) {
  const base = getPayloadCmsBaseUrl();
  if (!base) throw new Error("Das Beitrags-CMS ist nicht eingerichtet.");
  params.set("where[_status][equals]", "published");
  params.set("draft", "false");
  params.set("depth", "2");
  const url = new URL("/api/posts", base);
  url.search = params.toString();
  // No stale Supabase fallback or shared week-long cache: unpublishing takes effect immediately.
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Beiträge konnten nicht aus dem CMS geladen werden.");
  const data = await response.json() as { docs?: PayloadPost[]; hasNextPage?: boolean };
  if (!Array.isArray(data.docs)) throw new Error("Ungültige Antwort vom Beitrags-CMS.");
  return { items: data.docs.map(post => toPayloadShowcase(post, base)).filter((post): post is ShowcaseRecord => post !== null), hasNext: data.hasNextPage === true };
}
export const loadShowcases = cache(async (limit = 60): Promise<ShowcaseRecord[]> => {
  const result: ShowcaseRecord[] = [];
  const maximum = Math.max(1, Math.min(Math.trunc(limit), 10000));
  for (let page = 1; ; page++) {
    const response = await readPosts(new URLSearchParams({ limit: String(Math.min(maximum - result.length, 100)), page: String(page), sort: "-publishedAt,-updatedAt,-id" }));
    result.push(...response.items);
    if (!response.hasNext || result.length >= maximum) break;
  }
  return result.slice(0, maximum);
});
export const loadAllShowcases = () => loadShowcases(10000);
export const loadShowcaseByIdentifier = cache(async (identifier: string): Promise<ShowcaseRecord | null> => {
  const value = identifier.trim();
  if (!value || value.length > 250) return null;
  for (const field of ["slug", "legacySlug", "legacyResourceId", ...(/^\d+$/.test(value) ? ["id"] : [])]) {
    const response = await readPosts(new URLSearchParams({ limit: "1", [`where[${field}][equals]`]: value }));
    if (response.items[0]) return response.items[0];
  }
  return null;
});
export function getShowcaseCmsUrl(id?: string) {
  const base = getPayloadCmsBaseUrl();
  if (!base) throw new Error("Das Beitrags-CMS ist nicht eingerichtet.");
  return `${base}/admin/collections/posts/${id ? encodeURIComponent(id) : "create"}`;
}
