import "server-only";

type OpeninaryUploadFile = {
  filename: string;
  path: string;
  size: number;
  url: string;
  prewarmedUrls?: string[];
};

type OpeninaryUploadResponse = {
  success: boolean;
  error?: string;
  files?: OpeninaryUploadFile[];
  errors?: Array<{ filename?: string; error?: string }>;
};

type UploadOpeninaryMediaOptions = {
  data: Buffer | Uint8Array;
  contentType: string;
  path: string;
  transformations?: string[];
};

const requiredEnv = (name: "OPENINARY_BASE_URL" | "OPENINARY_API_KEY") => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
};

const isAnimatedGifContentType = (contentType: string) =>
  contentType.split(";", 1)[0].trim().toLowerCase() === "image/gif";

const CONTENT_TYPE_EXTENSIONS: Record<string, readonly string[]> = {
  "image/avif": ["avif"],
  "image/gif": ["gif"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/vnd.adobe.photoshop": ["psd"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
  "video/webm": ["webm"],
};

const normalizeFilenameExtension = (filename: string, contentType: string) => {
  const lastDotIndex = filename.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1;
  const basename = hasExtension ? filename.slice(0, lastDotIndex) : filename;
  const currentExtension = hasExtension
    ? filename.slice(lastDotIndex + 1).toLowerCase()
    : "";
  const normalizedContentType = contentType.split(";", 1)[0].trim().toLowerCase();
  const allowedExtensions = CONTENT_TYPE_EXTENSIONS[normalizedContentType];

  if (!allowedExtensions) {
    return hasExtension ? `${basename}.${currentExtension}` : filename;
  }

  const extension = allowedExtensions.includes(currentExtension)
    ? currentExtension
    : allowedExtensions[0];
  return `${basename}.${extension}`;
};

const splitStoragePath = (path: string, contentType: string) => {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const rawFilename = segments.pop();

  if (!rawFilename) {
    throw new Error("Openinary upload path must include a filename.");
  }

  return {
    filename: normalizeFilenameExtension(rawFilename, contentType),
    folder: segments.join("/"),
  };
};

const normalizedStoragePath = (path: string, contentType: string) => {
  const { filename, folder } = splitStoragePath(path, contentType);
  return folder ? `${folder}/${filename}` : filename;
};

export const getUploadedMediaPublicUrl = ({
  path,
  contentType,
}: {
  path: string;
  contentType: string;
}) => {
  const storagePath = normalizedStoragePath(path, contentType);
  const baseUrl = requiredEnv("OPENINARY_BASE_URL").replace(/\/+$/, "");
  if (isAnimatedGifContentType(contentType)) {
    return `${baseUrl}/api/download/${storagePath}`;
  }
  return `${baseUrl}/t/${storagePath}`;
};

export const uploadOpeninaryMedia = async ({
  data,
  contentType,
  path,
  transformations = [],
}: UploadOpeninaryMediaOptions) => {
  const baseUrl = requiredEnv("OPENINARY_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("OPENINARY_API_KEY");
  const { filename, folder } = splitStoragePath(path, contentType);
  const bytes = new Uint8Array(data);
  const form = new FormData();

  form.append("files", new File([bytes], filename, { type: contentType }));
  form.append("names", filename);
  if (folder) {
    form.append("folder", folder);
  }
  for (const transformation of transformations) {
    form.append("transformations", transformation);
  }

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const responseText = await response.text();

  let payload: OpeninaryUploadResponse | null = null;
  try {
    payload = JSON.parse(responseText) as OpeninaryUploadResponse;
  } catch {
    payload = null;
  }

  const uploadedFile = payload?.files?.[0];
  if (!response.ok || !uploadedFile?.path) {
    const uploadError =
      payload?.errors?.[0]?.error ??
      payload?.error ??
      (responseText && responseText.length < 500 ? responseText : null) ??
      `HTTP ${response.status}`;
    throw new Error(`Openinary upload failed: ${uploadError}`);
  }

  return {
    ...uploadedFile,
    url: getUploadedMediaPublicUrl({
      path: uploadedFile.path,
      contentType,
    }),
  };
};
