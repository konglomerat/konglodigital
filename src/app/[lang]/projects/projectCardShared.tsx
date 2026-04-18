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
  videoLabel: string;
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
  copy: Pick<ProjectCardCopy, "projectLabel" | "videoLabel">;
  featured?: boolean;
};

export function ProjectCardMedia({
  articleLink,
  project,
  copy,
  featured = false,
}: ProjectCardMediaProps) {
  const heroMediaUrl = project.images?.find(Boolean) ?? project.image ?? null;
  const heroMediaKind = getResourceMediaKindFromUrl(heroMediaUrl);
  const heroMediaIsVideo = isVideoUrl(heroMediaUrl);
  const heroThumbnailUrl =
    heroMediaUrl && heroMediaKind === "image"
      ? getSupabaseRenderedImageUrl(heroMediaUrl, {
          width: 960,
          resize: "cover",
        })
      : heroMediaUrl;

  return (
    <Link
      href={articleLink}
      className={`block ${featured ? "relative h-full md:min-h-[320px]" : ""}`}
    >
      {heroMediaUrl ? (
        <div
          className={`relative ${
            featured
              ? "h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_45%),linear-gradient(135deg,rgba(14,165,233,0.2)_0%,rgba(251,191,36,0.18)_100%)]"
              : ""
          }`}
        >
          {heroMediaIsVideo ? (
            <>
              <video
                src={heroMediaUrl}
                className={`${
                  featured
                    ? "h-full min-h-[260px] w-full bg-zinc-950 object-cover"
                    : "aspect-[4/3] w-full bg-zinc-950 object-cover"
                }`}
                muted
                playsInline
                preload="metadata"
              />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-700">
                {copy.videoLabel}
              </span>
            </>
          ) : heroMediaKind === "document" ? (
            <div
              className={`flex w-full flex-col items-center justify-center bg-rose-50 text-rose-700 ${
                featured ? "h-full min-h-[260px]" : "aspect-[4/3]"
              }`}
            >
              <FontAwesomeIcon icon={faFilePdf} className="h-10 w-10" />
              <span className="mt-3 text-xs font-semibold uppercase tracking-[0.2em]">
                PDF
              </span>
            </div>
          ) : (
            <img
              src={heroThumbnailUrl ?? heroMediaUrl}
              alt={project.name}
              className={`${
                featured
                  ? "h-full min-h-[260px] w-full object-cover"
                  : "aspect-[4/3] w-full object-cover"
              }`}
            />
          )}
        </div>
      ) : (
        <div
          className={`flex w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.24em] ${
            featured
              ? "h-full min-h-[260px] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,transparent_38%),linear-gradient(135deg,#dbeafe_0%,#fef3c7_52%,#dcfce7_100%)] text-sky-900/70"
              : "aspect-[4/3] bg-[linear-gradient(135deg,#e6f0ff_0%,#fdf7e8_100%)] text-zinc-500"
          }`}
        >
          {copy.projectLabel}
        </div>
      )}
    </Link>
  );
}
