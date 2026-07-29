import type { Metadata } from "next";
import type { ResourcePayload } from "@/lib/campai-resources";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import heroHelloImage from "../../../hero-hello.jpg";
import {
  buildResourcePath,
  resolveResourceIdByPrettyTitle,
} from "@/lib/resource-pretty-title";
import { localizePathname } from "@/i18n/config";
import ResourceDetailClient from "./ResourceDetailClient";
import { normalizeResourceMapFeatures } from "../map-features";
import {
  getSupabaseRenderedImageUrl,
  isImageMediaUrl,
  normalizeResourceMediaPosters,
  normalizeResourceMediaPreviews,
} from "@/lib/resource-media";

type StoredCategory = {
  name?: string;
  bookingCategoryId?: string | null;
};

type ResourceRow = {
  id: string;
  pretty_title?: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images?: string[] | null;
  media_previews?: unknown;
  media_posters?: unknown;
  gps_altitude?: number | null;
  type: string | null;
  attachable: boolean | null;
  tags: string[] | null;
  categories: StoredCategory[] | null;
  map_features?: unknown;
};

const MAP_BASE_RESOURCE_TYPES = ["place", "furniture"] as const;
const MAP_BASE_RESOURCE_LIMIT = 1000;
const INVENTORY_HIDDEN_RESOURCE_TYPE = "project";
const SITE_TITLE = "Konglomerat Digitale Werkstätten";

export const dynamic = "force-static";
export const revalidate = 604800;

const toResourcePayload = (row: ResourceRow): ResourcePayload => ({
  id: row.id,
  prettyTitle: row.pretty_title ?? null,
  name: row.name,
  description: row.description ?? undefined,
  image: row.image ?? null,
  images: row.images ?? (row.image ? [row.image] : undefined),
  mediaPreviews: normalizeResourceMediaPreviews(row.media_previews) ?? null,
  mediaPosters: normalizeResourceMediaPosters(row.media_posters) ?? null,
  gpsAltitude: row.gps_altitude ?? null,
  type: row.type ?? undefined,
  attachable: row.attachable ?? undefined,
  tags: row.tags ?? undefined,
  categories: Array.isArray(row.categories)
    ? row.categories.map((category) => ({
        name: category.name,
        bookingCategoryId: category.bookingCategoryId ?? undefined,
      }))
    : undefined,
  mapFeatures: normalizeResourceMapFeatures(row.map_features ?? null),
  relatedResources: undefined,
});

const getRelatedResourcesMap = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
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
          .select("id, name, pretty_title, type")
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
          type: string | null;
        } =>
          typeof row.id === "string" &&
          row.type?.trim().toLowerCase() !== INVENTORY_HIDDEN_RESOURCE_TYPE,
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveResourceId = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  idOrPrettyTitle: string,
) => {
  if (UUID_PATTERN.test(idOrPrettyTitle)) {
    return idOrPrettyTitle;
  }

  const resolved = await resolveResourceIdByPrettyTitle(
    supabase,
    idOrPrettyTitle,
  );
  return resolved?.resourceId ?? null;
};

const loadResourceFromDb = async (idOrPrettyTitle: string) => {
  const supabase = createSupabaseAdminClient();
  const resolvedResourceId = await resolveResourceId(supabase, idOrPrettyTitle);
  if (!resolvedResourceId) {
    return {
      resource: null as ResourcePayload | null,
      errorMessage: "Not found",
    };
  }

  const { data: row, error } = await supabase
    .from("resources")
    .select("*")
    .eq("id", resolvedResourceId)
    .single();

  if (error || !row) {
    return {
      resource: null as ResourcePayload | null,
      errorMessage: "Not found",
    };
  }

  if (
    typeof (row as ResourceRow).type === "string" &&
    (row as ResourceRow).type?.trim().toLowerCase() ===
      INVENTORY_HIDDEN_RESOURCE_TYPE
  ) {
    return {
      resource: null as ResourcePayload | null,
      errorMessage: "Not found",
    };
  }

  const resource = toResourcePayload(row as ResourceRow);
  resource.relatedResources =
    (await getRelatedResourcesMap(supabase, [resource.id])).get(resource.id) ??
    [];

  return {
    resource,
    errorMessage: null,
  };
};

const getCachedResource = unstable_cache(
  loadResourceFromDb,
  ["resources-by-id"],
  {
    revalidate: 60 * 60 * 24 * 7,
    tags: ["resources"],
  },
);

const loadResource = async (id: string | undefined) => {
  if (!id) {
    return {
      resource: null as ResourcePayload | null,
      errorMessage: "Missing resource id.",
    };
  }

  return getCachedResource(id);
};

const stripMarkdown = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)([#>*_~-]+)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const getResourceDescription = (
  resource: ResourcePayload,
  locale: "de" | "en",
) => {
  const plainDescription = truncateText(
    stripMarkdown(resource.description),
    180,
  );
  if (plainDescription) {
    return plainDescription;
  }

  return locale === "en"
    ? `${resource.name}. View this inventory item.`
    : `${resource.name}. Sieh dir diesen Inventargegenstand an.`;
};

const getResourceOgImage = (resource: ResourcePayload) => {
  const resourceImage =
    resource.images?.find(
      (media): media is string =>
        typeof media === "string" && isImageMediaUrl(media),
    ) ??
    (resource.image && isImageMediaUrl(resource.image)
      ? resource.image
      : null);

  if (resourceImage) {
    return getSupabaseRenderedImageUrl(resourceImage, { width: 1600 });
  }

  return heroHelloImage.src;
};

export async function generateMetadata({
  params,
}: {
  params:
    | { id: string; lang?: string }
    | Promise<{ id: string; lang?: string }>;
}): Promise<Metadata> {
  const { id, lang } = await Promise.resolve(params);
  const locale = lang === "en" ? "en" : "de";
  const { resource } = await loadResource(id);

  if (!resource) {
    return {};
  }

  const canonicalPath = localizePathname(
    buildResourcePath(resource),
    locale,
  );
  const description = getResourceDescription(resource, locale);
  const ogImage = getResourceOgImage(resource);
  const title = `${resource.name} | ${SITE_TITLE}`;

  return {
    title,
    description,
    keywords: resource.tags ?? undefined,
    alternates: {
      canonical: canonicalPath,
      languages: {
        de: localizePathname(buildResourcePath(resource), "de"),
        en: localizePathname(buildResourcePath(resource), "en"),
      },
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title,
      description,
      siteName: SITE_TITLE,
      locale: locale === "en" ? "en_US" : "de_DE",
      images: [
        {
          url: ogImage,
          alt: resource.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

const loadMapBasemapResourcesFromDb = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: rows, error } = await supabase
      .from("resources")
      .select("*")
      .or(
        MAP_BASE_RESOURCE_TYPES.map(
          (resourceType) => `type.ilike.${resourceType}`,
        ).join(","),
      )
      .order("priority", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(0, MAP_BASE_RESOURCE_LIMIT - 1);

    if (error) {
      return {
        resources: [] as ResourcePayload[],
      };
    }

    return {
      resources: (rows ?? []).map((row) =>
        toResourcePayload(row as ResourceRow),
      ),
    };
  } catch {
    return {
      resources: [] as ResourcePayload[],
    };
  }
};

const getCachedMapBasemapResources = unstable_cache(
  loadMapBasemapResourcesFromDb,
  ["resources-map-basemap-v1"],
  {
    revalidate: 60 * 60 * 24 * 7,
    tags: ["resources"],
  },
);

const loadMapBasemapResources = async () => getCachedMapBasemapResources();

export const generateStaticParams = async () => {
  const supabase = createSupabaseAdminClient();
  const { data: rows } = await supabase
    .from("resources")
    .select("id, pretty_title")
    .not("type", "ilike", INVENTORY_HIDDEN_RESOURCE_TYPE)
    .order("created_at", { ascending: false })
    .range(0, 499);

  return (rows ?? [])
    .map((row) =>
      typeof row?.pretty_title === "string" && row.pretty_title.length > 0
        ? row.pretty_title
        : row?.id,
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({ id }));
};

export default async function ResourceDetailPage({
  params,
}: {
  params:
    | { id: string; lang?: string }
    | Promise<{ id: string; lang?: string }>;
}) {
  const { id, lang } = await Promise.resolve(params);
  const locale = lang === "en" ? "en" : "de";
  const [{ resource, errorMessage }, { resources: mapBasemapResources }] =
    await Promise.all([loadResource(id), loadMapBasemapResources()]);

  if (resource) {
    const canonicalPath = localizePathname(buildResourcePath(resource), locale);
    const currentPath = localizePathname(`/resources/${id}`, locale);
    if (canonicalPath !== currentPath) {
      redirect(canonicalPath);
    }
  }

  return (
    <ResourceDetailClient
      resourceId={resource?.id ?? id}
      initialResource={resource}
      initialMapBasemapResources={mapBasemapResources}
      initialErrorMessage={errorMessage}
    />
  );
}
