"use client";

import { useMemo, useState } from "react";
import {
  faArrowLeft,
  faPen,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import Badge from "@/components/knglmrt/Badge";
import PageTitle from "../../components/PageTitle";
import MediaLightboxGallery from "../../components/MediaLightboxGallery";
import ResourcesMapView from "../ResourcesMapView";
import { RESOURCE_TYPES } from "../resource-types";
import { getPointFeatures } from "../map-features";
import { renderSimpleMarkdown } from "@/lib/simple-markdown";
import { SidebarSection } from "./ResourceLoan";
import { inventoryEditUrl } from "@/lib/openinventory-contract";
import { getResourcePreviewUrl } from "@/lib/resource-media";

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
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const resource = initialResource;
  const errorMessage = initialErrorMessage;
  const [mapOpen, setMapOpen] = useState(true);

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

  const pageTitleLinks = resource ? [{
    href: inventoryEditUrl(resourceId), label: tx("In OpenInventory bearbeiten", "de"), icon: faPen,
  }] : undefined;

  const media = resource?.images?.length
    ? resource.images
    : resource?.image
      ? [resource.image]
      : [];
  const chipClassName =
    "border border-border px-3.5 py-1.5 text-[length:var(--ui-size-label)] text-foreground";

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title={resource?.name ?? tx("Resource not found.")}
        backLink={{
          href: localizePathname("/resources", locale),
          label: tx("Back to resources"),
          icon: faArrowLeft,
        }}
        links={pageTitleLinks}
      />

      {errorMessage ? (
        <section className="border border-destructive-border bg-destructive-soft p-4 text-destructive">
          {errorMessage}
        </section>
      ) : null}

      {!resource ? (
        <p className="text-muted-foreground">{tx("Resource not found.")}</p>
      ) : (
        <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="flex min-w-0 flex-col gap-6">
            <MediaLightboxGallery
              media={media}
              previewMedia={media.map(url => getResourcePreviewUrl(url, resource.mediaPreviews) ?? url)}
              mediaPosters={resource.mediaPosters ?? undefined}
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
            {resource.description ? (
              <div
                className="markdown-content text-foreground"
                dangerouslySetInnerHTML={{ __html: renderedDescription }}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {resourceTypeLabel ? (
                <Badge tone="kontur">{resourceTypeLabel}</Badge>
              ) : null}
              {resource.attachable !== undefined ? (
                <Badge tone="kontur">
                  {resource.attachable
                    ? tx("Attachable")
                    : tx("Not attachable")}
                </Badge>
              ) : null}
              {resource.tags?.map((tag) => (
                <Badge key={`${resource.id}-${tag}`} tone="kontur">
                  #{tag}
                </Badge>
              ))}
            </div>
            {resource.categories && resource.categories.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="knglmrt-label text-muted-foreground">
                  {tx("Categories")}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {resource.categories.map((category, index) => (
                    <li key={`${resource.id}-category-${index}`}>
                      <Badge tone="kontur">
                        {category.name ?? category.bookingCategoryId ?? ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {resource.relatedResources &&
            resource.relatedResources.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="knglmrt-label text-muted-foreground">
                  {tx("Related resources")}
                </p>
                <ul className="flex flex-wrap gap-2">
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
                        className={`${chipClassName} inline-block transition hover:bg-primary-soft`}
                      >
                        {relatedResource.name ?? relatedResource.id}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
            {resource.mapFeatures?.length ? (
              <SidebarSection
                title={tx("Location")}
                open={mapOpen}
                onToggle={() => setMapOpen((open) => !open)}
              >
                <div className="flex flex-col gap-2.5 px-[18px] pb-4 pt-3.5">
                  <ResourcesMapView
                    resources={mapOverlayResources}
                    pointResources={[resource]}
                    className="h-[260px] w-full"
                  />
                  {resourceGps ? <a
                    href={`https://www.google.com/maps?q=${resourceGps.latitude},${resourceGps.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="self-start font-bold text-primary hover:text-[var(--knglmrt-brown-100)]"
                  >
                    {tx("Open map")}
                  </a> : null}
                </div>
              </SidebarSection>
            ) : null}

          </aside>
        </div>
      )}

      <p className="self-start bg-warning-soft px-3 py-1.5 text-foreground">
        {tx("Images and text on this page were generated with AI.")}
      </p>
    </div>
  );
}
