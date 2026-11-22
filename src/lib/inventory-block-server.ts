import "server-only";
import { loadAllShowcases } from "@/app/[lang]/showcase/showcase-data";
import { showcaseAsResourceRow } from "./payload-showcases";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectInventoryItems, normalizeInventoryTag, type InventoryBlockRow, type InventoryContentSource } from "./inventory-block";

const loadInventory = async (source: InventoryContentSource) => {
  if (source === "showcase") return (await loadAllShowcases()).filter(post => !post.isLegacyNews).map(showcaseAsResourceRow);
  const client = createSupabaseAdminClient();
  const rows: InventoryBlockRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("resources")
      .select("id,name,pretty_title,tags,type,is_private,image,images,media_posters");
    query = query.or("is_private.is.null,is_private.eq.false")
      .or("type.is.null,type.not.ilike.project");
    const { data, error } = await query
      .order("name").order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []) as InventoryBlockRow[]);
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const getCachedInventory = unstable_cache(loadInventory, ["cms-inventory-block-v3-posters"], { revalidate: 60, tags: ["resources", "showcases"] });

export async function loadInventoryBlockItems(tag: string, source: InventoryContentSource = "inventory") {
  if (!normalizeInventoryTag(tag)) return { items: [], unavailable: false };
  try {
    return { items: selectInventoryItems(await (source === "showcase" || process.env.NODE_ENV === "development" ? loadInventory(source) : getCachedInventory(source)), tag, source), unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}
