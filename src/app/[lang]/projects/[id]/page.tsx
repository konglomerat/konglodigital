/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Button from "../../components/Button";
import MediaLightboxGallery from "../../components/MediaLightboxGallery";
import ShareButton from "../../components/ShareButton";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { buildProjectPath } from "@/lib/project-path";
import { renderSimpleMarkdown } from "@/lib/simple-markdown";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
import { loadProjectByIdentifier } from "../project-data";
import { buildResourcePath } from "@/lib/resource-pretty-title";

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang?: string }>;
}) {
  const { id, lang } = await params;
  const locale = lang === "en" ? "en" : "de";
  const [{ tx }, supabase, project] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadProjectByIdentifier(id),
  ]);

  if (!project) {
    notFound();
  }

  const canonicalPath = localizePathname(buildProjectPath(project), locale);
  const currentPath = localizePathname(`/projects/${id}`, locale);
  if (canonicalPath !== currentPath) {
    redirect(canonicalPath);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canEdit = Boolean(
    user && (project.ownerId === user.id || hasRight(user, "resources:edit")),
  );
  const heroMedia =
    project.images?.filter(
      (media): media is string => typeof media === "string",
    ) ?? (project.image ? [project.image] : []);
  const renderedMarkdown = renderSimpleMarkdown(project.description ?? "");
  const hasTags = Boolean(project.tags && project.tags.length > 0);
  const hasProjectLinks = Boolean(
    project.projectLinks && project.projectLinks.length > 0,
  );
  const hasRelatedResources = Boolean(
    project.relatedResources && project.relatedResources.length > 0,
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="space-y-4 px-6 py-2 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {project.workshopResource?.name ?? tx("Projekt", "de")}
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
              {project.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShareButton
              title={project.name}
              text={tx("Schau dir dieses Projekt an.", "de")}
            />
            <Button
              href={localizePathname("/projects", locale)}
              kind="secondary"
            >
              {tx("Zur Projektübersicht", "de")}
            </Button>
            {canEdit ? (
              <Button
                href={localizePathname(`/projects/edit/${project.id}`, locale)}
                kind="primary"
              >
                {tx("Bearbeiten", "de")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          {formatDate(project.updatedAt ?? project.createdAt) ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
              {formatDate(project.updatedAt ?? project.createdAt)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.72fr)] lg:items-start">
        <article className="space-y-8">
          <MediaLightboxGallery
            media={heroMedia}
            title={project.name}
            closeLabel={tx("Schließen", "de")}
            previousLabel={tx("Zurück", "de")}
            nextLabel={tx("Weiter", "de")}
            variant="project"
          />

          <section className="px-6 py-2 md:px-8">
            <div
              className="prose prose-zinc max-w-none prose-headings:font-semibold prose-a:text-blue-700 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-blue-800 prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 prose-blockquote:pl-4"
              dangerouslySetInnerHTML={{
                __html:
                  renderedMarkdown ||
                  `<p>${tx("Für dieses Projekt wurde noch keine Beschreibung hinterlegt.", "de")}</p>`,
              }}
            />
          </section>

          {hasTags ? (
            <section className="px-6 py-2 md:px-8">
              <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
                {project.tags?.map((tag) => (
                  <span
                    key={`${project.id}-${tag}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="space-y-5 lg:sticky lg:top-8">
          <section className="px-5 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Autor", "de")}
            </p>
            {project.author ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-4">
                  {project.author.avatarUrl ? (
                    <img
                      src={project.author.avatarUrl}
                      alt={project.author.name}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                      {project.author.initials}
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-semibold text-zinc-950">
                      {project.author.name}
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-zinc-600">
                  {project.author.bio ??
                    tx(
                      "Für dieses Profil ist noch keine Kurzbiografie hinterlegt.",
                      "de",
                    )}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">
                {tx("Autorinformationen sind aktuell nicht verfügbar.", "de")}
              </p>
            )}
          </section>

          <section className="px-5 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Projektinfos", "de")}
            </p>
            <div className="mt-4 space-y-4 text-sm text-zinc-700">
              <div>
                <p className="font-semibold text-zinc-950">
                  {tx("Werkstatt", "de")}
                </p>
                {project.workshopResource ? (
                  <Link
                    href={localizePathname(
                      buildResourcePath({
                        id: project.workshopResource.id,
                        prettyTitle: project.workshopResource.prettyTitle,
                      }),
                      locale,
                    )}
                    className="mt-1 inline-flex text-blue-700 hover:text-blue-800"
                  >
                    {project.workshopResource.name ??
                      project.workshopResource.id}
                  </Link>
                ) : (
                  <p className="mt-1 text-zinc-500">
                    {tx("Keine Werkstatt verknüpft", "de")}
                  </p>
                )}
              </div>

              <div>
                <p className="font-semibold text-zinc-950">
                  {tx("Aktualisiert", "de")}
                </p>
                <p className="mt-1 text-zinc-500">
                  {formatDate(project.updatedAt ?? project.createdAt) ?? "-"}
                </p>
              </div>
            </div>
          </section>

          {hasProjectLinks ? (
            <section className="px-5 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {tx("Links", "de")}
              </p>
              <div className="mt-4 grid gap-3">
                {project.projectLinks?.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    target={link.url.startsWith("http") ? "_blank" : undefined}
                    rel={link.url.startsWith("http") ? "noreferrer" : undefined}
                    className="block text-sm text-blue-700 transition hover:text-blue-800"
                  >
                    <span className="block font-semibold">{link.label}</span>
                    <span className="mt-1 block break-all text-xs text-blue-600">
                      {link.url}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {hasRelatedResources ? (
            <section className="px-5 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {tx("Verwendete Ressourcen", "de")}
              </p>
              <div className="mt-4 grid gap-3">
                {project.relatedResources?.map((resource) => (
                  <Link
                    key={resource.id}
                    href={localizePathname(
                      buildResourcePath({
                        id: resource.id,
                        prettyTitle: resource.prettyTitle,
                      }),
                      locale,
                    )}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 text-sm text-zinc-700 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    {resource.image ? (
                      <img
                        src={resource.image}
                        alt={resource.name ?? resource.id}
                        className="h-14 w-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-200 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {tx("Bild", "de")}
                      </div>
                    )}
                    <span className="min-w-0 font-medium leading-snug">
                      {resource.name ?? resource.id}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
