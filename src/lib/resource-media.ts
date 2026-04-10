export type ResourceMediaKind = "image" | "video" | "unknown";

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