import Link from "next/link";

import {
  getProjectArticleLink,
  ProjectCardMedia,
  type ProjectCardProps,
} from "./projectCardShared";

export default function ProjectCard({
  project,
  locale,
  copy,
}: ProjectCardProps) {
  const articleLink = getProjectArticleLink(project, locale);

  return (
    <article className="group flex h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl bg-card/50 transition "
      >
        <ProjectCardMedia
          articleLink={articleLink}
          project={project}
          copy={copy}
        />
      </div>

      <div className="relative flex flex-1 flex-col gap-1 px-1 py-3 pb-2">
        <div className="space-y-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {project.workshopResource?.name ? (
              <span>{project.workshopResource.name}</span>
            ) : null}
          </div>
          <h2 className="mb-1 text-xl font-bold tracking-tight text-foreground ">
            <Link href={articleLink}>{project.name}</Link>
          </h2>
        </div>

        {/* <div className="pointer-events-none h-0 left-1 flex items-center justify-start text-xs text-muted-foreground">
          <Link
            href={articleLink}
            className="pointer-events-none inline-flex translate-y-1 items-center gap-2 font-semibold text-primary opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 hover:text-primary"
          >
            <span>{copy.openProjectLabel}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
          </Link>
        </div> */}
      </div>
    </article>
  );
}
