/* eslint-disable @next/next/no-img-element */

import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import {
  getResourcePosterUrl,
  getResourcePreviewUrl,
  isImageMediaUrl,
  isVideoUrl,
  normalizeResourceMediaPosters,
  normalizeResourceMediaPreviews,
} from "@/lib/resource-media";
import Button from "./[lang]/components/Button";

type ResourceOfTheMonthRow = {
  id: string;
  pretty_title: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  media_previews?: unknown;
  media_posters?: unknown;
  type: string | null;
  tags: string[] | null;
};

const RESOURCE_OF_THE_MONTH_TAG = "resourceofthemonth";

const truncateText = (text: string, maxLength: number) => {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const loadResourceOfTheMonth = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("resources")
      .select(
        "id, pretty_title, name, description, image, images, media_previews, media_posters, type, tags",
      )
      .contains("tags", [RESOURCE_OF_THE_MONTH_TAG])
      .order("priority", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<ResourceOfTheMonthRow>();

    if (error || !data) {
      return null;
    }

    const media =
      data.images?.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ) ?? [];
    if (media.length === 0 && data.image?.trim()) {
      media.push(data.image);
    }

    const lastMedia = media.at(-1) ?? null;
    const lastPhoto =
      media.filter((item) => isImageMediaUrl(item)).at(-1) ?? null;
    const videoUrl = isVideoUrl(lastMedia) ? lastMedia : null;

    return {
      id: data.id,
      prettyTitle: data.pretty_title,
      name: data.name,
      description: data.description,
      image: lastPhoto,
      video: videoUrl
        ? (getResourcePreviewUrl(
            videoUrl,
            normalizeResourceMediaPreviews(data.media_previews),
          ) ?? videoUrl)
        : null,
      videoPoster: videoUrl
        ? getResourcePosterUrl(
            videoUrl,
            normalizeResourceMediaPosters(data.media_posters),
          )
        : null,
      type: data.type?.trim() ?? null,
      tags:
        data.tags?.filter(
          (tag) => tag.trim().toLowerCase() !== RESOURCE_OF_THE_MONTH_TAG,
        ) ?? [],
    };
  } catch {
    return null;
  }
};

export default async function ResourceOfTheMonthSection() {
  const { tx, locale } = await getServerI18n();
  const resourceOfTheMonth = await loadResourceOfTheMonth();

  if (!resourceOfTheMonth) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-lg bg-[#559f62]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,460px)] lg:items-stretch">
        <div className="relative z-10 flex flex-col justify-center px-6 py-7 md:px-8 md:py-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#102a1a]">
            {tx("Ressource des Monats", "de")}
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-[#08140c] md:text-4xl">
            {resourceOfTheMonth.name}
          </h2>
          {/* resourceOfTheMonth.type ? (
            <p className="mt-3 text-sm font-medium uppercase tracking-[0.12em] text-zinc-500">
              {resourceOfTheMonth.type}
            </p>
          ) : null */}
          {resourceOfTheMonth.description ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#102a1a] md:text-base">
              {truncateText(resourceOfTheMonth.description, 260)}
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#102a1a] md:text-base">
              {tx(
                "Entdecke ein ausgewähltes Werkzeug, Material oder Möbelstück aus unserem Inventar.",
                "de",
              )}
            </p>
          )}

          {resourceOfTheMonth.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {resourceOfTheMonth.tags.slice(0, 4).map((tag) => (
                <span
                  key={`${resourceOfTheMonth.id}-${tag}`}
                  className="rounded-full border border-[#102a1a]/20 bg-[#d4ead1]/80 px-3 py-1 text-xs font-semibold text-[#102a1a] backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <Button
              href={localizePathname(
                buildResourcePath({
                  id: resourceOfTheMonth.id,
                  prettyTitle: resourceOfTheMonth.prettyTitle,
                }),
                locale,
              )}
              kind="primary"
              size="medium"
              className="!bg-[#102a1a] !text-white hover:!bg-[#07180d]"
              icon={faArrowRight}
              iconPosition="right"
            >
              {tx("Zur Ressource", "de")}
            </Button>
          </div>
        </div>

        <div
          className={`relative min-h-[390px] min-w-0 overflow-hidden bg-[#559f62] lg:min-h-full ${
            resourceOfTheMonth.video ? "lg:static lg:overflow-visible" : ""
          }`}
        >
          {resourceOfTheMonth.video ? (
            <>
              {resourceOfTheMonth.image ? (
                <img
                  src={resourceOfTheMonth.image}
                  alt={resourceOfTheMonth.name}
                  className="absolute inset-0 h-full w-full object-cover lg:hidden"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#9bcba0_0%,transparent_36%),linear-gradient(160deg,#559f62_0%,#24522e_100%)] lg:hidden" />
              )}
              <video
                src={resourceOfTheMonth.video}
                poster={resourceOfTheMonth.videoPoster ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={resourceOfTheMonth.name}
                className="absolute inset-y-0 right-0 z-0 hidden h-full w-auto max-w-none object-contain object-right lg:block"
              />
              <div className="pointer-events-none absolute inset-0 z-[1] hidden lg:block lg:bg-[linear-gradient(90deg,#559f62_0%,rgba(85,159,98,0.98)_36%,rgba(85,159,98,0.55)_52%,transparent_70%)]" />
            </>
          ) : resourceOfTheMonth.image ? (
            <>
              <img
                src={resourceOfTheMonth.image}
                alt={resourceOfTheMonth.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 hidden shadow-[inset_100px_0_60px_-20px_#559f62] lg:block" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#9bcba0_0%,transparent_36%),linear-gradient(160deg,#559f62_0%,#24522e_100%)]" />
          )}
        </div>
      </div>
    </section>
  );
}
