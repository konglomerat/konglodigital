/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import Divider from "@/components/knglmrt/Divider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { buildShowcasePath } from "@/lib/showcase-path";
import {
  SHOWCASE_RESOURCE_TYPE,
  isShowcaseResourceType,
} from "@/lib/showcase-resource-type";
import {
  getResourcePosterUrl,
  isImageMediaUrl,
  normalizeResourceMediaPosters,
} from "@/lib/resource-media";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import Button from "@/components/knglmrt/Button";

// Redaktionell gesetzte Beiträge: Wer einen Artikel auf der Startseite zeigen
// will, hängt diesen Tag an die Ressource. Ohne getaggte Beiträge fällt die
// Sektion auf die vier neuesten Showcase-Beiträge zurück, damit die Startseite
// nie mit einer Lücke dasteht.
const NEWS_TAG = "wasgibtsneues";
const NEWS_COUNT = 4;

type NewsRow = {
  id: string;
  pretty_title: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  media_posters?: unknown;
  type: string | null;
  tags: string[] | null;
};

const NEWS_COLUMNS =
  "id, pretty_title, name, description, image, images, media_posters, type, tags";

const truncateText = (text: string, maxLength: number) => {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const toArticle = (row: NewsRow) => {
  const media =
    row.images?.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    ) ?? [];
  if (media.length === 0 && row.image?.trim()) {
    media.push(row.image);
  }

  const firstMedia = media[0] ?? null;
  const image =
    media.find((item) => isImageMediaUrl(item)) ??
    getResourcePosterUrl(
      firstMedia,
      normalizeResourceMediaPosters(row.media_posters),
    );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image,
    path: isShowcaseResourceType(row.type)
      ? buildShowcasePath({ id: row.id, prettyTitle: row.pretty_title })
      : buildResourcePath({ id: row.id, prettyTitle: row.pretty_title }),
    tag:
      row.tags?.find((tag) => tag.trim().toLowerCase() !== NEWS_TAG)?.trim() ??
      null,
  };
};

const loadNews = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("resources")
      .select(NEWS_COLUMNS)
      .contains("tags", [NEWS_TAG])
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(NEWS_COUNT);

    const tagged = (data ?? []) as NewsRow[];
    if (tagged.length > 0) {
      return tagged.map(toArticle);
    }

    const { data: fallback } = await supabase
      .from("resources")
      .select(NEWS_COLUMNS)
      .ilike("type", SHOWCASE_RESOURCE_TYPE)
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(NEWS_COUNT);

    return ((fallback ?? []) as NewsRow[]).map(toArticle);
  } catch {
    return [];
  }
};

export default async function NewsSection() {
  const { tx, locale } = await getServerI18n();
  const articles = await loadNews();

  if (articles.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="was-gibts-neues"
      className="px-6 py-8 md:px-10 md:py-10"
    >
      <h2 id="was-gibts-neues" className="mb-1.5">
        {tx("Was gibt's Neues", "de")}
      </h2>
      <div className="mb-7 max-w-[520px]">
        <Divider number={5} height={14} color="var(--primary)" repeat />
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <li key={article.id} className="flex">
            <Link
              href={localizePathname(article.path, locale)}
              className="knglmrt-terrazzo-hover group flex w-full flex-col border-2 border-[var(--primary-hairline)] bg-card transition-colors duration-300 ease-out hover:border-[var(--knglmrt-pink-60)] focus-visible:border-[var(--knglmrt-pink-60)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden border-b-2 border-[var(--primary-hairline)] bg-muted">
                {article.image ? (
                  <img
                    src={article.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center font-display text-5xl leading-none text-primary"
                  >
                    {article.name.charAt(0)}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
                {article.tag ? (
                  <span className="knglmrt-tag text-primary">
                    {article.tag}
                  </span>
                ) : null}
                <span className="knglmrt-card-title min-w-0">
                  {article.name}
                </span>
                {article.description ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {truncateText(article.description, 110)}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <Button
          href="/showcase"
          kind="tertiary"
          icon={faArrowRight}
          iconPosition="right"
        >
          {tx("Alle Beiträge", "de")}
        </Button>
      </div>
    </section>
  );
}
