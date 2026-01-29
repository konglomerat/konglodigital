export type RawResource = Record<string, unknown>;

export type ResourceCategory = {
  name?: string;
  nameNormalized?: string;
  bookingCategoryId?: string;
};

export type ResourcePayload = {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
  type?: string;
  attachable?: boolean;
  tags?: string[];
  categories?: ResourceCategory[];
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
  const attachable =
    typeof item.attachable === "boolean" ? item.attachable : undefined;
  const tags = toStringArray(info.tags ?? item.tags);
  const categories = toCategoryArray(info.categories ?? item.categories);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    description,
    image,
    type,
    attachable,
    tags,
    categories,
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
