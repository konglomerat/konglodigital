import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const limitArgument = process.argv.find((argument) =>
  argument.startsWith("--limit="),
);
const LIMIT = limitArgument
  ? Number.parseInt(limitArgument.slice("--limit=".length), 10)
  : null;
const NON_IMAGE_EXTENSIONS = new Set([
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "pdf",
  "webm",
]);
const IMAGE_CONTENT_TYPES = {
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  psd: "image/vnd.adobe.photoshop",
  webp: "image/webp",
};
const CONTENT_TYPE_EXTENSIONS = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/vnd.adobe.photoshop": "psd",
  "image/webp": "webp",
};
const DEFAULT_OPENINARY_BASE_URL = "https://media.konglomerat.org";
const DOKPLOY_APPLICATION_ID = "hE8YNTWHKxEJKdw170Gn2";

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
};

const parseEnvironment = (value) =>
  new Map(
    (value ?? "")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return separatorIndex === -1
          ? [line, ""]
          : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );

const loadOpeninaryConfiguration = async () => {
  const localApiKey = process.env.OPENINARY_API_KEY?.trim();
  if (localApiKey) {
    return {
      apiKey: localApiKey,
      baseUrl:
        process.env.OPENINARY_BASE_URL?.trim() ??
        DEFAULT_OPENINARY_BASE_URL,
    };
  }

  const dokployApiKey = requiredEnv("DOKPLOY_API_KEY");
  const response = await fetch(
    `https://tools.konglomerat.org/api/application.one?applicationId=${DOKPLOY_APPLICATION_ID}`,
    {
      headers: { "x-api-key": dokployApiKey },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Unable to load Openinary configuration from Dokploy (HTTP ${response.status}).`,
    );
  }

  const application = await response.json();
  const environment = parseEnvironment(application.env);
  const apiKey = environment.get("OPENINARY_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("OPENINARY_API_KEY is missing from the Dokploy app.");
  }

  return {
    apiKey,
    baseUrl:
      environment.get("OPENINARY_BASE_URL")?.trim() ??
      DEFAULT_OPENINARY_BASE_URL,
  };
};

const getUrlExtension = (value) => {
  try {
    const pathname = new URL(value).pathname;
    return pathname.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
  } catch {
    return "";
  }
};

const isMigratableImageUrl = (value) => {
  if (typeof value !== "string" || !value.startsWith("http")) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname === "media.konglomerat.org" &&
      parsed.pathname.startsWith("/t/")
    ) {
      return false;
    }
    return !NON_IMAGE_EXTENSIONS.has(getUrlExtension(value));
  } catch {
    return false;
  }
};

const getOriginalSupabaseUrl = (value) => {
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(
    "/storage/v1/render/image/public/",
    "/storage/v1/object/public/",
  );
  parsed.search = "";
  return parsed.toString();
};

const sanitizeFilename = (value) =>
  value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120) || "image";

const buildOpeninaryPath = (resourceId, sourceUrl) => {
  const parsed = new URL(sourceUrl);
  const originalFilename =
    decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "image");
  const digest = crypto
    .createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 16);
  return `resources/${resourceId}/migrated/${digest}-${sanitizeFilename(
    originalFilename,
  )}`;
};

const uploadImage = async ({
  apiKey,
  baseUrl,
  uploadBaseUrl,
  resourceId,
  sourceUrl,
}) => {
  const originalUrl = getOriginalSupabaseUrl(sourceUrl);
  const downloadResponse = await fetch(originalUrl);
  if (!downloadResponse.ok) {
    throw new Error(
      `Download failed (HTTP ${downloadResponse.status}): ${sourceUrl}`,
    );
  }

  const downloadedBytes = Buffer.from(await downloadResponse.arrayBuffer());
  const sourceExtension = getUrlExtension(originalUrl);
  let contentType =
    downloadResponse.headers.get("content-type") ??
    IMAGE_CONTENT_TYPES[sourceExtension] ??
    "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    try {
      const metadata = await sharp(downloadedBytes, {
        failOn: "none",
      }).metadata();
      contentType =
        IMAGE_CONTENT_TYPES[metadata.format] ?? `image/${metadata.format}`;
    } catch {
      return null;
    }
  }

  const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();
  const targetExtension = CONTENT_TYPE_EXTENSIONS[normalizedContentType];
  if (!targetExtension) {
    return null;
  }

  let storagePath = buildOpeninaryPath(resourceId, sourceUrl);
  if (!IMAGE_CONTENT_TYPES[getUrlExtension(storagePath)]) {
    storagePath = `${storagePath}.${targetExtension}`;
  }
  const pathSegments = storagePath.split("/");
  const filename = pathSegments.pop();
  const form = new FormData();
  form.append(
    "files",
    new File([downloadedBytes], filename, { type: normalizedContentType }),
  );
  form.append("folder", pathSegments.join("/"));
  form.append("names", filename);
  for (const transformation of [
    "w_480,q_75",
    "w_960,q_75",
    "w_1600,q_82",
  ]) {
    form.append("transformations", transformation);
  }

  const uploadResponse = await fetch(
    `${uploadBaseUrl.replace(/\/+$/, "")}/api/upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );
  const responseText = await uploadResponse.text();
  let payload = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  const uploadedPath = payload?.files?.[0]?.path;
  if (!uploadResponse.ok || !uploadedPath) {
    throw new Error(
      `Upload failed (HTTP ${uploadResponse.status}): ${
        payload?.errors?.[0]?.error ?? sourceUrl
      }`,
    );
  }

  return `${baseUrl.replace(/\/+$/, "")}/t/${uploadedPath.replace(/^\/+/, "")}`;
};

const replaceMediaMap = (value, replacements) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      replacements.get(key) ?? key,
      typeof entryValue === "string"
        ? (replacements.get(entryValue) ?? entryValue)
        : entryValue,
    ]),
  );
};

const { apiKey, baseUrl } = await loadOpeninaryConfiguration();
const uploadBaseUrl =
  process.env.OPENINARY_UPLOAD_BASE_URL?.trim() ?? baseUrl;
const supabase = createClient(
  process.env.SUPABASE_URL?.trim() ??
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

let query = supabase
  .from("resources")
  .select("id,image,images,media_previews,media_posters,type")
  .ilike("type", "project")
  .order("created_at", { ascending: true });
if (Number.isFinite(LIMIT) && LIMIT > 0) {
  query = query.limit(LIMIT);
}

const { data: projects, error: projectsError } = await query;
if (projectsError) {
  throw new Error(projectsError.message);
}

const replacements = new Map();
let uploadCount = 0;
let updateCount = 0;
let failureCount = 0;

for (const [projectIndex, project] of (projects ?? []).entries()) {
  const mediaUrls = new Set([
    project.image,
    ...(Array.isArray(project.images) ? project.images : []),
    ...Object.keys(project.media_previews ?? {}),
    ...Object.values(project.media_previews ?? {}),
    ...Object.keys(project.media_posters ?? {}),
    ...Object.values(project.media_posters ?? {}),
  ]);
  const imageUrls = [...mediaUrls].filter(isMigratableImageUrl);

  for (const sourceUrl of imageUrls) {
    if (replacements.has(sourceUrl)) {
      continue;
    }
    if (!APPLY) {
      replacements.set(sourceUrl, sourceUrl);
      continue;
    }

    try {
      const openinaryUrl = await uploadImage({
        apiKey,
        baseUrl,
        uploadBaseUrl,
        resourceId: project.id,
        sourceUrl,
      });
      if (!openinaryUrl) {
        continue;
      }
      replacements.set(sourceUrl, openinaryUrl);
      uploadCount += 1;
      console.log(
        `[${projectIndex + 1}/${projects.length}] uploaded ${uploadCount}: ${project.id}`,
      );
    } catch (error) {
      failureCount += 1;
      console.error(
        `[${projectIndex + 1}/${projects.length}] ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (!APPLY) {
    continue;
  }

  const nextImage =
    typeof project.image === "string"
      ? (replacements.get(project.image) ?? project.image)
      : project.image;
  const nextImages = Array.isArray(project.images)
    ? project.images.map((url) => replacements.get(url) ?? url)
    : project.images;
  const nextMediaPreviews = replaceMediaMap(
    project.media_previews,
    replacements,
  );
  const nextMediaPosters = replaceMediaMap(project.media_posters, replacements);
  const changed =
    nextImage !== project.image ||
    JSON.stringify(nextImages) !== JSON.stringify(project.images) ||
    JSON.stringify(nextMediaPreviews) !== JSON.stringify(project.media_previews) ||
    JSON.stringify(nextMediaPosters) !== JSON.stringify(project.media_posters);

  if (!changed) {
    continue;
  }

  const { error: updateError } = await supabase
    .from("resources")
    .update({
      image: nextImage,
      images: nextImages,
      media_previews: nextMediaPreviews,
      media_posters: nextMediaPosters,
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id);
  if (updateError) {
    failureCount += 1;
    console.error(
      `[${projectIndex + 1}/${projects.length}] update failed: ${updateError.message}`,
    );
    continue;
  }
  updateCount += 1;
}

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      projects: projects?.length ?? 0,
      candidateImages: replacements.size,
      uploadedImages: uploadCount,
      updatedProjects: updateCount,
      failures: failureCount,
      supabaseOriginalsDeleted: 0,
    },
    null,
    2,
  ),
);

if (failureCount > 0) {
  process.exitCode = 1;
}
