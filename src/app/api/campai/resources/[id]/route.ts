import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExifReader from "exifreader";
import sharp from "sharp";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getResourceEditPermissionError, hasRight } from "@/lib/permissions";
import { ensureResourcePrettyTitle } from "@/lib/resource-pretty-title";
import { PROJECTS_CACHE_TAG } from "@/app/[lang]/projects/project-data";
import type { ResourcePayload } from "@/lib/campai-resources";
import {
  normalizeProjectLinks,
  parseProjectLinksJson,
  type ProjectLink,
} from "@/lib/project-links";
import {
  isImageMimeType,
  isImageUrl,
  isVideoMimeType,
  normalizeResourceMediaPosters,
  normalizeResourceMediaPreviews,
  type ResourceMediaPosterMap,
  type ResourceMediaPreviewMap,
} from "@/lib/resource-media";
import {
  getPointFeatures,
  normalizeResourceMapFeatures,
  upsertGpsPointFeature,
} from "@/app/[lang]/resources/map-features";
import {
  generateVideoPosterBuffer,
  generateVideoPreviewBuffer,
} from "@/lib/video-preview";
import { syncResourceToCampai, type ResourceSyncRecord } from "@/lib/campai-resource-rentals";

const splitList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeOptionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toPriority = (value: unknown) => {
  if (typeof value !== "string") {
    return 3;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  if (parsed < 1 || parsed > 5) {
    return 3;
  }
  return parsed;
};

const parseRelatedResourceIds = (value: string) =>
  Array.from(new Set(splitList(value))).slice(0, 30);

const PROJECT_RESOURCE_TYPE = "project";

const resolveRelatedResourceIds = async (
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"],
  ids: string[],
  excludeId?: string,
) => {
  const normalizedIds = ids
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => id !== excludeId);
  if (normalizedIds.length === 0) {
    return [] as string[];
  }

  const { data, error } = await supabase
    .from("resources")
    .select("id")
    .in("id", normalizedIds);
  if (error) {
    throw new Error(error.message || "Unable to resolve related resources.");
  }

  const resolvedIds = (data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return resolvedIds;
};

const resolveWorkshopResourceId = async (
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"],
  value: string,
) => {
  const normalizedId = value.trim();
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from("resources")
    .select("id, type")
    .eq("id", normalizedId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to resolve workshop resource.");
  }

  if (!data || typeof data.id !== "string") {
    return null;
  }

  return typeof data.type === "string" &&
    data.type.trim().toLowerCase() === "place"
    ? data.id
    : null;
};

const getWorkshopResourcesMap = async (
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"],
  workshopIds: Array<string | null | undefined>,
) => {
  const normalizedIds = Array.from(
    new Set(
      workshopIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );

  if (normalizedIds.length === 0) {
    return new Map<
      string,
      { id: string; name?: string; prettyTitle?: string | null }
    >();
  }

  const { data, error } = await supabase
    .from("resources")
    .select("id, name, pretty_title")
    .in("id", normalizedIds);

  if (error) {
    throw new Error(error.message || "Unable to load workshop resources.");
  }

  return new Map(
    (data ?? [])
      .filter(
        (
          row,
        ): row is {
          id: string;
          name: string | null;
          pretty_title: string | null;
        } => typeof row.id === "string",
      )
      .map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name ?? undefined,
          prettyTitle: row.pretty_title ?? null,
        },
      ]),
  );
};

const toCanonicalLinkPair = (sourceId: string, targetId: string) =>
  sourceId < targetId
    ? { resource_a: sourceId, resource_b: targetId }
    : { resource_a: targetId, resource_b: sourceId };

const setResourceLinks = async (
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"],
  sourceId: string,
  relatedIds: string[],
) => {
  const normalizedRelatedIds = Array.from(
    new Set(
      relatedIds.map((id) => id.trim()).filter((id) => id && id !== sourceId),
    ),
  );

  const { error: deleteError } = await supabase
    .from("resource_links")
    .delete()
    .or(`resource_a.eq.${sourceId},resource_b.eq.${sourceId}`);

  if (deleteError) {
    throw new Error(deleteError.message || "Unable to update resource links.");
  }

  if (normalizedRelatedIds.length === 0) {
    return;
  }

  const rows = Array.from(
    new Map(
      normalizedRelatedIds
        .map((targetId) => toCanonicalLinkPair(sourceId, targetId))
        .map((pair) => [`${pair.resource_a}:${pair.resource_b}`, pair]),
    ).values(),
  );

  const { error: insertError } = await supabase
    .from("resource_links")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message || "Unable to update resource links.");
  }
};

const getRelatedResourcesMap = async (
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"],
  sourceIds: string[],
) => {
  const normalizedSourceIds = Array.from(
    new Set(sourceIds.map((id) => id.trim()).filter(Boolean)),
  );
  const relatedMap = new Map<
    string,
    Array<{ id: string; name?: string; prettyTitle?: string | null }>
  >();
  normalizedSourceIds.forEach((id) => relatedMap.set(id, []));

  if (normalizedSourceIds.length === 0) {
    return relatedMap;
  }

  const [
    { data: linksA, error: linksAError },
    { data: linksB, error: linksBError },
  ] = await Promise.all([
    supabase
      .from("resource_links")
      .select("resource_a, resource_b")
      .in("resource_a", normalizedSourceIds),
    supabase
      .from("resource_links")
      .select("resource_a, resource_b")
      .in("resource_b", normalizedSourceIds),
  ]);

  if (linksAError || linksBError) {
    const missingTable = [linksAError?.message, linksBError?.message].some(
      (message) =>
        typeof message === "string" &&
        message.includes("resource_links") &&
        message.includes("schema cache"),
    );
    if (missingTable) {
      return relatedMap;
    }
    throw new Error(
      linksAError?.message ||
        linksBError?.message ||
        "Unable to load related resources.",
    );
  }

  const allLinks = [...(linksA ?? []), ...(linksB ?? [])].filter(
    (row): row is { resource_a: string; resource_b: string } =>
      typeof row.resource_a === "string" && typeof row.resource_b === "string",
  );

  const counterpartIds = Array.from(
    new Set(
      allLinks.flatMap((row) => {
        const ids: string[] = [];
        if (normalizedSourceIds.includes(row.resource_a)) {
          ids.push(row.resource_b);
        }
        if (normalizedSourceIds.includes(row.resource_b)) {
          ids.push(row.resource_a);
        }
        return ids;
      }),
    ),
  );

  const { data: counterpartRows, error: counterpartError } =
    counterpartIds.length
      ? await supabase
          .from("resources")
          .select("id, name, pretty_title")
          .in("id", counterpartIds)
      : { data: [], error: null };

  if (counterpartError) {
    throw new Error(
      counterpartError.message || "Unable to load related resources.",
    );
  }

  const counterpartById = new Map(
    (counterpartRows ?? [])
      .filter(
        (
          row,
        ): row is {
          id: string;
          name: string | null;
          pretty_title: string | null;
        } => typeof row.id === "string",
      )
      .map((row) => [
        row.id,
        {
          name: row.name ?? undefined,
          prettyTitle: row.pretty_title ?? null,
        },
      ]),
  );

  allLinks.forEach((row) => {
    if (normalizedSourceIds.includes(row.resource_a)) {
      const counterpart = counterpartById.get(row.resource_b);
      relatedMap.get(row.resource_a)?.push({
        id: row.resource_b,
        name: counterpart?.name,
        prettyTitle: counterpart?.prettyTitle,
      });
    }
    if (normalizedSourceIds.includes(row.resource_b)) {
      const counterpart = counterpartById.get(row.resource_a);
      relatedMap.get(row.resource_b)?.push({
        id: row.resource_a,
        name: counterpart?.name,
        prettyTitle: counterpart?.prettyTitle,
      });
    }
  });

  return relatedMap;
};

const readResourcePayload = async (request: NextRequest) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const images = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File);
    const image = formData.get("image");
    if (image instanceof File) {
      images.push(image);
    }
    const imageUrlsRaw = formData.get("imageUrls");
    let imageUrls: string[] | null | undefined = undefined;
    if (typeof imageUrlsRaw === "string") {
      try {
        const parsed = JSON.parse(imageUrlsRaw) as unknown;
        if (Array.isArray(parsed)) {
          imageUrls = parsed.filter(
            (value): value is string => typeof value === "string",
          );
        } else if (parsed === null) {
          imageUrls = null;
        }
      } catch {
        imageUrls = undefined;
      }
    }
    const maxImageWidthRaw = formData.get("maxImageWidth");
    const maxImageWidth =
      typeof maxImageWidthRaw === "string"
        ? Number.parseInt(maxImageWidthRaw, 10)
        : undefined;
    return {
      authorName: String(formData.get("authorName") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      type: String(formData.get("type") ?? ""),
      priority: toPriority(formData.get("priority")),
      publishDate: String(formData.get("publishDate") ?? ""),
      tags: String(formData.get("tags") ?? ""),
      relatedResourceIds: String(formData.get("relatedResourceIds") ?? ""),
      categories: String(formData.get("categories") ?? ""),
      categoryIds: String(formData.get("categoryIds") ?? ""),
      attachable: String(formData.get("attachable") ?? "0") === "1",
      workshopResourceId: String(formData.get("workshopResourceId") ?? ""),
      projectLinks: parseProjectLinksJson(
        typeof formData.get("projectLinks") === "string"
          ? String(formData.get("projectLinks") ?? "")
          : null,
      ),
      socialMediaConsent:
        String(formData.get("socialMediaConsent") ?? "0") === "1",
      imageFiles: images,
      imageUrl: undefined as string | null | undefined,
      imageUrls,
      maxImageWidth:
        typeof maxImageWidth === "number" && Number.isFinite(maxImageWidth)
          ? maxImageWidth
          : undefined,
    };
  }
  const body = (await request.json()) as {
    authorName?: string | null;
    name?: string;
    description?: string;
    type?: string;
    priority?: number | string;
    publishDate?: string | null;
    tags?: string[] | string;
    relatedResourceIds?: string[] | string;
    categories?: string[] | string;
    categoryIds?: string[] | string;
    attachable?: boolean;
    workshopResourceId?: string | null;
    projectLinks?: ProjectLink[] | unknown;
    socialMediaConsent?: boolean;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
  };
  const imageUrl = Object.prototype.hasOwnProperty.call(body, "imageUrl")
    ? (body.imageUrl ?? null)
    : undefined;
  const imageUrls = Object.prototype.hasOwnProperty.call(body, "imageUrls")
    ? (body.imageUrls ?? null)
    : undefined;
  return {
    authorName: body.authorName ?? "",
    name: body.name ?? "",
    description: body.description ?? "",
    type: body.type ?? "",
    priority: toPriority(String(body.priority ?? "")),
    publishDate: body.publishDate ?? "",
    tags: Array.isArray(body.tags) ? body.tags.join(",") : (body.tags ?? ""),
    relatedResourceIds: Array.isArray(body.relatedResourceIds)
      ? body.relatedResourceIds.join(",")
      : (body.relatedResourceIds ?? ""),
    categories: Array.isArray(body.categories)
      ? body.categories.join(",")
      : (body.categories ?? ""),
    categoryIds: Array.isArray(body.categoryIds)
      ? body.categoryIds.join(",")
      : (body.categoryIds ?? ""),
    attachable: body.attachable ?? false,
    workshopResourceId: body.workshopResourceId ?? "",
    projectLinks: normalizeProjectLinks(body.projectLinks),
    socialMediaConsent: body.socialMediaConsent ?? false,
    imageFiles: [] as File[],
    imageUrl,
    imageUrls,
    maxImageWidth: undefined as number | undefined,
  };
};

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

const normalizeImageUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
};

const imageUrlListsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

type GpsData = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
};

const isPlaceholderGpsCoordinate = (
  latitude: number | null,
  longitude: number | null,
) => latitude === 0 && longitude === 0;

const toNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    if ("numerator" in value && "denominator" in value) {
      const numerator = Number((value as { numerator: number }).numerator);
      const denominator = Number(
        (value as { denominator: number }).denominator,
      );
      if (!Number.isFinite(numerator)) {
        return null;
      }
      if (!Number.isFinite(denominator) || denominator === 0) {
        return numerator;
      }
      return numerator / denominator;
    }
  }
  return null;
};

const parseGpsCoordinate = (value: unknown) => {
  if (Array.isArray(value) && value.length >= 3) {
    const degrees = toNumber(value[0]);
    const minutes = toNumber(value[1]);
    const seconds = toNumber(value[2]);
    if (degrees === null || minutes === null || seconds === null) {
      return null;
    }
    return degrees + minutes / 60 + seconds / 3600;
  }
  return toNumber(value);
};

const getTagValue = (tag: unknown) => {
  if (!tag || typeof tag !== "object") {
    return null;
  }
  if ("value" in tag) {
    return (tag as { value: unknown }).value;
  }
  if ("description" in tag) {
    return (tag as { description: unknown }).description;
  }
  return null;
};

const extractGpsFromTags = (tags: unknown): GpsData | null => {
  const tagRecord =
    tags && typeof tags === "object" ? (tags as Record<string, unknown>) : {};
  const gpsGroup =
    (tagRecord as { gps?: Record<string, unknown> }).gps ?? undefined;
  const groupLatitude = gpsGroup ? toNumber(gpsGroup.Latitude) : null;
  const groupLongitude = gpsGroup ? toNumber(gpsGroup.Longitude) : null;
  const groupAltitude = gpsGroup ? toNumber(gpsGroup.Altitude) : null;
  if (
    groupLatitude !== null &&
    groupLongitude !== null &&
    !isPlaceholderGpsCoordinate(groupLatitude, groupLongitude)
  ) {
    return {
      latitude: groupLatitude,
      longitude: groupLongitude,
      altitude: groupAltitude,
    };
  }

  const latValue = getTagValue(tagRecord.GPSLatitude);
  const lonValue = getTagValue(tagRecord.GPSLongitude);
  const latRef = getTagValue(tagRecord.GPSLatitudeRef);
  const lonRef = getTagValue(tagRecord.GPSLongitudeRef);
  const altValue = getTagValue(tagRecord.GPSAltitude);
  const altRef = getTagValue(tagRecord.GPSAltitudeRef);

  const latitude = parseGpsCoordinate(latValue);
  const longitude = parseGpsCoordinate(lonValue);
  if (latitude === null || longitude === null) {
    return null;
  }

  const latRefNormalized =
    typeof latRef === "string" ? latRef.toUpperCase() : "N";
  const lonRefNormalized =
    typeof lonRef === "string" ? lonRef.toUpperCase() : "E";
  const signedLatitude = latRefNormalized.startsWith("S")
    ? -latitude
    : latitude;
  const signedLongitude = lonRefNormalized.startsWith("W")
    ? -longitude
    : longitude;

  if (isPlaceholderGpsCoordinate(signedLatitude, signedLongitude)) {
    return null;
  }

  let altitude = toNumber(altValue);
  const altRefValue = toNumber(altRef);
  if (altitude !== null && altRefValue === 1) {
    altitude = -Math.abs(altitude);
  }

  return {
    latitude: signedLatitude,
    longitude: signedLongitude,
    altitude,
  };
};

const extractGpsFromFile = async (file: File) => {
  if (!isImageMimeType(file.type)) {
    return null;
  }
  try {
    const buffer = await file.arrayBuffer();
    const tags = ExifReader.load(buffer, {
      includeTags: { gps: true },
      excludeTags: { xmp: true },
      computed: true,
      expanded: true,
    });
    return extractGpsFromTags(tags);
  } catch {
    return null;
  }
};

const extractGpsFromUrl = async (url: string) => {
  if (!isImageUrl(url)) {
    return null;
  }
  try {
    const response = await fetch(url, { cache: "no-store" });
    const buffer = await response.arrayBuffer();
    const tags = ExifReader.load(buffer, {
      includeTags: { gps: true },
      excludeTags: { xmp: true },
      computed: true,
      expanded: true,
    });
    return extractGpsFromTags(tags);
  } catch {
    return null;
  }
};

const getResizeOptions = (mimeType: string) => {
  if (mimeType.includes("png")) {
    return { format: "png" as const };
  }
  if (mimeType.includes("webp")) {
    return { format: "webp" as const, quality: 85 };
  }
  return { format: "jpeg" as const, quality: 85 };
};

const resizeImageBuffer = async (file: File, maxWidth: number) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isImageMimeType(file.type) || maxWidth <= 0) {
    return {
      data: buffer,
      contentType: file.type || "application/octet-stream",
    };
  }

  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || metadata.width <= maxWidth) {
      return {
        data: buffer,
        contentType: file.type || "application/octet-stream",
      };
    }

    const { format, quality } = getResizeOptions(file.type);
    const resized = image
      .resize({ width: maxWidth, withoutEnlargement: true })
      .withMetadata();

    const output =
      format === "png"
        ? resized.png().toBuffer()
        : format === "webp"
          ? resized.webp({ quality }).toBuffer()
          : resized.jpeg({ quality }).toBuffer();

    return {
      data: await output,
      contentType:
        format === "png"
          ? "image/png"
          : format === "webp"
            ? "image/webp"
            : "image/jpeg",
    };
  } catch {
    return {
      data: buffer,
      contentType: file.type || "application/octet-stream",
    };
  }
};

const describeImage = async (request: NextRequest, files: File[]) => {
  const formData = new FormData();
  files.slice(0, 3).forEach((file) => {
    formData.append("images", file, file.name);
  });
  const response = await fetch(`${request.nextUrl.origin}/api/openai/vision`, {
    method: "POST",
    body: formData,
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
  });
  const data = (await response.json()) as {
    description?: string;
    title?: string;
    tags?: string[];
    error?: string;
  };
  if (!response.ok || !data.description) {
    throw new Error(data.error ?? "OpenAI vision failed.");
  }
  return {
    description: data.description,
    title: data.title,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag) => typeof tag === "string")
      : undefined,
  };
};

type StoredCategory = {
  name?: string;
  bookingCategoryId?: string | null;
};

type StoredProjectLink = {
  label?: string;
  url?: string;
};

type ResourceRow = {
  id: string;
  pretty_title?: string | null;
  owner_id?: string | null;
  author_name?: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images?: string[] | null;
  media_previews?: unknown;
  media_posters?: unknown;
  project_links?: StoredProjectLink[] | null;
  social_media_consent?: boolean | null;
  workshop_resource_id?: string | null;
  priority?: number | null;
  gps_altitude?: number | null;
  type: string | null;
  attachable: boolean | null;
  tags: string[] | null;
  categories: StoredCategory[] | null;
  map_features?: unknown;
  publish_date?: string | null;
};

const toResourcePayload = (
  row: ResourceRow,
  workshopById = new Map<
    string,
    { id: string; name?: string; prettyTitle?: string | null }
  >(),
): ResourcePayload => ({
  ...(() => {
    const mapFeatures = normalizeResourceMapFeatures(row.map_features ?? null);
    const pointFeature = getPointFeatures(mapFeatures).find(
      (feature) => feature.id === "gps-point",
    );
    return {
      mapFeatures,
      gpsLatitude: pointFeature?.point[1] ?? null,
      gpsLongitude: pointFeature?.point[0] ?? null,
    };
  })(),
  id: row.id,
  prettyTitle: row.pretty_title ?? null,
  ownerId: row.owner_id ?? null,
  authorName: row.author_name ?? null,
  name: row.name,
  description: row.description ?? undefined,
  image: row.image ?? null,
  images: row.images ?? (row.image ? [row.image] : undefined),
    mediaPreviews: normalizeResourceMediaPreviews(row.media_previews) ?? null,
  mediaPosters: normalizeResourceMediaPosters(row.media_posters) ?? null,
  publishDate: row.publish_date ?? null,
  projectLinks: normalizeProjectLinks(row.project_links ?? []),
  socialMediaConsent: row.social_media_consent ?? false,
  workshopResource:
    row.workshop_resource_id != null
      ? (workshopById.get(row.workshop_resource_id) ?? {
          id: row.workshop_resource_id,
        })
      : null,
  gpsAltitude: row.gps_altitude ?? null,
  type: row.type ?? undefined,
  priority: row.priority ?? null,
  attachable: row.attachable ?? undefined,
  tags: row.tags ?? undefined,
  categories: Array.isArray(row.categories)
    ? row.categories.map((category) => ({
        name: category.name,
        bookingCategoryId: category.bookingCategoryId ?? undefined,
      }))
    : undefined,
});

const uploadResourceMedia = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  file: File,
  bucket: string,
  path: string,
  maxImageWidth: number,
) => {
  const { data: resized, contentType } = await resizeImageBuffer(
    file,
    maxImageWidth,
  );
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, resized, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || "Supabase image upload failed.");
  }
  if (!data?.path) {
    throw new Error("Supabase image upload failed.");
  }

  return data.path;
};

const buildPreviewVideoPath = (path: string) => {
  const lastDotIndex = path.lastIndexOf(".");
  return lastDotIndex === -1
    ? `${path}-preview.mp4`
    : `${path.slice(0, lastDotIndex)}-preview.mp4`;
};

const buildPosterImagePath = (path: string) => {
  const lastDotIndex = path.lastIndexOf(".");
  return lastDotIndex === -1
    ? `${path}-poster.jpg`
    : `${path.slice(0, lastDotIndex)}-poster.jpg`;
};

const filterMediaPreviews = (
  mediaPreviews: ResourceMediaPreviewMap,
  mediaUrls: string[],
) =>
  Object.fromEntries(
    Object.entries(mediaPreviews).filter(([originalUrl]) =>
      mediaUrls.includes(originalUrl),
    ),
  ) as ResourceMediaPreviewMap;

const filterMediaPosters = (
  mediaPosters: ResourceMediaPosterMap,
  mediaUrls: string[],
) =>
  Object.fromEntries(
    Object.entries(mediaPosters).filter(([originalUrl]) =>
      mediaUrls.includes(originalUrl),
    ),
  ) as ResourceMediaPosterMap;

const uploadVideoPreview = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  file: File,
  bucket: string,
  originalPath: string,
) => {
  const preview = await generateVideoPreviewBuffer(file);
  if (!preview) {
    return null;
  }

  const previewPath = buildPreviewVideoPath(originalPath);
  const { data, error } = await supabase.storage.from(bucket).upload(
    previewPath,
    preview.data,
    {
      contentType: preview.contentType,
      upsert: true,
    },
  );

  if (error) {
    throw new Error(error.message || "Supabase video preview upload failed.");
  }
  if (!data?.path) {
    throw new Error("Supabase video preview upload failed.");
  }

  return data.path;
};

const uploadVideoPoster = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  file: File,
  bucket: string,
  originalPath: string,
) => {
  const poster = await generateVideoPosterBuffer(file);
  if (!poster) {
    return null;
  }

  const posterPath = buildPosterImagePath(originalPath);
  const { data, error } = await supabase.storage.from(bucket).upload(
    posterPath,
    poster.data,
    {
      contentType: poster.contentType,
      upsert: true,
    },
  );

  if (error) {
    throw new Error(error.message || "Supabase video poster upload failed.");
  }
  if (!data?.path) {
    throw new Error("Supabase video poster upload failed.");
  }

  return data.path;
};

const extractStoragePath = (url: string, bucket: string) => {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return parsed.pathname.slice(index + marker.length);
  } catch {
    return null;
  }
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const params = await context.params;
  if (!params.id) {
    return NextResponse.json(
      { error: "Missing resource id." },
      { status: 400 },
    );
  }
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("resources")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workshopById = await getWorkshopResourcesMap(supabase, [
    (row as ResourceRow).workshop_resource_id ?? null,
  ]);
  const resource = toResourcePayload(row as ResourceRow, workshopById);
  resource.relatedResources =
    (await getRelatedResourcesMap(supabase, [resource.id])).get(resource.id) ??
    [];
  return NextResponse.json({ resource });
};

export const PUT = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const params = await context.params;
  if (!params.id) {
    return NextResponse.json(
      { error: "Missing resource id." },
      { status: 400 },
    );
  }
  const { supabase } = createSupabaseRouteClient(request);
  const adminSupabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: existingResource, error: existingResourceError } =
    await supabase
      .from("resources")
      .select(
        "owner_id, map_features, image, images, media_previews, media_posters, workshop_resource_id",
      )
      .eq("id", params.id)
      .maybeSingle();

  if (existingResourceError) {
    return NextResponse.json(
      { error: existingResourceError.message || "Unable to load resource." },
      { status: 500 },
    );
  }

  if (!existingResource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canEditByRight = hasRight(data.user, "resources:edit");
  const editPermissionError = getResourceEditPermissionError({
    hasEditRight: canEditByRight,
    isOwner: existingResource.owner_id === data.user.id,
  });
  if (editPermissionError) {
    return NextResponse.json({ error: editPermissionError }, { status: 403 });
  }

  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";

  const payload = await readResourcePayload(request);
  if (!payload.name.trim() && payload.imageFiles.length === 0) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!payload.type.trim()) {
    return NextResponse.json({ error: "Type is required." }, { status: 400 });
  }
  const imageFiles = payload.imageFiles.filter((file) =>
    isImageMimeType(file.type),
  );
  const categoryList = payload.categories ? splitList(payload.categories) : [];
  const categoryIdList = payload.categoryIds
    ? splitList(payload.categoryIds)
    : [];
  if (
    categoryList.length > 0 &&
    categoryIdList.length !== categoryList.length
  ) {
    return NextResponse.json(
      { error: "Category IDs are required for each category." },
      { status: 400 },
    );
  }
  if (categoryIdList.some((entry) => entry.length === 0)) {
    return NextResponse.json(
      { error: "Category IDs must not be empty." },
      { status: 400 },
    );
  }

  let imageUrl = payload.imageUrl;
  let imageUrls = payload.imageUrls;
  let description = payload.description?.trim() ?? "";
  let name = payload.name.trim();
  const authorName = normalizeOptionalText(payload.authorName);
  const publishDate = normalizeOptionalText(payload.publishDate);
  let tags = payload.tags ? splitList(payload.tags) : [];
  const workshopResourceId = await resolveWorkshopResourceId(
    supabase,
    payload.workshopResourceId ?? "",
  );
  const projectLinks = normalizeProjectLinks(payload.projectLinks ?? []);
  const existingImageUrl =
    typeof existingResource.image === "string" ? existingResource.image : null;
  const existingImageUrlsRaw = normalizeImageUrls(existingResource.images);
  const existingImageUrls =
    existingImageUrlsRaw.length > 0
      ? existingImageUrlsRaw
      : existingImageUrl
        ? [existingImageUrl]
        : [];
  const existingMediaPreviews =
    normalizeResourceMediaPreviews(existingResource.media_previews) ?? {};
  const existingMediaPosters =
    normalizeResourceMediaPosters(existingResource.media_posters) ?? {};

  const hasExplicitImageUrl = payload.imageUrl !== undefined;
  const hasExplicitImageUrls = payload.imageUrls !== undefined;
  const nextImageUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    : null;

  const imageUrlChanged =
    hasExplicitImageUrl && (payload.imageUrl ?? null) !== existingImageUrl;
  const imageUrlsChanged = hasExplicitImageUrls
    ? payload.imageUrls === null
      ? existingImageUrls.length > 0
      : !imageUrlListsEqual(nextImageUrls ?? [], existingImageUrls)
    : false;

  let imageUpdated =
    payload.imageFiles.length > 0 || imageUrlChanged || imageUrlsChanged;
  let nextMediaPreviews = existingMediaPreviews;
  let nextMediaPosters = existingMediaPosters;

  if (
    imageUpdated &&
    payload.imageFiles.length === 0 &&
    !hasExplicitImageUrl &&
    hasExplicitImageUrls
  ) {
    imageUrls = payload.imageUrls;
    imageUrl = Array.isArray(imageUrls) ? (imageUrls[0] ?? null) : null;
  }

  let gpsData: GpsData | null = null;
  if (payload.imageFiles.length > 0) {
    const baseImages = payload.imageUrls ?? [];
    const maxImageWidth = payload.maxImageWidth ?? 2000;
    const uploadedUrls: string[] = [];
    const uploadedMediaPreviews: ResourceMediaPreviewMap = {};
    const uploadedMediaPosters: ResourceMediaPosterMap = {};
    for (const file of payload.imageFiles) {
      const safeName = sanitizeFileName(file.name || "image");
      const path = `resources/${params.id}/${crypto.randomUUID()}-${safeName}`;
      const storedPath = await uploadResourceMedia(
        adminSupabase,
        file,
        storageBucket,
        path,
        maxImageWidth,
      );
      const publicUrl = supabase.storage
        .from(storageBucket)
        .getPublicUrl(storedPath).data.publicUrl;
      uploadedUrls.push(publicUrl);

      if (isVideoMimeType(file.type)) {
        const previewPath = await uploadVideoPreview(
          adminSupabase,
          file,
          storageBucket,
          path,
        );
        if (previewPath) {
          uploadedMediaPreviews[publicUrl] = supabase.storage
            .from(storageBucket)
            .getPublicUrl(previewPath).data.publicUrl;
        }

        const posterPath = await uploadVideoPoster(
          adminSupabase,
          file,
          storageBucket,
          path,
        );
        if (posterPath) {
          uploadedMediaPosters[publicUrl] = supabase.storage
            .from(storageBucket)
            .getPublicUrl(posterPath).data.publicUrl;
        }
      }
    }
    imageUrls = [...baseImages, ...uploadedUrls];
    imageUrl = imageUrls[0] ?? null;
    imageUpdated = true;
    nextMediaPreviews = {
      ...filterMediaPreviews(existingMediaPreviews, baseImages),
      ...uploadedMediaPreviews,
    };
    nextMediaPosters = {
      ...filterMediaPosters(existingMediaPosters, baseImages),
      ...uploadedMediaPosters,
    };
    if (imageFiles.length > 0) {
      const vision = await describeImage(request, imageFiles).catch(() => null);
      if (vision) {
        if (!description && vision.description) {
          description = vision.description;
        }
        if (!name && vision.title) {
          name = vision.title.trim();
        }
        if (tags.length === 0 && vision.tags) {
          tags = vision.tags.map((tag) => tag.trim()).filter(Boolean);
        }
      }
    }
  }

  if (imageUpdated && payload.imageFiles.length === 0) {
    const nextMediaUrls = Array.isArray(imageUrls)
      ? imageUrls.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
      : imageUrl
        ? [imageUrl]
        : [];
    nextMediaPreviews = filterMediaPreviews(
      existingMediaPreviews,
      nextMediaUrls,
    );
    nextMediaPosters = filterMediaPosters(existingMediaPosters, nextMediaUrls);
  }

  if (imageUpdated) {
    const primaryImageUrl = Array.isArray(imageUrls)
      ? (imageUrls.find((url) => isImageUrl(url)) ?? null)
      : imageUrl && isImageUrl(imageUrl)
        ? imageUrl
        : null;
    if (primaryImageUrl) {
      gpsData = await extractGpsFromUrl(primaryImageUrl);
    } else if (imageFiles.length > 0) {
      gpsData = await extractGpsFromFile(imageFiles[0]);
    }
  }

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  const categories = payload.categories ? splitList(payload.categories) : [];
  const categoryIds = payload.categoryIds ? splitList(payload.categoryIds) : [];
  const relatedResourceIds = await resolveRelatedResourceIds(
    supabase,
    parseRelatedResourceIds(payload.relatedResourceIds ?? ""),
    params.id,
  );
  const storedCategories =
    categories.length > 0
      ? categories.map((name, index) => ({
          name,
          bookingCategoryId: categoryIds[index] ?? null,
        }))
      : null;

  const updateData: Record<string, unknown> = {
    author_name: authorName,
    name,
    description: description ? description : null,
    type: payload.type.trim(),
    priority: payload.priority,
    publish_date: publishDate,
    tags: tags.length > 0 ? tags : null,
    categories: storedCategories,
    attachable: payload.attachable,
    project_links: projectLinks.length > 0 ? projectLinks : null,
    social_media_consent: payload.socialMediaConsent ?? false,
    workshop_resource_id: workshopResourceId,
    updated_at: new Date().toISOString(),
  };

  if (imageUpdated) {
    updateData.image = imageUrl ?? null;
    updateData.images = imageUrls ?? null;
    updateData.media_previews =
      Object.keys(nextMediaPreviews).length > 0 ? nextMediaPreviews : null;
    updateData.media_posters =
      Object.keys(nextMediaPosters).length > 0 ? nextMediaPosters : null;
    updateData.gps_altitude = gpsData?.altitude ?? null;
    updateData.map_features = upsertGpsPointFeature({
      features: normalizeResourceMapFeatures(existingResource.map_features),
      latitude: gpsData?.latitude ?? null,
      longitude: gpsData?.longitude ?? null,
    });
  }

  const { data: updated, error } = await supabase
    .from("resources")
    .update(updateData)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  console.log("Reading payload...", error);
  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message || "Unable to update resource." },
      { status: 500 },
    );
  }

  try {
    const prettyTitle = await ensureResourcePrettyTitle(adminSupabase, {
      resourceId: params.id,
      name,
    });
    updated.pretty_title = prettyTitle;
  } catch (prettyTitleError) {
    console.error("Unable to persist resource pretty title:", prettyTitleError);
  }

  await setResourceLinks(supabase, params.id, relatedResourceIds);

  const workshopById = await getWorkshopResourcesMap(supabase, [
    (updated as ResourceRow).workshop_resource_id ?? null,
  ]);
  const resource = toResourcePayload(updated as ResourceRow, workshopById);
  resource.relatedResources =
    (await getRelatedResourcesMap(supabase, [resource.id])).get(resource.id) ??
    [];
  const syncResult = await syncResourceToCampai(
    adminSupabase,
    updated as ResourceSyncRecord,
  );
  revalidateTag("resources", { expire: 0 });
  if (resource.type === PROJECT_RESOURCE_TYPE) {
    revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 });
  }
  return NextResponse.json({ resource, campaiSync: syncResult });
};

export const DELETE = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const params = await context.params;
  if (!params.id) {
    return NextResponse.json(
      { error: "Missing resource id." },
      { status: 400 },
    );
  }

  const { supabase } = createSupabaseRouteClient(request);
  const adminSupabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("resources")
    .select("name, image, images, media_previews, media_posters, owner_id, type")
    .eq("id", params.id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canDelete =
    hasRight(data.user, "resources:delete") || row.owner_id === data.user.id;
  if (!canDelete) {
    return NextResponse.json(
      { error: "Insufficient permissions." },
      { status: 403 },
    );
  }

  const { error: deleteLinksError } = await supabase
    .from("resource_links")
    .delete()
    .or(`resource_a.eq.${params.id},resource_b.eq.${params.id}`);

  if (deleteLinksError) {
    return NextResponse.json(
      { error: deleteLinksError.message || "Unable to delete resource links." },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabase
    .from("resources")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || "Unable to delete resource." },
      { status: 500 },
    );
  }

  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";
  const urls: string[] = [];
  if (typeof row.image === "string") {
    urls.push(row.image);
  }
  if (Array.isArray(row.images)) {
    urls.push(...row.images.filter((value) => typeof value === "string"));
  }
  const mediaPreviews = normalizeResourceMediaPreviews(row.media_previews);
  if (mediaPreviews) {
    urls.push(...Object.values(mediaPreviews));
  }
  const mediaPosters = normalizeResourceMediaPosters(row.media_posters);
  if (mediaPosters) {
    urls.push(...Object.values(mediaPosters));
  }
  const paths = urls
    .map((url) => extractStoragePath(url, storageBucket))
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await adminSupabase.storage.from(storageBucket).remove(paths);
  }

  revalidateTag("resources", { expire: 0 });
  if (typeof row.type === "string" && row.type.toLowerCase() === PROJECT_RESOURCE_TYPE) {
    revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 });
  }
  return NextResponse.json({ success: true });
};
