"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import Button from "@/app/[lang]/components/Button";

export type NewsletterImagePosition = {
  x: number;
  y: number;
};

type NewsletterImagePositionDialogProps = {
  imageUrl: string;
  imageLabel: string;
  aspectRatio: number;
  aspectLabel: string;
  initialPosition: NewsletterImagePosition;
  onApply: (position: NewsletterImagePosition) => void;
  onClose: () => void;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export default function NewsletterImagePositionDialog({
  imageUrl,
  imageLabel,
  aspectRatio,
  aspectLabel,
  initialPosition,
  onApply,
  onClose,
}: NewsletterImagePositionDialogProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: NewsletterImagePosition;
  } | null>(null);
  const [position, setPosition] = useState(initialPosition);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    const frame = frameRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !frame) return;

    const bounds = frame.getBoundingClientRect();
    setPosition({
      x: clamp(
        dragState.origin.x -
          (event.clientX - dragState.startX) / Math.max(bounds.width, 1),
      ),
      y: clamp(
        dragState.origin.y -
          (event.clientY - dragState.startY) / Math.max(bounds.height, 1),
      ),
    });
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-image-position-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 px-4 py-6 backdrop-blur-sm"
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2
              id="newsletter-image-position-title"
              className="text-xl font-semibold text-foreground"
            >
              Bildausschnitt festlegen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {imageLabel} · {aspectLabel}
            </p>
          </div>
          <Button kind="secondary" onClick={onClose}>
            Schließen
          </Button>
        </header>

        <div className="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.6fr)]">
          <div className="space-y-3">
            <div
              ref={frameRef}
              className="relative mx-auto w-full cursor-grab touch-none overflow-hidden rounded-lg bg-foreground active:cursor-grabbing"
              style={{ aspectRatio }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <Image
                src={imageUrl}
                alt={imageLabel}
                fill
                unoptimized
                draggable={false}
                className="pointer-events-none select-none object-cover"
                style={{
                  objectPosition: `${position.x * 100}% ${position.y * 100}%`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-lg border border-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Ziehe das Bild im Rahmen, bis der gewünschte Ausschnitt sichtbar ist.
            </p>
          </div>

          <aside className="space-y-5 rounded-lg border border-border bg-muted/50 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Position
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                Der Ausschnitt wird für dieses Bild gespeichert und auch bei GIFs
                verwendet.
              </p>
            </div>
            <Button
              kind="secondary"
              className="w-full"
              onClick={() => setPosition({ x: 0.5, y: 0.5 })}
            >
              Wieder zentrieren
            </Button>
            <div className="flex flex-col gap-2 pt-2">
              <Button kind="primary" onClick={() => onApply(position)}>
                Ausschnitt übernehmen
              </Button>
              <Button kind="secondary" onClick={onClose}>
                Abbrechen
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
