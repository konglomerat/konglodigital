import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPointFeatures, normalizeResourceMapFeatures, upsertGpsPointFeature } from "@/app/[lang]/resources/map-features";

async function loadPlace(identifier: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const { data, error } = await createSupabaseAdminClient().from("resources")
    .select("id,name,pretty_title,type,map_features,gps_latitude,gps_longitude")
    .eq(uuid ? "id" : "pretty_title", identifier)
    .ilike("type", "place")
    .or("is_private.is.null,is_private.eq.false")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let mapFeatures = normalizeResourceMapFeatures(data.map_features);
  if (!getPointFeatures(mapFeatures).length) {
    mapFeatures = upsertGpsPointFeature({ features: mapFeatures, latitude: data.gps_latitude, longitude: data.gps_longitude });
  }
  return { id: data.id, name: data.name, prettyTitle: data.pretty_title, type: data.type, mapFeatures };
}

const cachedPlace = unstable_cache(loadPlace, ["cms-inventory-place-v1"], { revalidate: 60, tags: ["resources"] });

export async function loadInventoryPlace(identifier: string) {
  try {
    return await (process.env.NODE_ENV === "development" ? loadPlace(identifier) : cachedPlace(identifier));
  } catch {
    return null;
  }
}
