import "server-only";
import { registerDockItem } from "./dock-workshops";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pointInPolygon, toMapItem, type MapItem } from "./geometry";

async function readInventory(): Promise<MapItem[]> {
  const client = createSupabaseAdminClient();
  const items: MapItem[] = [];
  const unassignedObjects: MapItem[] = [];
  const workshopOf = new Map<string, string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("resources")
      .select(
        "id,name,pretty_title,type,image,map_features,gps_longitude,gps_latitude,is_private,workshop_resource_id",
      )
      .or("is_private.is.null,is_private.eq.false")
      .or("type.is.null,type.not.ilike.project")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      const item = toMapItem(row);
      if (!item) continue;
      if (row.workshop_resource_id)
        workshopOf.set(item.id, row.workshop_resource_id);
      items.push(item);
      if (item.type !== "place" && !row.workshop_resource_id && !item.outdoor)
        unassignedObjects.push(item);
    }
    if (!data || data.length < 500) break;
  }
  // Inventory locations are usually 2-D. Transfer the floor only when every
  // containing room agrees. An explicit workshop association was resolved above.
  const rooms = items
    .filter((item) => item.type === "place")
    .flatMap((room) =>
      room.features.flatMap((feature) =>
        feature.geometryType === "Polygon"
          ? [{ level: room.level, ring: feature.coordinates }]
          : [],
      ),
    );
  for (const object of unassignedObjects) {
    const levels = new Set(
      rooms
        .filter((room) => pointInPolygon(object.point, room.ring))
        .map((room) => room.level),
    );
    if (levels.size === 1) object.level = [...levels][0];
  }
  return items
    .map((item) => registerDockItem(item, workshopOf.get(item.id)))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
const cached = unstable_cache(readInventory, ["rosenwerk-map-site-v6"], {
  revalidate: 60,
  tags: ["resources"],
});
export async function loadMapInventory() {
  try {
    return { items: await cached(), unavailable: false };
  } catch {
    return { items: [] as MapItem[], unavailable: true };
  }
}
