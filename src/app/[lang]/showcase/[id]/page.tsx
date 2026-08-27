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
import ShowcaseDeleteButton from "../ShowcaseDeleteButton";
import type { Locale } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { buildShowcasePath } from "@/lib/showcase-path";
import { renderSimpleMarkdown } from "@/lib/simple-markdown";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
import { userHasRole } from "@/lib/roles";
import {
  getResourceMediaKindFromUrl,
  getSupabaseRenderedImageUrl,
  isImageMediaUrl,
} from "@/lib/resource-media";
import { loadShowcaseByIdentifier } from "../showcase-data";
import { buildResourcePath } from "@/lib/resource-pretty-title";

const siteTitle = "Konglomerat Digitale Werkstätten";

const loadCachedShowcase = cache(async (id: string) =>
  loadShowcaseByIdentifier(id),
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

const getShowcaseDescription = (
  showcase: Awaited<ReturnType<typeof loadShowcaseByIdentifier>>,
  locale: Locale,
) => {
  const plainDescription = truncateText(
    stripMarkdown(showcase?.description),
    180,
  );
  if (plainDescription) {
    return plainDescription;
  }

  return locale === "en"
    ? `${showcase?.name ?? siteTitle}. Take a look at this showcase.`
    : `${showcase?.name ?? siteTitle}. Schau dir diesen Beitrag an.`;
};

const getShowcaseOgImage = (
  showcase: Awaited<ReturnType<typeof loadShowcaseByIdentifier>>,
) => {
  const showcaseImage =
    showcase?.images?.find(
      (media): media is string =>
        typeof media === "string" && isImageMediaUrl(media),
    ) ??
    (showcase?.image && isImageMediaUrl(showcase.image) ? showcase.image : null);

  if (showcaseImage) {
    return getSupabaseRenderedImageUrl(showcaseImage, { width: 1600 });
  }

  return heroHelloImage.src;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang?: string }>;
}): Promise<Metadata> {
  const { id, lang } = await params;
  const locale = normalizeLocale(lang);
  const showcase = await loadCachedShowcase(id);

  if (!showcase) {
    return {};
  }

  const canonicalPath = localizePathname(buildShowcasePath(showcase), locale);
  const alternateLanguagePaths = {
    de: localizePathname(buildShowcasePath(showcase), "de"),
    en: localizePathname(buildShowcasePath(showcase), "en"),
  };
  const description = getShowcaseDescription(showcase, locale);
  const ogImage = getShowcaseOgImage(showcase);
  const title = `${showcase.name} | ${siteTitle}`;

  return {
    title,
    description,
    keywords: showcase.tags ?? undefined,
    authors: showcase.author?.name ? [{ name: showcase.author.name }] : undefined,
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
        showcase.publishDate ?? showcase.createdAt,
      ),
      modifiedTime: showcase.updatedAt ?? undefined,
      authors: showcase.author?.name ? [showcase.author.name] : undefined,
      tags: showcase.tags ?? undefined,
      images: [
        {
          url: ogImage,
          alt: showcase.name,
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

export default async function ShowcaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang?: string }>;
}) {
  const { id, lang } = await params;
  const locale = normalizeLocale(lang);
  const [{ tx }, supabase, showcase] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadCachedShowcase(id),
  ]);

  if (!showcase) {
    notFound();
  }

  const canonicalPath = localizePathname(buildShowcasePath(showcase), locale);
  const currentPath = localizePathname(`/showcase/${id}`, locale);
  if (canonicalPath !== currentPath) {
    redirect(canonicalPath);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canEdit = Boolean(
    user && (showcase.ownerId === user.id || hasRight(user, "resources:edit")),
  );
  const isShowcaseOwner = Boolean(user && showcase.ownerId === user.id);
  const isAdmin =
    user && !isShowcaseOwner
      ? await userHasRole(supabase, user, "admin")
      : false;
  const canDelete = Boolean(user && (isShowcaseOwner || isAdmin));
  const heroMedia =
    showcase.images?.filter(
      (media): media is string => typeof media === "string",
    ) ?? (showcase.image ? [showcase.image] : []);
  const heroPreviewMedia = heroMedia.map((mediaUrl) =>
    getResourceMediaKindFromUrl(mediaUrl) === "image"
      ? getSupabaseRenderedImageUrl(mediaUrl, { width: 1600 })
      : mediaUrl,
  );
  const renderedMarkdown = renderSimpleMarkdown(showcase.description ?? "");
  const hasTags = Boolean(showcase.tags && showcase.tags.length > 0);
  const hasShowcaseLinks = Boolean(
    showcase.showcaseLinks && showcase.showcaseLinks.length > 0,
  );
  const hasRelatedResources = Boolean(
    showcase.relatedResources && showcase.relatedResources.length > 0,
  );
  const publishedDateLabel = formatDate(
    showcase.publishDate ?? showcase.createdAt,
  );
  const updatedDateLabel = formatDate(showcase.updatedAt ?? showcase.createdAt);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="space-y-4 px-6 py-2 md:px-8">
        <PageTitle
          backLink={{
            href: localizePathname("/showcase", locale),
            label: tx("Zur Übersicht", "de"),
          }}
          eyebrow={showcase.workshopResource?.name ?? tx("Beitrag", "de")}
          eyebrowClassName="text-xs tracking-[0.2em] text-muted-foreground"
          title={showcase.name}
          titleClassName="mt-3 max-w-4xl "
          customActions={
            <>
              <ShareButton
                title={showcase.name}
                text={tx("Schau dir diesen Beitrag an.", "de")}
              />
              {canDelete ? (
                <ShowcaseDeleteButton showcaseId={showcase.id} />
              ) : null}
            </>
          }
          links={[
            ...(canEdit
              ? [
                  {
                    href: localizePathname(
                      `/showcase/edit/${showcase.id}`,
                      locale,
                    ),
                    label: tx("Bearbeiten", "de"),
                    kind: "primary" as const,
                  },
                ]
              : []),
          ]}
        />

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {publishedDateLabel ? (
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1">
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
            title={showcase.name}
            closeLabel={tx("Schließen", "de")}
            previousLabel={tx("Zurück", "de")}
            nextLabel={tx("Weiter", "de")}
            documentLabel={tx("PDF", "de")}
            openDocumentLabel={tx("PDF öffnen", "de")}
            variant="showcase"
          />

          <section className="px-6 py-2 md:px-8">
            <div
              className="prose prose-zinc max-w-none prose-headings:font-semibold prose-a:text-primary prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-primary prose-code:rounded prose-code:bg-accent prose-code:px-1 prose-code:py-0.5 prose-blockquote:border-l-4 prose-blockquote:border-input prose-blockquote:pl-4"
              dangerouslySetInnerHTML={{
                __html:
                  renderedMarkdown ||
                  `<p>${tx("Für diesen Beitrag wurde noch keine Beschreibung hinterlegt.", "de")}</p>`,
              }}
            />
          </section>

          {hasTags ? (
            <section className="px-6 py-2 md:px-8">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {showcase.tags?.map((tag) => (
                  <span
                    key={`${showcase.id}-${tag}`}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1"
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tx("Autor", "de")}
            </p>
            {showcase.author ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-4">
                  {showcase.author.avatarUrl ? (
                    <img
                      src={showcase.author.avatarUrl}
                      alt={showcase.author.name}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
                      {showcase.author.initials}
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {showcase.author.name}
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {showcase.author?.bio}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {tx("Autorinformationen sind aktuell nicht verfügbar.", "de")}
              </p>
            )}
          </section>

          <section className="px-5 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tx("Infos zum Beitrag", "de")}
            </p>
            <div className="mt-4 space-y-4 text-sm text-foreground/80">
              <div>
                <p className="font-semibold text-foreground">
                  {tx("Werkstatt", "de")}
                </p>
                {showcase.workshopResource ? (
                  <Link
                    href={localizePathname(
                      buildResourcePath({
                        id: showcase.workshopResource.id,
                        prettyTitle: showcase.workshopResource.prettyTitle,
                      }),
                      locale,
                    )}
                    className="mt-1 inline-flex text-primary hover:text-primary"
                  >
                    {showcase.workshopResource.name ??
                      showcase.workshopResource.id}
                  </Link>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {tx("Keine Werkstatt verknüpft", "de")}
                  </p>
                )}
              </div>

              <div>
                <p className="font-semibold text-foreground">
                  {tx("Veröffentlicht", "de")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {publishedDateLabel ?? "-"}
                </p>
              </div>

              <div>
                <p className="font-semibold text-foreground">
                  {tx("Aktualisiert", "de")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {updatedDateLabel ?? "-"}
                </p>
              </div>
            </div>
          </section>

          {hasShowcaseLinks ? (
            <section className="px-5 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tx("Links", "de")}
              </p>
              <div className="mt-4 grid gap-3">
                {showcase.showcaseLinks?.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    target={link.url.startsWith("http") ? "_blank" : undefined}
                    rel={link.url.startsWith("http") ? "noreferrer" : undefined}
                    className="block text-sm text-primary transition hover:text-primary"
                  >
                    <span className="block font-semibold">{link.label}</span>
                    <span className="mt-1 block break-all text-xs text-primary">
                      {link.url}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {hasRelatedResources ? (
            <section className="px-5 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tx("Verwendete Ressourcen", "de")}
              </p>
              <div className="mt-4 grid gap-3">
                {showcase.relatedResources?.map((resource) => (
                  <Link
                    key={resource.id}
                    href={localizePathname(
                      buildResourcePath({
                        id: resource.id,
                        prettyTitle: resource.prettyTitle,
                      }),
                      locale,
                    )}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-2 text-sm text-foreground/80 transition hover:border-primary-border hover:text-primary"
                  >
                    {resource.image ? (
                      getResourceMediaKindFromUrl(resource.image) ===
                      "document" ? (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                          <FontAwesomeIcon
                            icon={faFilePdf}
                            className="h-6 w-6"
                          />
                        </div>
                      ) : (
                        <img
                          src={resource.image}
                          alt={resource.name ?? resource.id}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      )
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
