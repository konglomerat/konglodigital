/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { localizePathname, type Locale } from "@/i18n/config";
import { buildProjectPath } from "@/lib/project-path";
import {
  getResourceMediaKindFromUrl,
  getSupabaseRenderedImageUrl,
  isVideoUrl,
} from "@/lib/resource-media";
import type { ProjectRecord } from "./project-data";

export type ProjectCardCopy = {
  missingDescriptionLabel: string;
  openProjectLabel: string;
  projectLabel: string;
  projectOfTheMonthLabel: string;
};

export type ProjectCardProps = {
  project: ProjectRecord;
  locale: Locale;
  copy: ProjectCardCopy;
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

export const getProjectArticleLink = (
  project: Pick<ProjectRecord, "id" | "prettyTitle">,
  locale: Locale,
) => localizePathname(buildProjectPath(project), locale);

export const getProjectPreviewText = (
  project: Pick<ProjectRecord, "description">,
  maxLength: number,
  fallback: string,
) => {
  if (!project.description) {
    return fallback;
  }

  return truncate(stripMarkdown(project.description), maxLength);
};

type ProjectCardMediaProps = {
  articleLink: string;
  project: ProjectRecord;
  copy: Pick<ProjectCardCopy, "projectLabel">;
  featured?: boolean;
};

export function ProjectCardMedia({
  articleLink,
  project,
  copy,
  featured = false,
}: ProjectCardMediaProps) {
  const mediaItems =
    project.images?.filter(
      (media): media is string => typeof media === "string" && Boolean(media),
    ) ?? (project.image ? [project.image] : []);
  const heroMediaUrl = mediaItems[0] ?? null;
  const hoverMediaUrl = mediaItems[1] ?? null;
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
      : heroMediaUrl;
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
              src={heroMediaUrl}
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
                alt={project.name}
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
          {copy.projectLabel}
        </div>
      )}
    </Link>
  );
}
