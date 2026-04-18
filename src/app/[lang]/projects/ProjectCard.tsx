import Link from "next/link";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  getProjectArticleLink,
  getProjectPreviewText,
  ProjectCardMedia,
  type ProjectCardProps,
} from "./projectCardShared";

export default function ProjectCard({
  project,
  locale,
  copy,
}: ProjectCardProps) {
  const articleLink = getProjectArticleLink(project, locale);
  const previewText = getProjectPreviewText(
    project,
    180,
    copy.missingDescriptionLabel,
  );

  return (
    <article className="group flex h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="rounded-2xl bg-white/50 transition  overflow-hidden"
      >
        <ProjectCardMedia
          articleLink={articleLink}
          project={project}
          copy={copy}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 px-1 py-3">
        <div className="space-y-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {project.workshopResource?.name ? (
              <span>{project.workshopResource.name}</span>
            ) : null}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-950 mb-1">
            <Link href={articleLink}>{project.name}</Link>
          </h2>
        </div>

        {/* <div className="mt-auto flex items-center justify-start text-xs text-zinc-500">
          <Link
            href={articleLink}
            className="inline-flex items-center gap-2 font-semibold text-blue-700 hover:text-blue-800"
          >
            <span>{copy.openProjectLabel}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
          </Link>
        </div> */}
      </div>
    </article>
  );
}
