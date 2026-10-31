import type { ResourcePayload, ResourceMapFeature } from "./campai-resources";

export const INVENTORY_URL = "https://inventar.konglomerat.org";
export const INVENTORY_HOME = `${INVENTORY_URL}/konglomerat/inventory`;
export const inventoryEditUrl = (id: string) => `${INVENTORY_HOME}/${encodeURIComponent(id)}/edit`;

export type InventoryMedia = {
  id: string; resourceId: string; name: string; url: string; kind: string;
  mimeType: string; position: number; previewMediaId?: string | null; posterMediaId?: string | null;
};
export type InventoryResource = {
  id: string; name: string; subtitle?: string; description?: string; type: string;
  priority?: number | null; tags?: string[]; categories?: string[];
  gpsLatitude?: number | null; gpsLongitude?: number | null; gpsAltitude?: number | null;
  updatedAt?: string; slugs?: string[]; media?: InventoryMedia[]; cover?: InventoryMedia | null;
  mapFeatures?: { id: string; layer: string; description?: string; type: string; coordinates: unknown }[];
};

export function inventoryMediaUrl(media: InventoryMedia): string {
  // Keep the extension: the existing gallery identifies videos/PDFs by URL.
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "application/pdf": "pdf" } as Record<string, string>)[media.mimeType] ?? "bin";
  return `/api/openinventory/media/${encodeURIComponent(media.resourceId)}/${encodeURIComponent(media.id)}/media.${extension}`;
}

export function toPublicInventoryResource(row: InventoryResource): ResourcePayload {
  const media = [...(row.media ?? [])].sort((a, b) => a.position - b.position);
  const byId = new Map(media.map(item => [item.id, item]));
  if (row.cover) byId.set(row.cover.id, row.cover);
  const auxiliaryIds = new Set(media.flatMap(item => [item.previewMediaId, item.posterMediaId]).filter(Boolean));
  const originals = media.filter(item => !auxiliaryIds.has(item.id));
  const gallery = row.cover ? [row.cover, ...originals.filter(item => item.id !== row.cover!.id)] : originals;
  const mediaPreviews: Record<string, string> = {};
  const mediaPosters: Record<string, string> = {};
  for (const item of gallery) {
    const preview = item.previewMediaId ? byId.get(item.previewMediaId) : null;
    const poster = item.posterMediaId ? byId.get(item.posterMediaId) : null;
    if (preview) mediaPreviews[inventoryMediaUrl(item)] = inventoryMediaUrl(preview);
    if (poster) mediaPosters[inventoryMediaUrl(item)] = inventoryMediaUrl(poster);
  }
  const mapFeatures: ResourceMapFeature[] = (row.mapFeatures ?? []).flatMap(feature => {
    const base = { id: feature.id, layer: feature.layer, description: feature.description };
    if (feature.type === "point") return [{ ...base, geometryType: "Point" as const, point: feature.coordinates as [number, number] } as ResourceMapFeature];
    if (feature.type === "polygon") return [{ ...base, geometryType: "Polygon" as const, coordinates: feature.coordinates as [number, number][] } as ResourceMapFeature];
    return [];
  });
  if (!mapFeatures.length && row.gpsLongitude != null && row.gpsLatitude != null) {
    mapFeatures.push({ id: "gps-point", layer: "location", geometryType: "Point", point: [row.gpsLongitude, row.gpsLatitude] });
  }
  // Explicit public allowlist. Never spread the upstream object: notes, custom
  // fields, financial data, actor identities and storage keys stay server-side.
  return {
    id: row.id, name: row.name, prettyTitle: row.slugs?.[0] ?? null,
    excerpt: row.subtitle, description: row.description, type: row.type,
    priority: row.priority, tags: row.tags, categories: row.categories?.map(name => ({ name })),
    gpsLatitude: row.gpsLatitude, gpsLongitude: row.gpsLongitude, gpsAltitude: row.gpsAltitude,
    updatedAt: row.updatedAt, mapFeatures,
    image: gallery[0] ? inventoryMediaUrl(gallery[0]) : null,
    images: gallery.map(inventoryMediaUrl), mediaPreviews, mediaPosters,
  };
}
