"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  faChevronLeft,
  faChevronRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "./Button";
import { isVideoUrl } from "@/lib/resource-media";

type MediaLightboxGalleryProps = {
  media: string[];
  previewMedia?: string[];
  title: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  previewLabel?: string;
  noMediaLabel?: string | null;
  variant: "project" | "resource";
};

const renderMedia = (
  mediaUrl: string,
  alt: string,
  className: string,
  options?: {
    controls?: boolean;
    autoPlay?: boolean;
  },
) => {
  if (isVideoUrl(mediaUrl)) {
    return (
      <video
        src={mediaUrl}
        controls={options?.controls ?? false}
        autoPlay={options?.autoPlay ?? true}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        className={`${className} bg-zinc-950`}
      />
    );
  }

  return <img src={mediaUrl} alt={alt} className={className} />;
};

export default function MediaLightboxGallery({
  media,
  previewMedia,
  title,
  closeLabel,
  previousLabel,
  nextLabel,
  previewLabel,
  noMediaLabel = null,
  variant,
}: MediaLightboxGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const normalizedMedia = useMemo(
    () => media.filter((entry): entry is string => Boolean(entry)),
    [media],
  );

  const normalizedPreviewMedia = useMemo(
    () =>
      normalizedMedia.map(
        (_, index) => previewMedia?.[index] ?? normalizedMedia[index],
      ),
    [normalizedMedia, previewMedia],
  );

  const activeLightboxIndex =
    lightboxIndex !== null && lightboxIndex < normalizedMedia.length
      ? lightboxIndex
      : null;

  const activeLightboxMedia =
    activeLightboxIndex !== null ? normalizedMedia[activeLightboxIndex] : null;

  useEffect(() => {
    if (activeLightboxIndex === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }

      if (normalizedMedia.length < 2) {
        return;
      }

      if (event.key === "ArrowRight") {
        setLightboxIndex((current) =>
          current === null ? 0 : (current + 1) % normalizedMedia.length,
        );
      }

      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) =>
          current === null
            ? 0
            : (current - 1 + normalizedMedia.length) % normalizedMedia.length,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeLightboxIndex, normalizedMedia.length]);

  const renderThumbnailButton = (
    previewMediaUrl: string,
    index: number,
    className: string,
    mediaClassName: string,
  ) => (
    <button
      key={`${previewMediaUrl}-${index}`}
      type="button"
      className={className}
      onClick={() => setLightboxIndex(index)}
      aria-label={`${title} ${index + 1}`}
    >
      {renderMedia(previewMediaUrl, `${title} ${index + 1}`, mediaClassName)}
    </button>
  );

  return (
    <>
      {variant === "project" ? (
        normalizedMedia.length > 0 ? (
          <section className="grid gap-4 px-6 py-2 md:px-8">
            {renderThumbnailButton(
              normalizedPreviewMedia[0],
              0,
              "overflow-hidden rounded-[2rem] text-left",
              "h-auto w-full",
            )}
            {normalizedMedia.length > 1 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {normalizedPreviewMedia
                  .slice(1)
                  .map((mediaUrl, index) =>
                    renderThumbnailButton(
                      mediaUrl,
                      index + 1,
                      "overflow-hidden rounded-[1.5rem] text-left",
                      "h-auto w-full",
                    ),
                  )}
              </div>
            ) : null}
          </section>
        ) : null
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/60">
          {normalizedMedia.length > 0 ? (
            <div className="flex flex-wrap gap-2 p-2">
              {normalizedPreviewMedia.map((mediaUrl, index) =>
                renderThumbnailButton(
                  mediaUrl,
                  index,
                  "inline-flex h-60 w-auto items-center justify-center justify-self-start overflow-hidden rounded-xl bg-zinc-100 text-left",
                  "h-60 w-auto object-cover",
                ),
              )}
            </div>
          ) : noMediaLabel ? (
            <div className="flex h-60 w-full items-center justify-center bg-zinc-100">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                {noMediaLabel}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {activeLightboxMedia ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
        >
          <Button
            type="button"
            kind="secondary"
            onClick={(event) => {
              event.stopPropagation();
              setLightboxIndex(null);
            }}
            className="absolute right-1 top-3 rounded-full !bg-transparent !border-none px-3 py-3 !text-xl font-semibold !text-white"
            icon={faXmark}
          >
            {closeLabel}
          </Button>
          {normalizedMedia.length > 1 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
              <Button
                type="button"
                kind="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightboxIndex((current) =>
                    current === null
                      ? 0
                      : (current - 1 + normalizedMedia.length) %
                        normalizedMedia.length,
                  );
                }}
                className="pointer-events-auto rounded-full !bg-transparent !border-none px-3 py-2 text-xs font-semibold !text-white/90"
                icon={faChevronLeft}
              >
                {previousLabel}
              </Button>
              <Button
                type="button"
                kind="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightboxIndex((current) =>
                    current === null
                      ? 0
                      : (current + 1) % normalizedMedia.length,
                  );
                }}
                className="pointer-events-auto rounded-full !bg-transparent !border-none px-3 py-2 text-xs font-semibold !text-white/90"
                icon={faChevronRight}
                iconReverse
              >
                {nextLabel}
              </Button>
            </div>
          ) : null}
          {isVideoUrl(activeLightboxMedia) ? (
            <video
              src={activeLightboxMedia}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={previewLabel ?? title}
              className="max-h-[85vh] w-auto max-w-[90vw] rounded-2xl bg-zinc-950 object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <img
              src={activeLightboxMedia}
              alt={previewLabel ?? title}
              className="max-h-[85vh] w-auto max-w-[90vw] rounded-2xl object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
