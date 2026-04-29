export type ResourceMediaKind = "image" | "video" | "document" | "unknown";

export type ResourceMediaPreviewMap = Record<string, string>;
export type ResourceMediaPosterMap = Record<string, string>;

type SupabaseRenderResizeMode = "cover" | "contain" | "fill";

type SupabaseRenderImageOptions = {
  width?: number;
  height?: number;
  resize?: SupabaseRenderResizeMode;
};

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const VIDEO_EXTENSIONS = new Set([
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

const DOCUMENT_EXTENSIONS = new Set(["pdf"]);

const getPathname = (value: string) => {
  try {
    return new URL(value).pathname;
  } catch {
    return value.split("?")[0]?.split("#")[0] ?? value;
  }
};

const getExtension = (value: string) => {
  const pathname = getPathname(value);
  const filename = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
};

export const isImageMimeType = (value?: string | null) =>
  typeof value === "string" && value.startsWith("image/");

export const isVideoMimeType = (value?: string | null) =>
  typeof value === "string" && value.startsWith("video/");

export const isPdfMimeType = (value?: string | null) =>
  typeof value === "string" && value.toLowerCase().includes("pdf");

export const getResourceMediaKindFromMimeType = (
  value?: string | null,
): ResourceMediaKind => {
  if (isImageMimeType(value)) {
    return "image";
  }
  if (isVideoMimeType(value)) {
    return "video";
  }
  if (isPdfMimeType(value)) {
    return "document";
  }
  return "unknown";
};

export const getResourceMediaKindFromUrl = (
  value?: string | null,
): ResourceMediaKind => {
  if (!value) {
    return "unknown";
  }

  const extension = getExtension(value);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return "unknown";
};

export const isImageUrl = (value?: string | null) =>
  getResourceMediaKindFromUrl(value) === "image";

export const isVideoUrl = (value?: string | null) =>
  getResourceMediaKindFromUrl(value) === "video";

export const isPdfUrl = (value?: string | null) =>
  getResourceMediaKindFromUrl(value) === "document";

const normalizeResourceMediaMap = (
  value: unknown,
): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([originalUrl, previewUrl]) =>
      typeof originalUrl === "string" &&
      originalUrl.length > 0 &&
      typeof previewUrl === "string" &&
      previewUrl.length > 0,
  ) as Array<[string, string]>;

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
};

export const normalizeResourceMediaPreviews = (
  value: unknown,
): ResourceMediaPreviewMap | undefined =>
  normalizeResourceMediaMap(value) as ResourceMediaPreviewMap | undefined;

export const normalizeResourceMediaPosters = (
  value: unknown,
): ResourceMediaPosterMap | undefined =>
  normalizeResourceMediaMap(value) as ResourceMediaPosterMap | undefined;

export const getResourcePreviewUrl = (
  originalUrl?: string | null,
  mediaPreviews?: ResourceMediaPreviewMap | null,
) => {
  if (!originalUrl) {
    return originalUrl ?? null;
  }

  return mediaPreviews?.[originalUrl] ?? originalUrl;
};

export const getResourcePosterUrl = (
  originalUrl?: string | null,
  mediaPosters?: ResourceMediaPosterMap | null,
) => {
  if (!originalUrl) {
    return originalUrl ?? null;
  }

  return mediaPosters?.[originalUrl] ?? null;
};

export const getSupabaseRenderedImageUrl = (
  url: string,
  options: SupabaseRenderImageOptions = {},
) => {
  try {
    const marker = "/storage/v1/object/public/";
    if (!url.includes(marker)) {
      return url;
    }

    const parsed = new URL(url);
    const renderPathMarker = "/storage/v1/render/image/";
    const targetUrl = url.includes(renderPathMarker)
      ? parsed
      : new URL(
          `${parsed.origin}/storage/v1/render/image/public/${parsed.pathname.slice(
            parsed.pathname.indexOf(marker) + marker.length,
          )}`,
        );

    if (options.width) {
      targetUrl.searchParams.set("width", String(options.width));
    }
    if (options.height) {
      targetUrl.searchParams.set("height", String(options.height));
    }
    if (options.resize) {
      targetUrl.searchParams.set("resize", options.resize);
    }

    return targetUrl.toString();
  } catch {
    return url;
  }
};
