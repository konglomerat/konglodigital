/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
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

export default async function ProjectsPage() {
  const [{ tx, locale }, supabase, projects] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadProjects(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const previewText = project.description
              ? truncate(stripMarkdown(project.description), 180)
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

            return (
              <article
                key={project.id}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link
                  href={localizePathname(buildProjectPath(project), locale)}
                  className="block"
                >
                  {heroMediaUrl ? (
                    <div className="relative">
                      {heroMediaIsVideo ? (
                        <>
                          <video
                            src={heroMediaUrl}
                            className="aspect-[4/3] w-full bg-zinc-950 object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-700">
                            {tx("Video", "de")}
                          </span>
                        </>
                      ) : heroMediaKind === "document" ? (
                        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center bg-rose-50 text-rose-700">
                          <FontAwesomeIcon
                            icon={faFilePdf}
                            className="h-10 w-10"
                          />
                          <span className="mt-3 text-xs font-semibold uppercase tracking-[0.2em]">
                            PDF
                          </span>
                        </div>
                      ) : (
                        <img
                          src={heroThumbnailUrl ?? heroMediaUrl}
                          alt={project.name}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-[linear-gradient(135deg,#e6f0ff_0%,#fdf7e8_100%)] text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      {tx("Projekt", "de")}
                    </div>
                  )}
                </Link>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {project.workshopResource?.name ? (
                        <span>{project.workshopResource.name}</span>
                      ) : null}
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                      <Link
                        href={localizePathname(
                          buildProjectPath(project),
                          locale,
                        )}
                      >
                        {project.name}
                      </Link>
                    </h2>
                    <p className="text-sm leading-relaxed text-zinc-600">
                      {previewText}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-end border-t border-zinc-100 pt-4 text-xs text-zinc-500">
                    <Link
                      href={localizePathname(buildProjectPath(project), locale)}
                      className="font-semibold text-blue-700 hover:text-blue-800"
                    >
                      {tx("Zum Projekt", "de")}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
