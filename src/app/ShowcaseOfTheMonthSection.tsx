import ShowcaseOfTheMonthCarousel from "./ShowcaseOfTheMonthCarousel";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { buildShowcasePath } from "@/lib/showcase-path";
import {
  getResourcePosterUrl,
  getResourcePreviewUrl,
  normalizeResourceMediaPosters,
  normalizeResourceMediaPreviews,
} from "@/lib/resource-media";
import { SHOWCASE_RESOURCE_TYPE } from "@/lib/showcase-resource-type";

type ShowcaseOfTheMonthRow = {
  id: string;
  pretty_title: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  media_previews?: unknown;
  media_posters?: unknown;
  tags: string[] | null;
  workshop_resource_id: string | null;
};

const SHOWCASE_OF_THE_MONTH_TAG = "showcaseofthemonth";

const loadShowcasesOfTheMonth = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("resources")
      .select(
        "id, pretty_title, name, description, image, images, media_previews, media_posters, tags, workshop_resource_id",
      )
      .ilike("type", SHOWCASE_RESOURCE_TYPE)
      .contains("tags", [SHOWCASE_OF_THE_MONTH_TAG])
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(8);

    const rows = (data ?? []) as ShowcaseOfTheMonthRow[];
    const workshopIds = Array.from(
      new Set(
        rows
          .map((row) => row.workshop_resource_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    );
    const { data: workshopRows } = workshopIds.length
      ? await supabase
          .from("resources")
          .select("id, name")
          .in("id", workshopIds)
      : { data: [] };
    const workshopById = new Map(
      (workshopRows ?? [])
        .filter(
          (row): row is { id: string; name: string | null } =>
            typeof row.id === "string",
        )
        .map((row) => [row.id, row.name ?? null]),
    );

    return rows.map((row) => {
      const mediaUrl = row.images?.find(Boolean) ?? row.image;
      return {
      id: row.id,
      prettyTitle: row.pretty_title,
      name: row.name,
      description: row.description ?? undefined,
      mediaUrl,
      previewMediaUrl: getResourcePreviewUrl(
        mediaUrl,
        normalizeResourceMediaPreviews(row.media_previews),
      ),
      posterUrl: getResourcePosterUrl(
        mediaUrl,
        normalizeResourceMediaPosters(row.media_posters),
      ),
      workshopName:
        row.workshop_resource_id != null
          ? (workshopById.get(row.workshop_resource_id) ?? null)
          : null,
      tags:
        row.tags?.filter(
          (tag) => tag.trim().toLowerCase() !== SHOWCASE_OF_THE_MONTH_TAG,
        ) ?? [],
      };
    });
  } catch {
    return [] as Array<{
      id: string;
      prettyTitle: string | null;
      name: string;
      description?: string;
      mediaUrl?: string | null;
      previewMediaUrl?: string | null;
      posterUrl?: string | null;
      workshopName?: string | null;
      tags?: string[];
    }>;
  }
};

export default async function ShowcaseOfTheMonthSection() {
  const { tx, locale } = await getServerI18n();
  const showcases = await loadShowcasesOfTheMonth();

  if (showcases.length === 0) {
    return null;
  }

  return (
    <ShowcaseOfTheMonthCarousel
      showcases={showcases.map((showcase) => ({
        ...showcase,
        href: localizePathname(buildShowcasePath(showcase), locale),
        ctaLabel: tx("Zum Beitrag", "de"),
      }))}
    />
  );
}
