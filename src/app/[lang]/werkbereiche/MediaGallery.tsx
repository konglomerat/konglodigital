"use client";

/* Payload supplies responsive image variants on its own media host. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./MediaGallery.module.css";

export type GalleryItem = {
  src: string;
  preview: string;
  srcSet?: string;
  alt: string;
  caption?: string;
  video: boolean;
  poster?: string;
  width?: "auto" | "full" | "half" | "third";
  mediaWidth?: number;
  mediaHeight?: number;
};

export default function MediaGallery({
  items,
  columns = "3",
}: {
  items: GalleryItem[];
  columns?: "2" | "3" | "4";
}) {
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const open = active !== null;
  const current = active === null ? null : items[active];

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const navigate = (step: number) =>
    setActive((index) =>
      index === null ? null : (index + step + items.length) % items.length,
    );

  if (!items.length) return null;

  return (
    <div className={styles.gallery}>
      <div
        className={styles.grid}
        style={{ "--gallery-columns": columns } as CSSProperties}
      >
        {items.map((item, index) => {
          const span =
            item.width === "full"
              ? 12
              : item.width === "half"
                ? 6
                : item.width === "third"
                  ? 4
                  : 12 / Number(columns);
          return (
            <figure
              key={`${item.src}-${index}`}
              className={styles.figure}
              style={{ "--gallery-span": span } as CSSProperties}
            >
              <button
                type="button"
                className={styles.preview}
                aria-label={`${item.video ? "Video ansehen" : "Bild vergrößern"}: ${item.alt}`}
                aria-haspopup="dialog"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setActive(index);
                }}
                style={{
                  aspectRatio: `${item.mediaWidth || 4} / ${item.mediaHeight || 3}`,
                }}
              >
                {item.video && !item.poster ? (
                  <video
                    src={`${item.src}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                ) : (
                  <img
                    src={item.video ? item.poster : item.preview}
                    srcSet={item.video ? undefined : item.srcSet}
                    sizes={
                      item.width === "full"
                        ? "(max-width: 700px) 100vw, 900px"
                        : "(max-width: 700px) 100vw, 450px"
                    }
                    width={item.mediaWidth}
                    height={item.mediaHeight}
                    alt={item.alt}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span className={styles.badge} aria-hidden="true">
                  {item.video ? "▶ Video" : "↗"}
                </span>
              </button>
              {item.caption ? (
                <figcaption className={styles.caption}>
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="Werkstattgalerie"
        onClose={() => setActive(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setActive(null);
        }}
        onKeyDown={(event) => {
          // Keep native video seeking and volume keys available.
          if (event.target instanceof HTMLVideoElement) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            navigate(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        {current && (
          <>
            <div className={styles.toolbar}>
              <span aria-live="polite">
                {(active ?? 0) + 1} / {items.length}
              </span>
              <button
                type="button"
                aria-label="Galerie schließen"
                onClick={() => setActive(null)}
                autoFocus
              >
                Schließen ×
              </button>
            </div>
            <div className={styles.stage}>
              <button
                type="button"
                className={styles.previous}
                aria-label="Vorheriges Medium"
                disabled={items.length < 2}
                onClick={() => navigate(-1)}
              >
                ←
              </button>
              <figure className={styles.fullFigure}>
                {current.video ? (
                  <video
                    key={current.src}
                    src={current.src}
                    poster={current.poster}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={current.alt}
                  >
                    Dein Browser unterstützt dieses Video nicht.{" "}
                    <a href={current.src}>Video öffnen</a>
                  </video>
                ) : (
                  <img
                    key={current.src}
                    src={current.src}
                    srcSet={current.srcSet}
                    sizes="100vw"
                    width={current.mediaWidth}
                    height={current.mediaHeight}
                    alt={current.alt}
                    onTouchStart={(event) => {
                      touchStart.current =
                        event.touches.length === 1
                          ? event.touches[0].clientX
                          : null;
                    }}
                    onTouchEnd={(event) => {
                      if (touchStart.current !== null) {
                        const distance =
                          event.changedTouches[0].clientX - touchStart.current;
                        if (Math.abs(distance) > 60)
                          navigate(distance < 0 ? 1 : -1);
                      }
                      touchStart.current = null;
                    }}
                  />
                )}
                <figcaption>{current.caption || current.alt}</figcaption>
              </figure>
              <button
                type="button"
                className={styles.next}
                aria-label="Nächstes Medium"
                disabled={items.length < 2}
                onClick={() => navigate(1)}
              >
                →
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
