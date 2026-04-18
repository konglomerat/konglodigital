import Link from "next/link";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  getProjectArticleLink,
  getProjectPreviewText,
  ProjectCardMedia,
  type ProjectCardProps,
} from "./projectCardShared";

export default function ProjectOfTheMonthCard({
  project,
  locale,
  copy,
}: ProjectCardProps) {
  const articleLink = getProjectArticleLink(project, locale);
  const previewText = getProjectPreviewText(
    project,
    280,
    copy.missingDescriptionLabel,
  );

  return (
    <article className="group relative isolate h-full overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgba(186,230,253,0.98)_0%,rgba(125,211,252,0.96)_52%,rgba(56,189,248,0.94)_100%)] transition md:col-span-2 md:grid md:grid-cols-[minmax(0,0.6fr)_minmax(200px,0.88fr)] xl:col-span-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 top-0 h-36 w-36 rounded-full bg-white/35 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-12 h-32 w-32 rounded-full bg-sky-500/40 blur-3xl"
      />

      <ProjectCardMedia
        articleLink={articleLink}
        project={project}
        copy={copy}
        featured
      />

      <div className="relative flex flex-1 flex-col gap-4 p-6 md:p-7">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-900/70">
            <span className="rounded-full bg-sky-950 px-2 py-1 text-[10px] text-white shadow-sm">
              {copy.projectOfTheMonthLabel}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl text-pretty">
            <Link href={articleLink}>{project.name}</Link>
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-700 md:text-base">
            {previewText}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-end pt-4 text-sm text-sky-900/70">
          <Link
            href={articleLink}
            className="inline-flex items-center gap-2 font-semibold text-sky-900 hover:text-sky-950"
          >
            <span>{copy.openProjectLabel}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
