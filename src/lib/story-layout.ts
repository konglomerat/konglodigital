import type { StoryDraftSlide, StorySource } from "@/lib/story-drafts";

export type StoryTextRole = "kicker" | "headline" | "body";

export type StoryLayoutTextObject = {
  kind: "textbox";
  role: StoryTextRole;
  left: number;
  top: number;
  width: number;
  fontSize: number;
  fontWeight: number;
  fill: string;
  textAlign: "left" | "center" | "right";
  backgroundColor: string | null;
  padding: number;
};

export type StoryLayoutRectObject = {
  kind: "rect";
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  rx: number;
  ry: number;
};

export type StoryLayoutObject = StoryLayoutTextObject | StoryLayoutRectObject;

export type StoryLayoutSlide = {
  backgroundColor: string;
  overlayColor: string;
  overlayOpacity: number;
  objects: StoryLayoutObject[];
};

export type StoryLayoutResult = {
  slides: StoryLayoutSlide[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const sanitizeTextObject = (value: StoryLayoutTextObject): StoryLayoutTextObject => ({
  kind: "textbox",
  role: value.role,
  left: clamp(Math.round(value.left), 32, 980),
  top: clamp(Math.round(value.top), 32, 1820),
  width: clamp(Math.round(value.width), 120, 980),
  fontSize: clamp(Math.round(value.fontSize), 22, 120),
  fontWeight: clamp(Math.round(value.fontWeight), 400, 900),
  fill: value.fill || "#111827",
  textAlign: value.textAlign,
  backgroundColor: value.backgroundColor || null,
  padding: clamp(Math.round(value.padding), 0, 48),
});

const sanitizeRectObject = (value: StoryLayoutRectObject): StoryLayoutRectObject => ({
  kind: "rect",
  left: clamp(Math.round(value.left), 0, 1080),
  top: clamp(Math.round(value.top), 0, 1920),
  width: clamp(Math.round(value.width), 80, 1080),
  height: clamp(Math.round(value.height), 80, 1920),
  fill: value.fill || "#f8fafc",
  opacity: clamp(value.opacity, 0, 1),
  rx: clamp(Math.round(value.rx), 0, 120),
  ry: clamp(Math.round(value.ry), 0, 120),
});

export const sanitizeStoryLayoutSlide = (
  value: StoryLayoutSlide,
): StoryLayoutSlide => ({
  backgroundColor: value.backgroundColor || "#f5efe7",
  overlayColor: value.overlayColor || "rgba(17,24,39,0)",
  overlayOpacity: 0,
  objects: value.objects.map((object) =>
    object.kind === "textbox"
      ? sanitizeTextObject(object)
      : sanitizeRectObject(object),
  ),
});

export const createFallbackStoryLayout = ({
  source,
  slides,
}: {
  source: StorySource;
  slides: StoryDraftSlide[];
}): StoryLayoutResult => ({
  slides: slides.map((slide, index) => {
    const hasLongHeadline = slide.headline.length > 40;
    const textAlign = "left";

    return sanitizeStoryLayoutSlide({
      backgroundColor: index === 0 ? "#f5efe7" : "#ede9d9",
      overlayColor: "rgba(17,24,39,0)",
      overlayOpacity: 0,
      objects: [
        {
          kind: "rect",
          left: index === 0 ? 52 : 58,
          top: index === 0 ? 1190 : 1160,
          width: index === 0 ? 976 : 964,
          height: index === 0 ? 590 : 610,
          fill: "#fffaf4",
          opacity: 0.96,
          rx: 46,
          ry: 46,
        },
        {
          kind: "textbox",
          role: "kicker",
          left: index === 0 ? 96 : 102,
          top: index === 0 ? 1254 : 1224,
          width: index === 0 ? 860 : 848,
          fontSize: 26,
          fontWeight: 700,
          fill: "#64748b",
          textAlign,
          backgroundColor: null,
          padding: 0,
        },
        {
          kind: "textbox",
          role: "headline",
          left: index === 0 ? 94 : 102,
          top: index === 0 ? 1318 : 1288,
          width: index === 0 ? 872 : 860,
          fontSize: hasLongHeadline ? 62 : 74,
          fontWeight: 800,
          fill: "#111827",
          textAlign,
          backgroundColor: null,
          padding: 0,
        },
        {
          kind: "textbox",
          role: "body",
          left: index === 0 ? 96 : 102,
          top: index === 0 ? 1528 : 1502,
          width: index === 0 ? 860 : 848,
          fontSize: 32,
          fontWeight: 500,
          fill: "#334155",
          textAlign,
          backgroundColor: null,
          padding: 0,
        },
      ],
    });
  }),
});

export const normalizeStoryLayoutResult = (
  value: unknown,
  fallback: StoryLayoutResult,
): StoryLayoutResult => {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  const slides = Array.isArray(record?.slides) ? record.slides : [];

  return {
    slides: fallback.slides.map((fallbackSlide, index) => {
      const candidate = slides[index];
      if (!candidate || typeof candidate !== "object") {
        return fallbackSlide;
      }

      const slideRecord = candidate as Record<string, unknown>;
      const objects = Array.isArray(slideRecord.objects)
        ? slideRecord.objects
            .map((object): StoryLayoutObject | null => {
              if (!object || typeof object !== "object") {
                return null;
              }

              const objectRecord = object as Record<string, unknown>;
              if (objectRecord.kind === "textbox") {
                const role = objectRecord.role;
                if (
                  role !== "kicker" &&
                  role !== "headline" &&
                  role !== "body"
                ) {
                  return null;
                }

                return sanitizeTextObject({
                  kind: "textbox",
                  role,
                  left: Number(objectRecord.left),
                  top: Number(objectRecord.top),
                  width: Number(objectRecord.width),
                  fontSize: Number(objectRecord.fontSize),
                  fontWeight: Number(objectRecord.fontWeight),
                  fill:
                    typeof objectRecord.fill === "string"
                      ? objectRecord.fill
                      : "#111827",
                  textAlign:
                    objectRecord.textAlign === "center" ||
                    objectRecord.textAlign === "right"
                      ? objectRecord.textAlign
                      : "left",
                  backgroundColor:
                    typeof objectRecord.backgroundColor === "string"
                      ? objectRecord.backgroundColor
                      : null,
                  padding: Number(objectRecord.padding),
                });
              }

              if (objectRecord.kind === "rect") {
                return sanitizeRectObject({
                  kind: "rect",
                  left: Number(objectRecord.left),
                  top: Number(objectRecord.top),
                  width: Number(objectRecord.width),
                  height: Number(objectRecord.height),
                  fill:
                    typeof objectRecord.fill === "string"
                      ? objectRecord.fill
                      : "#f8fafc",
                  opacity: Number(objectRecord.opacity),
                  rx: Number(objectRecord.rx),
                  ry: Number(objectRecord.ry),
                });
              }

              return null;
            })
            .filter((object): object is StoryLayoutObject => Boolean(object))
        : fallbackSlide.objects;

      return sanitizeStoryLayoutSlide({
        backgroundColor:
          typeof slideRecord.backgroundColor === "string"
            ? slideRecord.backgroundColor
            : fallbackSlide.backgroundColor,
        overlayColor:
          typeof slideRecord.overlayColor === "string"
            ? slideRecord.overlayColor
            : fallbackSlide.overlayColor,
        overlayOpacity:
          typeof slideRecord.overlayOpacity === "number"
            ? slideRecord.overlayOpacity
            : fallbackSlide.overlayOpacity,
        objects,
      });
    }),
  };
};