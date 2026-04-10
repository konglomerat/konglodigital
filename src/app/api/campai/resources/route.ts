import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExifReader from "exifreader";
import sharp from "sharp";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { hasRight } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureResourcePrettyTitle } from "@/lib/resource-pretty-title";
import { describeInventoryImages } from "@/lib/openai-vision";
import type { ResourcePayload } from "@/lib/campai-resources";
import {
  normalizeProjectLinks,
  parseProjectLinksJson,
  type ProjectLink,
} from "@/lib/project-links";
import { isImageMimeType, isImageUrl } from "@/lib/resource-media";
import {
  getPointFeatures,
  normalizeResourceMapFeatures,
} from "@/app/[lang]/resources/map-features";

const splitList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

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

const chunkArray = <T>(items: T[], size: number) => {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const INVENTORY_HIDDEN_RESOURCE_TYPE = "project";

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

  const idChunks = chunkArray(normalizedSourceIds, 100);
  const linksA: Array<{ resource_a: string; resource_b: string }> = [];
  const linksB: Array<{ resource_a: string; resource_b: string }> = [];

  for (const ids of idChunks) {
    const [linksAResult, linksBResult] = await Promise.all([
      supabase
        .from("resource_links")
        .select("resource_a, resource_b")
        .in("resource_a", ids),
      supabase
        .from("resource_links")
        .select("resource_a, resource_b")
        .in("resource_b", ids),
    ]);

    const linksAError = linksAResult.error;
    const linksBError = linksBResult.error;

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

    linksA.push(...((linksAResult.data ?? []) as typeof linksA));
    linksB.push(...((linksBResult.data ?? []) as typeof linksB));
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
    const maxImageWidthRaw = formData.get("maxImageWidth");
    const maxImageWidth =
      typeof maxImageWidthRaw === "string"
        ? Number.parseInt(maxImageWidthRaw, 10)
        : undefined;
    return {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      type: String(formData.get("type") ?? ""),
      priority: toPriority(formData.get("priority")),
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
      mapFeatures: null,
      maxImageWidth:
        typeof maxImageWidth === "number" && Number.isFinite(maxImageWidth)
          ? maxImageWidth
          : undefined,
    };
  }
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    type?: string;
    priority?: number | string;
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
    mapFeatures?: unknown;
  };
  return {
    name: body.name ?? "",
    description: body.description ?? "",
    type: body.type ?? "",
    priority: toPriority(String(body.priority ?? "")),
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
    imageUrl: body.imageUrl ?? null,
    imageUrls: body.imageUrls ?? null,
    mapFeatures: normalizeResourceMapFeatures(body.mapFeatures ?? null),
    maxImageWidth: undefined as number | undefined,
  };
};

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

type GpsData = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
};

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
  if (groupLatitude !== null && groupLongitude !== null) {
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
    const shouldResize =
      typeof metadata.width === "number" && metadata.width > maxWidth;

    const processed = (
      shouldResize
        ? image.resize({ width: maxWidth, withoutEnlargement: true })
        : image
    ).withMetadata();

    const output = await processed
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();

    return {
      data: output,
      contentType: "image/jpeg",
    };
  } catch {
    return {
      data: buffer,
      contentType: file.type || "application/octet-stream",
    };
  }
};

const describeImage = async (files: File[], imageUrls?: string[] | null) => {
  return describeInventoryImages({ files, imageUrls });
};

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
  name: string;
  description: string | null;
  image: string | null;
  images?: string[] | null;
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
  name: row.name,
  description: row.description ?? undefined,
  image: row.image ?? null,
  images: row.images ?? (row.image ? [row.image] : undefined),
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

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const searchTerm =
    searchParams.get("searchTerm") ?? searchParams.get("q") ?? "";
  const resourceType = searchParams.get("type") ?? "";

  let query = supabase
    .from("resources")
    .select("*", { count: "exact" })
    .not("type", "ilike", INVENTORY_HIDDEN_RESOURCE_TYPE)
    .order("priority", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(
      Number.isNaN(offset) ? 0 : offset,
      (Number.isNaN(offset) ? 0 : offset) +
        (Number.isNaN(limit) ? 50 : limit) -
        1,
    );

  if (searchTerm.trim()) {
    const term = `%${searchTerm.trim()}%`;
    query = query.or(`name.ilike.${term},description.ilike.${term}`);
  }

  if (resourceType.trim()) {
    query = query.ilike("type", resourceType.trim());
  }

  const { data: rows, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message || "Unable to load resources." },
      { status: 500 },
    );
  }

  const workshopById = await getWorkshopResourcesMap(
    supabase,
    (rows ?? []).map(
      (row) => (row as ResourceRow).workshop_resource_id ?? null,
    ),
  );

  const resources = (rows ?? []).map((row) =>
    toResourcePayload(row as ResourceRow, workshopById),
  );
  let relatedResourcesMap = new Map<
    string,
    Array<{ id: string; name?: string }>
  >();
  try {
    relatedResourcesMap = await getRelatedResourcesMap(
      supabase,
      resources.map((resource) => resource.id),
    );
  } catch (relatedError) {
    console.error("Unable to load related resources map:", relatedError);
    relatedResourcesMap = new Map(
      resources.map((resource) => [
        resource.id,
        [] as Array<{ id: string; name?: string }>,
      ]),
    );
  }
  const resourcesWithRelated = resources.map((resource) => ({
    ...resource,
    relatedResources: relatedResourcesMap.get(resource.id) ?? [],
  }));

  return NextResponse.json({
    resources: resourcesWithRelated,
    count: typeof count === "number" ? count : resourcesWithRelated.length,
  });
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const adminSupabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await readResourcePayload(request);
  const isProject = payload.type.trim().toLowerCase() === "project";
  const canCreateByRight = hasRight(data.user, "resources:create");
  if (!canCreateByRight && !isProject) {
    return NextResponse.json(
      { error: "Insufficient permissions." },
      { status: 403 },
    );
  }
  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";
  const writeSupabase = (
    canCreateByRight ? supabase : adminSupabase
  ) as typeof supabase;
  const hasIncomingMedia =
    payload.imageFiles.length > 0 ||
    (Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0);
  if (!payload.name.trim() && !hasIncomingMedia) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!payload.type.trim()) {
    return NextResponse.json({ error: "Type is required." }, { status: 400 });
  }
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

  let imageUrl: string | null = payload.imageUrl ?? null;
  let imageUrls: string[] | null = payload.imageUrls ?? null;
  const imageFiles = payload.imageFiles.filter((file) =>
    isImageMimeType(file.type),
  );
  let description = payload.description?.trim() ?? "";
  let name = payload.name.trim();
  let tags = payload.tags ? splitList(payload.tags) : [];
  const workshopResourceId = await resolveWorkshopResourceId(
    supabase,
    payload.workshopResourceId ?? "",
  );
  const projectLinks = normalizeProjectLinks(payload.projectLinks ?? []);
  const gpsData =
    imageFiles.length > 0 ? await extractGpsFromFile(imageFiles[0]) : null;
  const fallbackGpsPointFeature =
    gpsData?.latitude != null && gpsData?.longitude != null
      ? [
          {
            id: "gps-point",
            layer: "location",
            geometryType: "Point" as const,
            point: [gpsData.longitude, gpsData.latitude] as [number, number],
          },
        ]
      : null;
  const mapFeatures =
    payload.mapFeatures && payload.mapFeatures.length > 0
      ? payload.mapFeatures
      : fallbackGpsPointFeature;
  if (payload.imageFiles.length > 0) {
    const maxImageWidth = payload.maxImageWidth ?? 2000;
    const uploadedUrls: string[] = [];
    for (const file of payload.imageFiles) {
      const safeName = sanitizeFileName(file.name || "image");
      const path = `resources/${crypto.randomUUID()}-${safeName}`;
      const storedPath = await uploadResourceMedia(
        adminSupabase,
        file,
        storageBucket,
        path,
        maxImageWidth,
      );
      uploadedUrls.push(
        supabase.storage.from(storageBucket).getPublicUrl(storedPath).data
          .publicUrl,
      );
    }
    imageUrls = uploadedUrls;
    imageUrl = uploadedUrls[0] ?? null;
  } else if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    imageUrl = imageUrl ?? imageUrls[0] ?? null;
  }

  const imageUrlsForAnalysis = (imageUrls ?? []).filter((url) =>
    isImageUrl(url),
  );
  if (imageFiles.length > 0 || imageUrlsForAnalysis.length > 0) {
    const vision = await describeImage(imageFiles, imageUrlsForAnalysis).catch(
      () => null,
    );
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

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  const categories = payload.categories ? splitList(payload.categories) : [];
  const categoryIds = payload.categoryIds ? splitList(payload.categoryIds) : [];
  const relatedResourceIds = await resolveRelatedResourceIds(
    supabase,
    parseRelatedResourceIds(payload.relatedResourceIds ?? ""),
  );
  const storedCategories =
    categories.length > 0
      ? categories.map((name, index) => ({
          name,
          bookingCategoryId: categoryIds[index] ?? null,
        }))
      : null;

  const { data: created, error } = await writeSupabase
    .from("resources")
    .insert({
      name,
      description: description ? description : null,
      type: payload.type.trim(),
      priority: payload.priority,
      tags: tags.length > 0 ? tags : null,
      categories: storedCategories,
      attachable: payload.attachable,
      project_links: projectLinks.length > 0 ? projectLinks : null,
      social_media_consent: payload.socialMediaConsent ?? false,
      workshop_resource_id: workshopResourceId,
      image: imageUrl,
      images: imageUrls,
      map_features: mapFeatures,
      gps_altitude: gpsData?.altitude ?? null,
      owner_id: data.user.id,
    })
    .select("*")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message || "Unable to create resource." },
      { status: 500 },
    );
  }

  try {
    const prettyTitle = await ensureResourcePrettyTitle(adminSupabase, {
      resourceId: created.id,
      name,
    });
    created.pretty_title = prettyTitle;
  } catch (prettyTitleError) {
    console.error("Unable to persist resource pretty title:", prettyTitleError);
  }

  await setResourceLinks(writeSupabase, created.id, relatedResourceIds);

  const workshopById = await getWorkshopResourcesMap(writeSupabase, [
    (created as ResourceRow).workshop_resource_id ?? null,
  ]);
  const resource = toResourcePayload(created as ResourceRow, workshopById);
  resource.relatedResources =
    (await getRelatedResourcesMap(writeSupabase, [resource.id])).get(
      resource.id,
    ) ?? [];
  revalidateTag("resources", { expire: 0 });
  return NextResponse.json({ id: resource.id, resource });
};
