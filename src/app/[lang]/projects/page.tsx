/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  faArrowRight,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "../components/Button";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProjectPath } from "@/lib/project-path";
import {
  getResourceMediaKindFromUrl,
  getSupabaseRenderedImageUrl,
  isVideoUrl,
} from "@/lib/resource-media";
import { loadProjects } from "./project-data";

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

const PROJECT_OF_THE_MONTH_TAG = "projectofthemonth";

const hasProjectOfTheMonthTag = (tags?: string[] | null) =>
  tags?.some(
    (tag) => tag.trim().toLowerCase() === PROJECT_OF_THE_MONTH_TAG,
  ) ?? false;

export default async function ProjectsPage() {
  const [{ tx, locale }, supabase, projects] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadProjects(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectOfTheMonth =
    projects.find((project) => hasProjectOfTheMonthTag(project.tags)) ?? null;
  const orderedProjects = projectOfTheMonth
    ? [
        projectOfTheMonth,
        ...projects.filter((project) => project.id !== projectOfTheMonth.id),
      ]
    : projects;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {tx("Projekte", "de")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
            {tx(
              "Hier kannst du Projekte, Umbauten und Prototypen unserer Werkstätten entdecken.",
              "de",
            )}
          </p>
        </div>

        {user ? (
          <Button
            href={localizePathname("/projects/new", locale)}
            kind="primary"
          >
            {tx("Neues Projekt", "de")}
          </Button>
        ) : null}
      </header>

      {projects.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600 shadow-sm">
          {tx("Es gibt noch keine Projekte.", "de")}
        </section>
      ) : (
        <section className="grid gap-5 md:auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
          {orderedProjects.map((project) => {
            const isProjectOfTheMonth =
              projectOfTheMonth?.id === project.id &&
              hasProjectOfTheMonthTag(project.tags);
            const previewText = project.description
              ? truncate(
                  stripMarkdown(project.description),
                  isProjectOfTheMonth ? 280 : 180,
                )
              : tx("Noch keine Beschreibung hinterlegt.", "de");
            const heroMediaUrl =
              project.images?.find(Boolean) ?? project.image ?? null;
            const heroMediaKind = getResourceMediaKindFromUrl(heroMediaUrl);
            const heroMediaIsVideo = isVideoUrl(heroMediaUrl);
            const heroThumbnailUrl =
              heroMediaUrl && heroMediaKind === "image"
                ? getSupabaseRenderedImageUrl(heroMediaUrl, {
                    width: 960,
                    resize: "cover",
                  })
                : heroMediaUrl;
            const articleLink = localizePathname(buildProjectPath(project), locale);
            const projectDetails = (
              <div
                className={`flex flex-1 flex-col gap-4 ${
                  isProjectOfTheMonth ? "relative p-6 md:p-7" : "p-5"
                }`}
              >
                <div className="space-y-3">
                  <div
                    className={`flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      isProjectOfTheMonth ? "text-sky-900/70" : "text-zinc-500"
                    }`}
                  >
                    {isProjectOfTheMonth ? (
                      <span className="rounded-full bg-sky-950 px-3 py-1 text-[10px] text-white shadow-sm">
                        {tx("Projekt des Monats", "de")}
                      </span>
                    ) : null}
                    {project.workshopResource?.name ? (
                      <span>{project.workshopResource.name}</span>
                    ) : null}
                  </div>
                  <h2
                    className={`font-semibold tracking-tight text-zinc-950 ${
                      isProjectOfTheMonth ? "text-2xl md:text-3xl" : "text-xl"
                    }`}
                  >
                    <Link href={articleLink}>{project.name}</Link>
                  </h2>
                  <p
                    className={`leading-relaxed ${
                      isProjectOfTheMonth
                        ? "max-w-2xl text-sm text-zinc-700 md:text-base"
                        : "text-sm text-zinc-600"
                    }`}
                  >
                    {previewText}
                  </p>
                </div>

                <div
                  className={`mt-auto flex items-center justify-end pt-4 ${
                    isProjectOfTheMonth
                      ? "border-t border-white/50 text-sm text-sky-900/70"
                      : "border-t border-zinc-100 text-xs text-zinc-500"
                  }`}
                >
                  <Link
                    href={articleLink}
                    className={`inline-flex items-center gap-2 font-semibold ${
                      isProjectOfTheMonth
                        ? "text-sky-900 hover:text-sky-950"
                        : "text-blue-700 hover:text-blue-800"
                    }`}
                  >
                    <span>{tx("Zum Projekt", "de")}</span>
                    <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
            const projectMedia = (
              <Link
                href={articleLink}
                className={`block ${
                  isProjectOfTheMonth ? "relative h-full md:min-h-[320px]" : ""
                }`}
              >
                {heroMediaUrl ? (
                  <div
                    className={`relative ${
                      isProjectOfTheMonth
                        ? "h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_45%),linear-gradient(135deg,rgba(14,165,233,0.2)_0%,rgba(251,191,36,0.18)_100%)]"
                        : ""
                    }`}
                  >
                    {heroMediaIsVideo ? (
                      <>
                        <video
                          src={heroMediaUrl}
                          className={`${
                            isProjectOfTheMonth
                              ? "h-full min-h-[260px] w-full bg-zinc-950 object-cover"
                              : "aspect-[4/3] w-full bg-zinc-950 object-cover"
                          }`}
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-700">
                          {tx("Video", "de")}
                        </span>
                      </>
                    ) : heroMediaKind === "document" ? (
                      <div
                        className={`flex w-full flex-col items-center justify-center bg-rose-50 text-rose-700 ${
                          isProjectOfTheMonth
                            ? "h-full min-h-[260px]"
                            : "aspect-[4/3]"
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
                          isProjectOfTheMonth
                            ? "h-full min-h-[260px] w-full object-cover"
                            : "aspect-[4/3] w-full object-cover"
                        }`}
                      />
                    )}
                  </div>
                ) : (
                  <div
                    className={`flex w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.24em] ${
                      isProjectOfTheMonth
                        ? "h-full min-h-[260px] bg-[radial-gradient(circle_at_top_left,#ffffff_0%,transparent_38%),linear-gradient(135deg,#dbeafe_0%,#fef3c7_52%,#dcfce7_100%)] text-sky-900/70"
                        : "aspect-[4/3] bg-[linear-gradient(135deg,#e6f0ff_0%,#fdf7e8_100%)] text-zinc-500"
                    }`}
                  >
                    {tx("Projekt", "de")}
                  </div>
                )}
              </Link>
            );

            return (
              <article
                key={project.id}
                className={`group overflow-hidden rounded-2xl border transition ${
                  isProjectOfTheMonth
                    ? "relative isolate md:col-span-2 xl:col-span-2 md:grid md:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)] bg-[linear-gradient(135deg,rgba(240,249,255,0.98)_0%,rgba(255,247,237,0.98)_54%,rgba(236,253,245,0.96)_100%)] border-sky-200"
                    : "flex h-full flex-col border-zinc-200 bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                }`}
              >
                {isProjectOfTheMonth ? (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -left-12 top-0 h-36 w-36 rounded-full bg-sky-200/70 blur-3xl"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 right-12 h-32 w-32 rounded-full bg-amber-200/70 blur-3xl"
                    />
                  </>
                ) : null}

                {isProjectOfTheMonth ? (
                  <>
                    {projectMedia}
                    {projectDetails}
                  </>
                ) : (
                  <>
                    {projectMedia}
                    {projectDetails}
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
