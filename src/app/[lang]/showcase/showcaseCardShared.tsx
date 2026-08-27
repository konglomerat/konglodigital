/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { localizePathname, type Locale } from "@/i18n/config";
import { buildShowcasePath } from "@/lib/showcase-path";
import {
  getResourcePosterUrl,
  getResourcePreviewUrl,
  getResourceMediaKindFromUrl,
  getSupabaseRenderedImageUrl,
  isVideoUrl,
} from "@/lib/resource-media";
import type { ShowcaseRecord } from "./showcase-data";

export type ShowcaseCardCopy = {
  missingDescriptionLabel: string;
  openShowcaseLabel: string;
  showcaseLabel: string;
  showcaseOfTheMonthLabel: string;
};

export type ShowcaseCardProps = {
  showcase: ShowcaseRecord;
  locale: Locale;
  copy: ShowcaseCardCopy;
};

const stripMarkdown = (value: string) =>
  value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

export const getShowcaseArticleLink = (
  showcase: Pick<ShowcaseRecord, "id" | "prettyTitle">,
  locale: Locale,
) => localizePathname(buildShowcasePath(showcase), locale);

export const getShowcasePreviewText = (
  showcase: Pick<ShowcaseRecord, "description">,
  maxLength: number,
  fallback: string,
) => {
  if (!showcase.description) {
    return fallback;
  }

  return truncate(stripMarkdown(showcase.description), maxLength);
};

type ShowcaseCardMediaProps = {
  articleLink: string;
  showcase: ShowcaseRecord;
  copy: Pick<ShowcaseCardCopy, "showcaseLabel">;
  featured?: boolean;
};

export function ShowcaseCardMedia({
  articleLink,
  showcase,
  copy,
  featured = false,
}: ShowcaseCardMediaProps) {
  const mediaItems =
    showcase.images?.filter(
      (media): media is string => typeof media === "string" && Boolean(media),
    ) ?? (showcase.image ? [showcase.image] : []);
  const heroMediaUrl = mediaItems[0] ?? null;
  const hoverMediaUrl = mediaItems[1] ?? null;
  const heroPreviewUrl = getResourcePreviewUrl(
    heroMediaUrl,
    showcase.mediaPreviews,
  );
  const heroPosterUrl = getResourcePosterUrl(
    heroMediaUrl,
    showcase.mediaPosters,
  );
  const heroMediaKind = getResourceMediaKindFromUrl(heroMediaUrl);
  const hoverMediaKind = getResourceMediaKindFromUrl(hoverMediaUrl);
  const heroMediaIsVideo = isVideoUrl(heroMediaUrl);
  const canRenderHeroImage =
    heroMediaKind !== "video" && heroMediaKind !== "document";
  const canRenderHoverImage =
    hoverMediaKind !== "video" && hoverMediaKind !== "document";
  const hasHoverImage =
    canRenderHeroImage && canRenderHoverImage && Boolean(hoverMediaUrl);
  const heroThumbnailUrl =
    heroMediaUrl && heroMediaKind === "image"
      ? getSupabaseRenderedImageUrl(heroMediaUrl, {
          width: 960,
          resize: "cover",
        })
      : heroPreviewUrl;
  const hoverThumbnailUrl =
    hasHoverImage && hoverMediaUrl
      ? hoverMediaKind === "image"
        ? getSupabaseRenderedImageUrl(hoverMediaUrl, {
            width: 960,
            resize: "cover",
          })
        : hoverMediaUrl
      : null;

  return (
    <Link
      href={articleLink}
      className={`block ${featured ? "relative h-full md:min-h-[320px]" : ""}`}
    >
      {heroMediaUrl ? (
        <div
          className={`relative ${
            featured
              ? "h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_45%),linear-gradient(135deg,rgba(14,165,233,0.2)_0%,rgba(251,191,36,0.18)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(224,242,254,0.12)_0%,rgba(224,242,254,0)_45%),linear-gradient(135deg,rgba(2,132,199,0.18)_0%,rgba(8,47,73,0.32)_100%)]"
              : ""
          }`}
        >
          {heroMediaIsVideo ? (
            <video
              src={heroPreviewUrl ?? heroMediaUrl}
              poster={heroPosterUrl ?? undefined}
              className={`${
                featured
                  ? "h-full min-h-[260px] w-full bg-foreground object-cover"
                  : "aspect-[4/3] w-full bg-foreground object-cover"
              }`}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : heroMediaKind === "document" ? (
            <div
              className={`flex w-full flex-col items-center justify-center bg-destructive-soft text-destructive ${
                featured ? "h-full min-h-[260px]" : "aspect-[4/3]"
              }`}
            >
              <FontAwesomeIcon icon={faFilePdf} className="h-10 w-10" />
              <span className="mt-3 text-xs font-semibold uppercase tracking-[0.2em]">
                PDF
              </span>
            </div>
          ) : (
            <div className="relative">
              <img
                src={heroThumbnailUrl ?? heroMediaUrl}
                alt={showcase.name}
                loading={featured ? "eager" : "lazy"}
                fetchPriority={featured ? "high" : "auto"}
                decoding="async"
                className={`${
                  featured
                    ? "h-full min-h-[260px] w-full object-cover"
                    : "aspect-[4/3] w-full object-cover"
                }`}
              />
              {hasHoverImage && hoverThumbnailUrl ? (
                <img
                  src={hoverThumbnailUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 ${
                    featured
                      ? "h-full min-h-[260px] w-full object-cover"
                      : "aspect-[4/3] w-full object-cover"
                  }`}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.24em] ${
            featured
              ? "h-full min-h-[260px] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,transparent_38%),linear-gradient(135deg,#dbeafe_0%,#fef3c7_52%,#dcfce7_100%)] text-foreground/70 dark:bg-[radial-gradient(circle_at_top_left,rgba(224,242,254,0.12)_0%,transparent_38%),linear-gradient(135deg,#0f172a_0%,#082f49_52%,#164e63_100%)] dark:text-foreground/80"
              : "aspect-[4/3] bg-[linear-gradient(135deg,#e6f0ff_0%,#fdf7e8_100%)] text-muted-foreground dark:bg-[linear-gradient(135deg,#172033_0%,#251710_100%)] dark:text-muted-foreground"
          }`}
        >
          {copy.showcaseLabel}
        </div>
      )}
    </Link>
  );
}
