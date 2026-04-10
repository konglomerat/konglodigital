export type ResourceMediaKind = "image" | "video" | "unknown";

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
  return "unknown";
};

export const isImageUrl = (value?: string | null) =>
  getResourceMediaKindFromUrl(value) === "image";

export const isVideoUrl = (value?: string | null) =>
  getResourceMediaKindFromUrl(value) === "video";

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
