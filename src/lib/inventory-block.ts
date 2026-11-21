import { getResourcePosterUrl, isImageMediaUrl } from "@/lib/resource-media";

export type InventoryBlockRow = {
  id: string;
  name: string;
  pretty_title: string | null;
  tags: string[] | null;
  type: string | null;
  is_private: boolean | null;
  image: string | null;
  images: string[] | null;
  media_posters?: Record<string, string> | null;
};

/** Match complete tags; separators remain significant for curated groups. */
export const normalizeInventoryTag = (tag: string) => tag.trim().normalize("NFC").toLowerCase();

export type InventoryContentSource = "inventory" | "showcase";

export function selectInventoryItems(rows: InventoryBlockRow[], tag: string, source: InventoryContentSource = "inventory") {
  const normalized = normalizeInventoryTag(tag);
  if (!/[\p{L}\p{N}]/u.test(normalized)) return [];
  return rows.filter(row => (source === "showcase"
      ? row.is_private === false && row.type?.trim().toLowerCase() === "project"
      : !row.is_private && row.type?.trim().toLowerCase() !== "project")
    && row.tags?.some(value => normalizeInventoryTag(value) === normalized))
    .map(row => ({
      id: row.id, name: row.name, prettyTitle: row.pretty_title,
      image: [row.image, ...(row.images ?? [])].find(url => !!url && isImageMediaUrl(url))
        ?? [row.image, ...(row.images ?? [])].map(url => getResourcePosterUrl(url, row.media_posters))
          .find(url => !!url && isImageMediaUrl(url)) ?? null,
    }));
}
