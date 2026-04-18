"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  faArrowLeft,
  faLayerGroup,
  faPen,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import PageTitle from "../../components/PageTitle";
import MediaLightboxGallery from "../../components/MediaLightboxGallery";
import ResourcesMapView from "../ResourcesMapView";
import { RESOURCE_TYPES } from "../resource-types";
import { getPointFeatures } from "../map-features";
import { renderSimpleMarkdown } from "@/lib/simple-markdown";

type Resource = ResourcePayload;

type ResourceDetailClientProps = {
  resourceId: string;
  initialResource: Resource | null;
  initialMapBasemapResources: Resource[];
  initialErrorMessage: string | null;
};

export default function ResourceDetailClient({
  resourceId,
  initialResource,
  initialMapBasemapResources,
  initialErrorMessage,
}: ResourceDetailClientProps) {
  const router = useRouter();
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const [resource] = useState<Resource | null>(initialResource);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage,
  );
  const [deleting, setDeleting] = useState(false);

  const normalizedMapBasemapResources = useMemo(
    () =>
      initialMapBasemapResources.map((mapResource) => ({
        ...mapResource,
        image: mapResource.image ?? null,
        images:
          mapResource.images ??
          (mapResource.image ? [mapResource.image] : undefined),
      })),
    [initialMapBasemapResources],
  );

  const mapOverlayResources = useMemo(() => {
    const combinedById = new Map(
      normalizedMapBasemapResources.map((mapResource) => [
        mapResource.id,
        mapResource,
      ]),
    );

    if (resource) {
      combinedById.set(resource.id, {
        ...resource,
        image: resource.image ?? null,
        images:
          resource.images ?? (resource.image ? [resource.image] : undefined),
      });
    }

    return Array.from(combinedById.values());
  }, [normalizedMapBasemapResources, resource]);

  const resourceGps = useMemo(() => {
    if (!resource) {
      return null;
    }
    const pointFeature = getPointFeatures(resource.mapFeatures ?? [])[0];
    if (!pointFeature) {
      return null;
    }
    return {
      latitude: pointFeature.point[1],
      longitude: pointFeature.point[0],
    };
  }, [resource]);

  const resourceTypeLabel = useMemo(() => {
    const typeValue = resource?.type?.trim() ?? "";
    if (!typeValue) {
      return "";
    }
    return (
      RESOURCE_TYPES[typeValue as keyof typeof RESOURCE_TYPES]?.label ??
      typeValue
    );
  }, [resource?.type]);

  const renderedDescription = useMemo(
    () => renderSimpleMarkdown(resource?.description ?? ""),
    [resource?.description],
  );

  const pageTitleLinks = resource
    ? [
        {
          href: localizePathname(
            `/resources/features?resourceId=${resourceId}`,
            locale,
          ),
          label: tx("Edit"),
          icon: faPen,
          className: "border-primary-border text-primary",
        },
        {
          href: localizePathname(
            `/resources/features?resourceId=${resourceId}`,
            locale,
          ),
          label: tx("Map features"),
          icon: faLayerGroup,
        },
        {
          label: deleting ? tx("Deleting…") : tx("Delete"),
          onClick: async () => {
            if (deleting) {
              return;
            }
            const confirmed = window.confirm(
              tx("Really delete this resource? This cannot be undone."),
            );
            if (!confirmed) {
              return;
            }
            setDeleting(true);
            setErrorMessage(null);
            try {
              const response = await fetch(
                `/api/campai/resources/${resourceId}`,
                {
                  method: "DELETE",
                },
              );
              const data = (await response.json()) as { error?: string };
              if (!response.ok) {
                throw new Error(data.error ?? tx("Unable to delete resource."));
              }
              router.push(localizePathname("/resources", locale));
            } catch (error) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : tx("Unable to delete resource."),
              );
            } finally {
              setDeleting(false);
            }
          },
          disabled: deleting,
          icon: faTrash,
          kind: "danger-secondary" as const,
        },
      ]
    : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <PageTitle
          title={resource?.name ?? tx("Resource not found.")}
          backLink={{
            href: localizePathname("/resources", locale),
            label: tx("Back to resources"),
            icon: faArrowLeft,
          }}
          links={pageTitleLinks}
        />

        <p className="inline-flex max-w-fit rounded-full border border-warning-border bg-warning-soft px-3 py-1 text-xs text-warning">
          {tx("Images and text on this page were generated with AI.")}
        </p>

        {errorMessage ? (
          <section className="rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
            {errorMessage}
          </section>
        ) : null}

        <section>
          {!resource ? (
            <p className="text-sm text-muted-foreground">{tx("Resource not found.")}</p>
          ) : (
            <div className="flex flex-col gap-6">
              <MediaLightboxGallery
                media={
                  resource.images?.length
                    ? resource.images
                    : resource.image
                      ? [resource.image]
                      : []
                }
                title={resource.name}
                closeLabel={tx("Close")}
                previousLabel={tx("Prev")}
                nextLabel={tx("Next")}
                previewLabel={tx("Resource preview")}
                noMediaLabel={tx("No media", "en")}
                documentLabel={tx("PDF", "de")}
                openDocumentLabel={tx("PDF öffnen", "de")}
                variant="resource"
              />
              <div>
                {resource.description ? (
                  <div
                    className="markdown-content mt-3 text-sm"
                    dangerouslySetInnerHTML={{ __html: renderedDescription }}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {resourceTypeLabel ? (
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-foreground">
                    {resourceTypeLabel}
                  </span>
                ) : null}
                {resource.attachable !== undefined ? (
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-foreground">
                    {resource.attachable
                      ? tx("Attachable")
                      : tx("Not attachable")}
                  </span>
                ) : null}
                {resource.tags?.map((tag) => (
                  <span
                    key={`${resource.id}-${tag}`}
                    className="rounded-full border border-border bg-card px-3 py-1 text-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {resource.categories && resource.categories.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {tx("Categories")}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {resource.categories.map((category, index) => (
                      <li
                        key={`${resource.id}-category-${index}`}
                        className="rounded-full border border-border bg-card px-3 py-1 text-foreground"
                      >
                        {category.name ?? category.bookingCategoryId ?? ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {resource.relatedResources &&
              resource.relatedResources.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {tx("Related resources")}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {resource.relatedResources.map((relatedResource) => (
                      <li key={`${resource.id}-related-${relatedResource.id}`}>
                        <a
                          href={localizePathname(
                            buildResourcePath({
                              id: relatedResource.id,
                              prettyTitle: relatedResource.prettyTitle,
                            }),
                            locale,
                          )}
                          className="rounded-full border border-border bg-card px-3 py-1 text-foreground transition hover:border-input hover:text-foreground"
                        >
                          {relatedResource.name ?? relatedResource.id}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {resourceGps ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {tx("Location")}
                  </p>
                  <div className="mt-3">
                    <ResourcesMapView
                      resources={mapOverlayResources}
                      pointResources={resource ? [resource] : []}
                      className="w-full aspect-[4/3]"
                    />
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${resourceGps.latitude},${resourceGps.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {tx("Open map")}
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
