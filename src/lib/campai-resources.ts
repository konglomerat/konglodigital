export type RawResource = Record<string, unknown>;

export type ResourceCategory = {
  name?: string;
  nameNormalized?: string;
  bookingCategoryId?: string;
};

export type RelatedResource = {
  id: string;
  name?: string;
  prettyTitle?: string | null;
};

export type ResourceMapFeature = {
  id: string;
  layer: string;
} & (
  | {
      geometryType: "Polygon";
      coordinates: [number, number][];
    }
  | {
      geometryType: "Point";
      point: [number, number];
    }
);

export type ResourcePayload = {
  id: string;
  prettyTitle?: string | null;
  name: string;
  description?: string;
  image?: string | null;
  images?: string[] | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAltitude?: number | null;
  type?: string;
  priority?: number | null;
  attachable?: boolean;
  tags?: string[];
  categories?: ResourceCategory[];
  relatedResources?: RelatedResource[];
  mapFeatures?: ResourceMapFeature[];
};

const toPriority = (value: unknown): number | null | undefined => {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 5) {
    return undefined;
  }
  return rounded;
};

const extractImageUrl = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const resource = record.resource;
    if (typeof resource === "string") {
      return resource;
    }
    const url = record.url ?? record.href;
    if (typeof url === "string") {
      return url;
    }
  }
  return null;
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : null))
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  return undefined;
};

const toCategoryArray = (value: unknown): ResourceCategory[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const categories = value
    .map((entry): ResourceCategory | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      return {
        name: typeof record.name === "string" ? record.name : undefined,
        nameNormalized:
          typeof record.nameNormalized === "string"
            ? record.nameNormalized
            : undefined,
        bookingCategoryId:
          typeof record.bookingCategoryId === "string"
            ? record.bookingCategoryId
            : undefined,
      };
    })
    .filter((entry): entry is ResourceCategory => entry !== null);
  return categories.length > 0 ? categories : undefined;
};

const toRelatedResources = (value: unknown): RelatedResource[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const relatedResources = value
    .map((entry): RelatedResource | null => {
      if (typeof entry === "string") {
        const id = entry.trim();
        return id ? { id } : null;
      }
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id =
        typeof record.id === "string"
          ? record.id
          : typeof record.resourceId === "string"
            ? record.resourceId
            : null;
      if (!id) {
        return null;
      }
      return {
        id,
        name: typeof record.name === "string" ? record.name : undefined,
        prettyTitle:
          typeof record.prettyTitle === "string"
            ? record.prettyTitle
            : typeof record.pretty_title === "string"
              ? record.pretty_title
              : null,
      };
    })
    .filter((entry): entry is RelatedResource => entry !== null);
  return relatedResources.length > 0 ? relatedResources : undefined;
};

const toMapFeatures = (value: unknown): ResourceMapFeature[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const mapFeatures = value
    .map((entry): ResourceMapFeature | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.layer !== "string") {
        return null;
      }
      const geometryType =
        typeof row.geometryType === "string" &&
        row.geometryType.toLowerCase() === "point"
          ? "Point"
          : "Polygon";

      if (geometryType === "Point") {
        const pointRaw =
          row.point ??
          row.coordinate ??
          row.coordinates ??
          (row.geometry as { coordinates?: unknown } | undefined)?.coordinates;
        if (!Array.isArray(pointRaw) || pointRaw.length < 2) {
          return null;
        }
        const lng = Number(pointRaw[0]);
        const lat = Number(pointRaw[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return null;
        }
        return {
          id: row.id,
          layer: row.layer,
          geometryType: "Point",
          point: [lng, lat],
        };
      }

      if (!Array.isArray(row.coordinates)) {
        return null;
      }
      const coordinates = row.coordinates
        .map((point): [number, number] | null => {
          if (!Array.isArray(point) || point.length < 2) {
            return null;
          }
          const lng = Number(point[0]);
          const lat = Number(point[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return null;
          }
          return [lng, lat];
        })
        .filter((point): point is [number, number] => point !== null);
      if (coordinates.length < 3) {
        return null;
      }
      return {
        id: row.id,
        layer: row.layer,
        geometryType: "Polygon",
        coordinates,
      };
    })
    .filter((entry): entry is ResourceMapFeature => entry !== null);
  return mapFeatures.length > 0 ? mapFeatures : undefined;
};

export const normalizeResource = (
  item: RawResource,
): ResourcePayload | null => {
  const id =
    (item._id as string | undefined) ??
    (item.id as string | undefined) ??
    (item.resourceId as string | undefined);

  const info =
    (item.info as Record<string, unknown> | undefined) ??
    (item.details as Record<string, unknown> | undefined) ??
    {};

  const name =
    (info.name as string | undefined) ??
    (item.name as string | undefined) ??
    (item.title as string | undefined);
  const description =
    (info.description as string | undefined) ??
    (item.description as string | undefined);
  const image =
    extractImageUrl(info.image) ??
    extractImageUrl(info.imageUrl) ??
    extractImageUrl(item.image) ??
    extractImageUrl(item.imageUrl) ??
    null;
  const type = (item.type as string | undefined) ?? undefined;
  const priority =
    toPriority(item.priority) ?? toPriority(info.priority) ?? undefined;
  const attachable =
    typeof item.attachable === "boolean" ? item.attachable : undefined;
  const tags = toStringArray(info.tags ?? item.tags);
  const categories = toCategoryArray(info.categories ?? item.categories);
  const relatedResources = toRelatedResources(
    info.relatedResources ?? item.relatedResources,
  );
  const mapFeatures = toMapFeatures(info.mapFeatures ?? item.mapFeatures);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    prettyTitle:
      (item.prettyTitle as string | undefined) ??
      (item.pretty_title as string | undefined) ??
      null,
    name,
    description,
    image,
    type,
    priority,
    attachable,
    tags,
    categories,
    relatedResources,
    mapFeatures,
  } satisfies ResourcePayload;
};

export const extractResources = (payload: unknown): RawResource[] => {
  if (Array.isArray(payload)) {
    return payload as RawResource[];
  }
  if (payload && typeof payload === "object") {
    const typed = payload as Record<string, unknown>;
    const direct =
      (typed.resources as RawResource[] | undefined) ??
      (typed.items as RawResource[] | undefined) ??
      (typed.data as RawResource[] | undefined) ??
      (typed.result as RawResource[] | undefined) ??
      (typed.rows as RawResource[] | undefined) ??
      (typed.docs as RawResource[] | undefined);
    if (Array.isArray(direct)) {
      return direct;
    }
    const nested =
      (typed.resources as { items?: RawResource[] } | undefined)?.items ??
      (typed.items as { items?: RawResource[] } | undefined)?.items ??
      (typed.data as { items?: RawResource[] } | undefined)?.items ??
      (typed.data as { resources?: RawResource[] } | undefined)?.resources ??
      (typed.result as { items?: RawResource[] } | undefined)?.items ??
      (typed.result as { data?: RawResource[] } | undefined)?.data ??
      (typed.result as { resources?: RawResource[] } | undefined)?.resources;
    if (Array.isArray(nested)) {
      return nested;
    }
  }
  return [];
};
