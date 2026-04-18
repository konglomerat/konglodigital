"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import Button from "@/app/[lang]/components/Button";
import type { StoryDraftSlide, StorySource } from "@/lib/story-drafts";
import {
  STORY_CONTENT_FONT_FAMILY,
  STORY_HEADING_FONT_FAMILY,
} from "@/lib/story-fonts";
import type {
  StoryLayoutObject,
  StoryLayoutRectObject,
  StoryLayoutSlide,
  StoryLayoutTextObject,
  StoryTextRole,
} from "@/lib/story-layout";

type FabricCanvas = import("fabric").Canvas;
type FabricImageObject = import("fabric").FabricImage;
type FabricTextbox = import("fabric").Textbox;
type FabricRect = import("fabric").Rect;
type FabricTransformMatrix = [number, number, number, number, number, number];

type FabricStorySlideEditorProps = {
  source: StorySource;
  slideIndex: number;
  slide: StoryDraftSlide;
  layout: StoryLayoutSlide;
  layoutVersion: number;
  showTextOverlay: boolean;
};

type FabricRefs = {
  canvas: FabricCanvas;
  image: FabricImageObject | null;
  textboxes: Map<StoryTextRole, FabricTextbox>;
  overlayRect: FabricRect | null;
};

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const IDENTITY_VIEWPORT_TRANSFORM: FabricTransformMatrix = [1, 0, 0, 1, 0, 0];

const getRoleText = (slide: StoryDraftSlide, role: StoryTextRole) => {
  if (role === "kicker") {
    return slide.kicker;
  }
  if (role === "headline") {
    return slide.headline;
  }
  return slide.body;
};

const createDownloadName = (baseName: string, slideNumber: number) =>
  `${baseName}-slide-${slideNumber}.png`;

const getTextFontFamily = (role: StoryTextRole) =>
  role === "headline"
    ? STORY_HEADING_FONT_FAMILY
    : STORY_CONTENT_FONT_FAMILY;

const attachDownload = (dataUrl: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
};

const applyTextboxSpec = (
  textbox: FabricTextbox,
  spec: StoryLayoutTextObject,
  text: string,
) => {
  textbox.set({
    originX: "left",
    originY: "top",
    left: spec.left,
    top: spec.top,
    width: spec.width,
    fontSize: spec.fontSize,
    fontWeight: spec.fontWeight,
    fontFamily: getTextFontFamily(spec.role),
    fill: spec.fill,
    textAlign: spec.textAlign,
    backgroundColor: spec.backgroundColor ?? undefined,
    padding: spec.padding,
    text,
  });
};

const applyRectSpec = (rect: FabricRect, spec: StoryLayoutRectObject) => {
  rect.set({
    originX: "left",
    originY: "top",
    left: spec.left,
    top: spec.top,
    width: spec.width,
    height: spec.height,
    fill: spec.fill,
    opacity: spec.opacity,
    rx: spec.rx,
    ry: spec.ry,
  });
};

const findRoleSpec = (
  objects: StoryLayoutObject[],
  role: StoryTextRole,
) => objects.find(
  (object): object is StoryLayoutTextObject =>
    object.kind === "textbox" && object.role === role,
);

const createViewportTransform = (scale: number): FabricTransformMatrix => [
  scale,
  0,
  0,
  scale,
  0,
  0,
];

export default function FabricStorySlideEditor({
  source,
  slideIndex,
  slide,
  layout,
  layoutVersion,
  showTextOverlay,
}: FabricStorySlideEditorProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRefsRef = useRef<FabricRefs | null>(null) as MutableRefObject<FabricRefs | null>;
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const backgroundImageUrl = useMemo(
    () => source.imageUrls[slideIndex] ?? source.imageUrls[0] ?? null,
    [source.imageUrls, slideIndex],
  );

  const getPreviewMetrics = () => {
    const host = canvasHostRef.current;
    if (!host) {
      return null;
    }

    const hostWidth = host.clientWidth;
    const hostHeight = host.clientHeight;
    if (hostWidth <= 0 || hostHeight <= 0) {
      return null;
    }

    const scale = Math.min(hostWidth / CANVAS_WIDTH, hostHeight / CANVAS_HEIGHT);

    return {
      width: Math.round(CANVAS_WIDTH * scale),
      height: Math.round(CANVAS_HEIGHT * scale),
      scale,
    };
  };

  const syncCanvasPreviewSize = () => {
    const fabricRefs = fabricRefsRef.current;
    const previewMetrics = getPreviewMetrics();
    if (!fabricRefs || !previewMetrics) {
      return;
    }

    fabricRefs.canvas.setDimensions({
      width: previewMetrics.width,
      height: previewMetrics.height,
    });
    fabricRefs.canvas.setViewportTransform(
      createViewportTransform(previewMetrics.scale),
    );

    fabricRefs.canvas.calcOffset();
    fabricRefs.canvas.requestRenderAll();
  };

  useEffect(() => {
    if (!canvasHostRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasPreviewSize();
    });

    resizeObserver.observe(canvasHostRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const initializeCanvas = async () => {
      if (!canvasElementRef.current) {
        return;
      }

      try {
        setCanvasError(null);
        setIsCanvasReady(false);

        const fabricModule = await import("fabric");
        if (isCancelled || !canvasElementRef.current) {
          return;
        }

        const { Canvas, FabricImage, Rect, Textbox } = fabricModule;
        const previewMetrics = getPreviewMetrics();
        const canvas = new Canvas(canvasElementRef.current, {
          width: previewMetrics?.width ?? CANVAS_WIDTH,
          height: previewMetrics?.height ?? CANVAS_HEIGHT,
          enableRetinaScaling: true,
          preserveObjectStacking: true,
          backgroundColor: layout.backgroundColor,
          selection: true,
        });
        canvas.setViewportTransform(
          previewMetrics
            ? createViewportTransform(previewMetrics.scale)
            : IDENTITY_VIEWPORT_TRANSFORM,
        );

        if (canvas.upperCanvasEl) {
          canvas.upperCanvasEl.style.backgroundColor = "transparent";
        }

        const rectSpec = layout.objects.find(
          (object): object is StoryLayoutRectObject => object.kind === "rect",
        );
        let overlayRect: FabricRect | null = null;
        let imageObject: FabricImageObject | null = null;
        if (rectSpec) {
          overlayRect = new Rect({
            originX: "left",
            originY: "top",
            left: rectSpec.left,
            top: rectSpec.top,
            width: rectSpec.width,
            height: rectSpec.height,
            fill: rectSpec.fill,
            opacity: rectSpec.opacity,
            rx: rectSpec.rx,
            ry: rectSpec.ry,
          });
          canvas.add(overlayRect);
        }

        if (backgroundImageUrl) {
          const image = await FabricImage.fromURL(backgroundImageUrl, {
            crossOrigin: "anonymous",
          });
          if (!isCancelled) {
            imageObject = image;
            image.set({
              originX: "left",
              originY: "top",
              left: 0,
              top: 0,
              selectable: true,
              evented: true,
              hasBorders: true,
              hasControls: true,
              lockRotation: true,
              cornerStyle: "circle",
              transparentCorners: false,
            });
            image.scaleToWidth(CANVAS_WIDTH);
            if ((image.getScaledHeight?.() ?? 0) < CANVAS_HEIGHT) {
              image.scaleToHeight(CANVAS_HEIGHT);
            }
            image.set({
              left: (CANVAS_WIDTH - (image.getScaledWidth?.() ?? CANVAS_WIDTH)) / 2,
              top: (CANVAS_HEIGHT - (image.getScaledHeight?.() ?? CANVAS_HEIGHT)) / 2,
            });
            canvas.add(image);
            canvas.sendObjectToBack(image);
          }
        }

        if (layout.overlayOpacity > 0) {
          const imageOverlay = new Rect({
            originX: "left",
            originY: "top",
            left: 0,
            top: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            fill: layout.overlayColor,
            opacity: layout.overlayOpacity,
            selectable: false,
            evented: false,
          });
          canvas.add(imageOverlay);
          if (overlayRect) {
            canvas.moveObjectTo(imageOverlay, 1);
          }
        }

        const textboxes = new Map<StoryTextRole, FabricTextbox>();
        (["kicker", "headline", "body"] as StoryTextRole[]).forEach((role) => {
          const spec = findRoleSpec(layout.objects, role);
          if (!spec) {
            return;
          }

          const textbox = new Textbox(getRoleText(slide, role), {
            originX: "left",
            originY: "top",
            left: spec.left,
            top: spec.top,
            width: spec.width,
            fontSize: spec.fontSize,
            fontWeight: spec.fontWeight,
            fontFamily: getTextFontFamily(role),
            fill: spec.fill,
            textAlign: spec.textAlign,
            backgroundColor: spec.backgroundColor ?? undefined,
            padding: spec.padding,
            editable: true,
            visible: showTextOverlay,
            lockScalingFlip: true,
          });

          textboxes.set(role, textbox);
          canvas.add(textbox);
        });

        canvas.renderAll();

        fabricRefsRef.current = {
          canvas,
          image: imageObject,
          textboxes,
          overlayRect,
        };
        syncCanvasPreviewSize();
        setIsCanvasReady(true);
      } catch (error) {
        setCanvasError(
          error instanceof Error
            ? error.message
            : "Fabric-Canvas konnte nicht initialisiert werden.",
        );
      }
    };

    initializeCanvas();

    return () => {
      isCancelled = true;
      fabricRefsRef.current?.canvas.dispose();
      fabricRefsRef.current = null;
    };
  }, [backgroundImageUrl, layout, layoutVersion, showTextOverlay, slide]);

  useEffect(() => {
    const fabricRefs = fabricRefsRef.current;
    if (!fabricRefs) {
      return;
    }

    fabricRefs.canvas.set({ backgroundColor: layout.backgroundColor });

    const rectSpec = layout.objects.find(
      (object): object is StoryLayoutRectObject => object.kind === "rect",
    );
    if (fabricRefs.overlayRect && rectSpec) {
      applyRectSpec(fabricRefs.overlayRect, rectSpec);
    }

    (["kicker", "headline", "body"] as StoryTextRole[]).forEach((role) => {
      const textbox = fabricRefs.textboxes.get(role);
      const spec = findRoleSpec(layout.objects, role);

      if (!textbox || !spec) {
        return;
      }

      applyTextboxSpec(textbox, spec, getRoleText(slide, role));
      textbox.set({ visible: showTextOverlay });
    });

    if (fabricRefs.image) {
      fabricRefs.canvas.sendObjectToBack(fabricRefs.image);
    }

    fabricRefs.canvas.requestRenderAll();
  }, [layout, showTextOverlay, slide]);

  const handleExport = async () => {
    if (!fabricRefsRef.current) {
      return;
    }

    try {
      setIsExporting(true);
      const canvas = fabricRefsRef.current.canvas;
      canvas.setDimensions({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      });
      canvas.setViewportTransform(IDENTITY_VIEWPORT_TRANSFORM);
      canvas.renderAll();

      const dataUrl = canvas.toDataURL({
        format: "png",
        multiplier: 1,
        enableRetinaScaling: false,
      });

      attachDownload(
        dataUrl,
        createDownloadName(source.downloadBaseName, slideIndex + 1),
      );
    } finally {
      syncCanvasPreviewSize();
      setIsExporting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[2rem] border border-border bg-muted/50 shadow-sm">
      <div ref={canvasHostRef} className="relative aspect-[9/16] w-full overflow-hidden bg-accent">
        <canvas
          ref={canvasElementRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block"
        />
        {!isCanvasReady && !canvasError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-card/70 text-sm text-muted-foreground">
            Layout wird aufgebaut...
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Slide {slideIndex + 1}
          </p>
          <p className="text-xs text-muted-foreground">
            Fabric.js Canvas, direkt bearbeitbar und als PNG exportierbar
          </p>
          {canvasError ? (
            <p className="mt-1 text-xs text-destructive">{canvasError}</p>
          ) : null}
        </div>
        <Button
          type="button"
          kind="secondary"
          size="small"
          onClick={handleExport}
          disabled={!isCanvasReady || isExporting}
        >
          {isExporting ? "Exportiert..." : "PNG exportieren"}
        </Button>
      </div>
    </div>
  );
}