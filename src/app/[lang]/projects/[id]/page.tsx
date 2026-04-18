/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import heroHelloImage from "../../../hero-hello.jpg";
import MediaLightboxGallery from "../../components/MediaLightboxGallery";
import PageTitle from "../../components/PageTitle";
import ShareButton from "../../components/ShareButton";
import type { Locale } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { buildProjectPath } from "@/lib/project-path";
import { renderSimpleMarkdown } from "@/lib/simple-markdown";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
import {
  getResourceMediaKindFromUrl,
  getSupabaseRenderedImageUrl,
  isImageUrl,
} from "@/lib/resource-media";
import { loadProjectByIdentifier } from "../project-data";
import { buildResourcePath } from "@/lib/resource-pretty-title";

const siteTitle = "Konglomerat Digitale Werkstätten";

const loadCachedProject = cache(async (id: string) =>
  loadProjectByIdentifier(id),
);

const normalizeLocale = (lang?: string): Locale =>
  lang === "en" ? "en" : "de";

const stripMarkdown = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)([#>*_~-]+)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const getProjectDescription = (
  project: Awaited<ReturnType<typeof loadProjectByIdentifier>>,
  locale: Locale,
) => {
  const plainDescription = truncateText(
    stripMarkdown(project?.description),
    180,
  );
  if (plainDescription) {
    return plainDescription;
  }

  return locale === "en"
    ? `${project?.name ?? siteTitle}. Take a look at this project.`
    : `${project?.name ?? siteTitle}. Schau dir dieses Projekt an.`;
};

const getProjectOgImage = (
  project: Awaited<ReturnType<typeof loadProjectByIdentifier>>,
) => {
  const projectImage =
    project?.images?.find(
      (media): media is string =>
        typeof media === "string" && isImageUrl(media),
    ) ?? (project?.image && isImageUrl(project.image) ? project.image : null);

  if (projectImage) {
    return getSupabaseRenderedImageUrl(projectImage, { width: 1600 });
  }

  return heroHelloImage.src;
};

export async function generateMetadata({
  params,
}: {
  params:
    | { id: string; lang?: string }
    | Promise<{ id: string; lang?: string }>;
}): Promise<Metadata> {
  const { id, lang } = await Promise.resolve(params);
  const locale = normalizeLocale(lang);
  const project = await loadCachedProject(id);

  if (!project) {
    return {};
  }

  const canonicalPath = localizePathname(buildProjectPath(project), locale);
  const alternateLanguagePaths = {
    de: localizePathname(buildProjectPath(project), "de"),
    en: localizePathname(buildProjectPath(project), "en"),
  };
  const description = getProjectDescription(project, locale);
  const ogImage = getProjectOgImage(project);
  const title = `${project.name} | ${siteTitle}`;

  return {
    title,
    description,
    keywords: project.tags ?? undefined,
    authors: project.author?.name ? [{ name: project.author.name }] : undefined,
    alternates: {
      canonical: canonicalPath,
      languages: alternateLanguagePaths,
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title,
      description,
      siteName: siteTitle,
      locale: locale === "en" ? "en_US" : "de_DE",
      publishedTime: toMetadataDateValue(
        project.publishDate ?? project.createdAt,
      ),
      modifiedTime: project.updatedAt ?? undefined,
      authors: project.author?.name ? [project.author.name] : undefined,
      tags: project.tags ?? undefined,
      images: [
        {
          url: ogImage,
          alt: project.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const toMetadataDateValue = (value: string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T12:00:00.000Z`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export default async function ProjectDetailPage({
  params,
}: {
  params:
    | { id: string; lang?: string }
    | Promise<{ id: string; lang?: string }>;
}) {
  const { id, lang } = await Promise.resolve(params);
  const locale = normalizeLocale(lang);
  const [{ tx }, supabase, project] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadCachedProject(id),
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
  const heroPreviewMedia = heroMedia.map((mediaUrl) =>
    getResourceMediaKindFromUrl(mediaUrl) === "image"
      ? getSupabaseRenderedImageUrl(mediaUrl, { width: 1600 })
      : mediaUrl,
  );
  const renderedMarkdown = renderSimpleMarkdown(project.description ?? "");
  const hasTags = Boolean(project.tags && project.tags.length > 0);
  const hasProjectLinks = Boolean(
    project.projectLinks && project.projectLinks.length > 0,
  );
  const hasRelatedResources = Boolean(
    project.relatedResources && project.relatedResources.length > 0,
  );
  const publishedDateLabel = formatDate(
    project.publishDate ?? project.createdAt,
  );
  const updatedDateLabel = formatDate(project.updatedAt ?? project.createdAt);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="space-y-4 px-6 py-2 md:px-8">
        <PageTitle
          backLink={{
            href: localizePathname("/projects", locale),
            label: tx("Zur Projektübersicht", "de"),
          }}
          eyebrow={project.workshopResource?.name ?? tx("Projekt", "de")}
          eyebrowClassName="text-xs tracking-[0.2em] text-zinc-500"
          title={project.name}
          titleClassName="mt-3 max-w-4xl dark:text-zinc-100"
          customActions={
            <ShareButton
              title={project.name}
              text={tx("Schau dir dieses Projekt an.", "de")}
            />
          }
          links={[
            ...(canEdit
              ? [
                  {
                    href: localizePathname(`/projects/edit/${project.id}`, locale),
                    label: tx("Bearbeiten", "de"),
                    kind: "primary" as const,
                  },
                ]
              : []),
          ]}
        />

        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          {publishedDateLabel ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
              {publishedDateLabel}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.72fr)] lg:items-start">
        <article className="space-y-8">
          <MediaLightboxGallery
            media={heroMedia}
            previewMedia={heroPreviewMedia}
            title={project.name}
            closeLabel={tx("Schließen", "de")}
            previousLabel={tx("Zurück", "de")}
            nextLabel={tx("Weiter", "de")}
            documentLabel={tx("PDF", "de")}
            openDocumentLabel={tx("PDF öffnen", "de")}
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
                    <p className="text-lg font-semibold text-zinc-950 dark:text-white">
                      {project.author.name}
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-zinc-600">
                  {project.author.bio}
                  {/*project.author.bio ??
                    (project.authorName
                      ? tx(
                          "Dieser Name wurde manuell für das Projekt hinterlegt.",
                          "de",
                        )
                      : null) ??
                    tx(
                      "Für dieses Profil ist noch keine Kurzbiografie hinterlegt.",
                      "de",
                    ) */}
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
                <p className="font-semibold text-zinc-950 dark:text-white">
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
                <p className="font-semibold text-zinc-950 dark:text-white">
                  {tx("Veröffentlicht", "de")}
                </p>
                <p className="mt-1 text-zinc-500">
                  {publishedDateLabel ?? "-"}
                </p>
              </div>

              <div>
                <p className="font-semibold text-zinc-950 dark:text-white">
                  {tx("Aktualisiert", "de")}
                </p>
                <p className="mt-1 text-zinc-500">{updatedDateLabel ?? "-"}</p>
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
                      getResourceMediaKindFromUrl(resource.image) ===
                      "document" ? (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                          <FontAwesomeIcon
                            icon={faFilePdf}
                            className="h-6 w-6"
                          />
                        </div>
                      ) : (
                        <img
                          src={resource.image}
                          alt={resource.name ?? resource.id}
                          className="h-14 w-14 rounded-xl object-cover"
                        />
                      )
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
