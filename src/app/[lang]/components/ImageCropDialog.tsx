"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import Button from "./Button";
import { useI18n } from "@/i18n/client";
import { RESOURCES_NAMESPACE } from "@/i18n/config";

type CropAspect = "original" | "landscape" | "portrait" | "square";

type ImageCropDialogProps = {
  imageUrl: string;
  imageName: string;
  imageType?: string;
  onApply: (file: File) => Promise<void> | void;
  onClose: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getOutputMimeType = (inputType?: string) => {
  if (inputType === "image/png") {
    return "image/png";
  }
  if (inputType === "image/webp") {
    return "image/webp";
  }
  return "image/jpeg";
};

const getFileExtension = (mimeType: string) => {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "jpg";
};

const buildCroppedFileName = (imageName: string, mimeType: string) => {
  const trimmedName = imageName.trim() || "image";
  const extensionIndex = trimmedName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? trimmedName.slice(0, extensionIndex) : trimmedName;
  return `${baseName}-crop.${getFileExtension(mimeType)}`;
};

const loadImageElement = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = url;
  });

export default function ImageCropDialog({
  imageUrl,
  imageName,
  imageType,
  onApply,
  onClose,
}: ImageCropDialogProps) {
  const { tx } = useI18n(RESOURCES_NAMESPACE);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState<CropAspect>("original");
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const aspectRatio = useMemo(() => {
    if (aspect === "square") {
      return 1;
    }
    if (aspect === "landscape") {
      return 16 / 9;
    }
    if (aspect === "portrait") {
      return 4 / 5;
    }
    if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
      return imageSize.width / imageSize.height;
    }
    return 1;
  }, [aspect, imageSize]);

  const baseScale = useMemo(() => {
    if (!imageSize || frameSize.width === 0 || frameSize.height === 0) {
      return 1;
    }
    return Math.max(
      frameSize.width / imageSize.width,
      frameSize.height / imageSize.height,
    );
  }, [frameSize.height, frameSize.width, imageSize]);

  const scaledWidth = imageSize ? imageSize.width * baseScale * zoom : 0;
  const scaledHeight = imageSize ? imageSize.height * baseScale * zoom : 0;
  const maxOffsetX = Math.max(0, (scaledWidth - frameSize.width) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - frameSize.height) / 2);

  const clampedPosition = useMemo(
    () => ({
      x: clamp(position.x, -maxOffsetX, maxOffsetX),
      y: clamp(position.y, -maxOffsetY, maxOffsetY),
    }),
    [maxOffsetX, maxOffsetY, position.x, position.y],
  );

  useEffect(() => {
    if (clampedPosition.x !== position.x || clampedPosition.y !== position.y) {
      setPosition(clampedPosition);
    }
  }, [clampedPosition, position.x, position.y]);

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setErrorMessage(null);
  }, [aspect, imageUrl]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];
      if (!nextEntry) {
        return;
      }
      setFrameSize({
        width: nextEntry.contentRect.width,
        height: nextEntry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, saving]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: clampedPosition.x,
      originY: clampedPosition.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setPosition({
      x: clamp(
        dragState.originX + event.clientX - dragState.startX,
        -maxOffsetX,
        maxOffsetX,
      ),
      y: clamp(
        dragState.originY + event.clientY - dragState.startY,
        -maxOffsetY,
        maxOffsetY,
      ),
    });
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState && dragState.pointerId === event.pointerId) {
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleApply = async () => {
    if (!imageSize || frameSize.width === 0 || frameSize.height === 0) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const image = await loadImageElement(imageUrl);
      const outputType = getOutputMimeType(imageType);
      const effectiveScale = baseScale * zoom;
      const sourceWidth = frameSize.width / effectiveScale;
      const sourceHeight = frameSize.height / effectiveScale;
      const sourceCenterX =
        imageSize.width / 2 - clampedPosition.x / effectiveScale;
      const sourceCenterY =
        imageSize.height / 2 - clampedPosition.y / effectiveScale;
      const sourceX = clamp(
        sourceCenterX - sourceWidth / 2,
        0,
        Math.max(0, imageSize.width - sourceWidth),
      );
      const sourceY = clamp(
        sourceCenterY - sourceHeight / 2,
        0,
        Math.max(0, imageSize.height - sourceHeight),
      );
      const outputWidth = Math.max(1, Math.round(sourceWidth));
      const outputHeight = Math.max(1, Math.round(sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error(tx("Das Bild konnte nicht bearbeitet werden.", "de"));
      }

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (nextBlob) => resolve(nextBlob),
          outputType,
          outputType === "image/jpeg" ? 0.92 : undefined,
        );
      });

      if (!blob) {
        throw new Error(tx("Das Bild konnte nicht bearbeitet werden.", "de"));
      }

      await onApply(
        new File([blob], buildCroppedFileName(imageName, outputType), {
          type: blob.type || outputType,
        }),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Das Bild konnte nicht bearbeitet werden.", "de"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {tx("Bild zuschneiden", "de")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx(
                "Wähle einen Ausschnitt, ziehe das Bild und passe den Zoom an.",
                "de",
              )}
            </p>
          </div>
          <Button kind="secondary" onClick={onClose} disabled={saving}>
            {tx("Schließen", "de")}
          </Button>
        </div>

        <div className="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            <div
              ref={frameRef}
              className="relative mx-auto w-full max-w-3xl cursor-grab overflow-hidden rounded-[2rem] bg-foreground active:cursor-grabbing"
              style={{ aspectRatio }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <img
                src={imageUrl}
                alt={imageName}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onLoad={(event) => {
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: scaledWidth || undefined,
                  height: scaledHeight || undefined,
                  transform: `translate(calc(-50% + ${clampedPosition.x}px), calc(-50% + ${clampedPosition.y}px))`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] border border-background/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" />
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {tx(
                "Ziehe das Bild im Rahmen, um den Ausschnitt zu verschieben.",
                "de",
              )}
            </p>
          </div>

          <div className="space-y-5 rounded-[1.5rem] border border-border bg-muted/50 p-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tx("Format", "de")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["original", tx("Original", "de")],
                    ["landscape", tx("Querformat", "de")],
                    ["portrait", tx("Hochformat", "de")],
                    ["square", tx("Quadrat", "de")],
                  ] as Array<[CropAspect, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAspect(value)}
                    className={
                      aspect === value
                        ? "rounded-xl border border-primary bg-primary-soft px-3 py-2 text-sm font-semibold text-primary"
                        : "rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground/80 transition hover:border-input hover:bg-accent"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tx("Zoom", "de")}
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">{zoom.toFixed(2)}x</p>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button kind="secondary" onClick={onClose} disabled={saving}>
                {tx("Abbrechen", "de")}
              </Button>
              <Button
                kind="primary"
                onClick={() => void handleApply()}
                disabled={saving || !imageSize}
              >
                {saving
                  ? tx("Speichert…", "de")
                  : tx("Zuschnitt übernehmen", "de")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
