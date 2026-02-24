"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  faArrowLeft,
  faChevronLeft,
  faChevronRight,
  faLayerGroup,
  faPen,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import Button from "../../components/Button";
import ResourceMap from "../ResourceMap";
import { RESOURCE_TYPES } from "../resource-types";
import { getPointFeatures } from "../map-features";

type Resource = ResourcePayload;

type ResourceDetailClientProps = {
  resourceId: string;
  initialResource: Resource | null;
  initialErrorMessage: string | null;
};

export default function ResourceDetailClient({
  resourceId,
  initialResource,
  initialErrorMessage,
}: ResourceDetailClientProps) {
  const [resource] = useState<Resource | null>(initialResource);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage,
  );
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const lightboxImages = useMemo(
    () =>
      resource?.images?.length
        ? resource.images
        : resource?.image
          ? [resource.image]
          : [],
    [resource],
  );
  const normalizedImages = useMemo(
    () => lightboxImages.filter((image): image is string => Boolean(image)),
    [lightboxImages],
  );
  const activeLightboxImage =
    lightboxIndex !== null ? normalizedImages[lightboxIndex] : null;

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

  useEffect(() => {
    if (lightboxIndex === null) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }
      if (normalizedImages.length < 2) {
        return;
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev === null ? 0 : (prev + 1) % normalizedImages.length,
        );
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev === null
            ? 0
            : (prev - 1 + normalizedImages.length) % normalizedImages.length,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxIndex, normalizedImages.length]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Resource details
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              View details and metadata for the selected resource.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              href="/resources"
              kind="secondary"
              className="px-4 py-2 text-xs"
              icon={faArrowLeft}
            >
              Back to resources
            </Button>
            <Button
              href={`/resources/features?resourceId=${resourceId}`}
              kind="secondary"
              className="border-blue-200 px-4 py-2 text-xs text-blue-700"
              icon={faPen}
            >
              Edit
            </Button>
            <Button
              href={`/resources/features?resourceId=${resourceId}`}
              kind="secondary"
              className="px-4 py-2 text-xs"
              icon={faLayerGroup}
            >
              Map features
            </Button>
            <Button
              type="button"
              kind="danger-secondary"
              icon={faTrash}
              onClick={async () => {
                if (deleting) {
                  return;
                }
                const confirmed = window.confirm(
                  "Really delete this resource? This cannot be undone.",
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
                    throw new Error(data.error ?? "Unable to delete resource.");
                  }
                  window.location.href = "/resources";
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to delete resource.",
                  );
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          {!resource ? (
            <p className="text-sm text-zinc-500">Resource not found.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/60">
                {resource.images && resource.images.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-2">
                    {resource.images.map((imageUrl, index) => (
                      <div
                        key={`${resource.id}-image-${index}`}
                        className="inline-flex h-60 w-auto items-center justify-center justify-self-start overflow-hidden rounded-xl bg-zinc-100"
                      >
                        <img
                          src={imageUrl}
                          alt={`${resource.name} ${index + 1}`}
                          className="h-60 w-auto object-cover"
                          role="button"
                          tabIndex={0}
                          onClick={() => setLightboxIndex(index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setLightboxIndex(index);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : resource.image ? (
                  <div className="inline-flex h-60 w-auto items-center justify-center overflow-hidden bg-zinc-100">
                    <img
                      src={resource.image}
                      alt={resource.name}
                      className="h-60 w-auto object-cover"
                      role="button"
                      tabIndex={0}
                      onClick={() => setLightboxIndex(0)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setLightboxIndex(0);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-60 w-full items-center justify-center bg-zinc-100">
                    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                      No image
                    </span>
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {resource.name}
                </h2>
                {resource.description ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-zinc-600">
                    {resource.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
                {resourceTypeLabel ? (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    {resourceTypeLabel}
                  </span>
                ) : null}
                {resource.attachable !== undefined ? (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    {resource.attachable ? "Attachable" : "Not attachable"}
                  </span>
                ) : null}
                {resource.tags?.map((tag) => (
                  <span
                    key={`${resource.id}-${tag}`}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {resource.categories && resource.categories.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Categories
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                    {resource.categories.map((category, index) => (
                      <li
                        key={`${resource.id}-category-${index}`}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1"
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
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Related resources
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                    {resource.relatedResources.map((relatedResource) => (
                      <li key={`${resource.id}-related-${relatedResource.id}`}>
                        <a
                          href={buildResourcePath({
                            id: relatedResource.id,
                            prettyTitle: relatedResource.prettyTitle,
                          })}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1 hover:border-zinc-300 hover:text-zinc-900"
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
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Location
                  </p>
                  <div className="mt-3">
                    <ResourceMap
                      gps={resourceGps}
                      className="w-full aspect-[4/3]"
                    />
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${resourceGps.latitude},${resourceGps.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Open map
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
      {activeLightboxImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
        >
          <Button
            type="button"
            kind="secondary"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-1 top-3 rounded-full !bg-transparent !border-none px-3 py-3 !text-xl font-semibold !text-white"
            icon={faXmark}
          >
            Close
          </Button>
          {normalizedImages.length > 1 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
              <Button
                type="button"
                kind="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev === null
                      ? 0
                      : (prev - 1 + normalizedImages.length) %
                        normalizedImages.length,
                  );
                }}
                className="pointer-events-auto rounded-full !bg-transparent !border-none px-3 py-2 text-xs font-semibold !text-white/90"
                icon={faChevronLeft}
              >
                Prev
              </Button>
              <Button
                type="button"
                kind="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev === null ? 0 : (prev + 1) % normalizedImages.length,
                  );
                }}
                className="pointer-events-auto rounded-full !bg-transparent !border-none px-3 py-2 text-xs font-semibold !text-white/90"
                icon={faChevronRight}
                iconReverse
              >
                Next
              </Button>
            </div>
          ) : null}
          <img
            src={activeLightboxImage}
            alt="Resource preview"
            className="max-h-[85vh] w-auto max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
