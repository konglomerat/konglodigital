import type { ResourcePayload } from "@/lib/campai-resources";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import ResourcesPageClient from "./ResourcesPageClient";
import { normalizeResourceMapFeatures } from "./map-features";

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
  gps_altitude?: number | null;
  type: string | null;
  priority?: number | null;
  attachable: boolean | null;
  tags: string[] | null;
  categories: StoredCategory[] | null;
  map_features?: unknown;
};

const MAP_BASE_RESOURCE_TYPES = ["place", "furniture"] as const;
const MAP_BASE_RESOURCE_LIMIT = 1000;
const RESOURCES_PAGE_LIMIT = 100;
const INVENTORY_HIDDEN_RESOURCE_TYPE = "project";

export const dynamic = "force-dynamic";

const toResourcePayload = (row: ResourceRow): ResourcePayload => ({
  id: row.id,
  prettyTitle: row.pretty_title ?? null,
  name: row.name,
  description: row.description ?? undefined,
  image: row.image ?? null,
  images: row.images ?? (row.image ? [row.image] : undefined),
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
      (message) => {
        if (typeof message !== "string") {
          return false;
        }

        const lowered = message.toLowerCase();
        return (
          lowered.includes("resource_links") &&
          (lowered.includes("schema cache") ||
            lowered.includes("relation") ||
            lowered.includes("does not exist"))
        );
      },
    );
    if (missingTable) {
      return relatedMap;
    }
    return relatedMap;
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
    return relatedMap;
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

const loadResourcesFromDb = async ({
  queryText,
  resourceType,
}: {
  queryText: string;
  resourceType: string;
}) => {
  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("resources")
      .select("*", { count: "exact" })
      .not("type", "ilike", INVENTORY_HIDDEN_RESOURCE_TYPE)
      .order("priority", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(0, RESOURCES_PAGE_LIMIT - 1);

    if (queryText.trim()) {
      const term = `%${queryText.trim()}%`;
      query = query.or(`name.ilike.${term},description.ilike.${term}`);
    }

    if (resourceType.trim()) {
      query = query.ilike("type", resourceType.trim());
    }

    const { data: rows, error, count } = await query;

    if (error) {
      return {
        resources: [] as ResourcePayload[],
        count: 0,
        errorMessage: error.message || "Unable to load resources.",
      };
    }

    const resources = (rows ?? []).map((row) =>
      toResourcePayload(row as ResourceRow),
    );
    const relatedMap = await getRelatedResourcesMap(
      supabase,
      resources.map((resource) => resource.id),
    );
    const resourcesWithRelated = resources.map((resource) => ({
      ...resource,
      relatedResources: relatedMap.get(resource.id) ?? [],
    }));

    return {
      resources: resourcesWithRelated,
      count: typeof count === "number" ? count : resourcesWithRelated.length,
      errorMessage: null,
    };
  } catch (error) {
    return {
      resources: [] as ResourcePayload[],
      count: 0,
      errorMessage:
        error instanceof Error
          ? error.message || "Unable to load resources."
          : "Unable to load resources.",
    };
  }
};

const loadResources = async ({
  queryText,
  resourceType,
}: {
  queryText: string;
  resourceType: string;
}) =>
  loadResourcesFromDb({
    queryText,
    resourceType,
  });

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

const getSearchParam = (
  params: Record<string, string | string[] | undefined>,
  key: string,
) => {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return typeof value === "string" ? value : "";
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams
    ? await Promise.resolve(searchParams)
    : {};
  const queryText = getSearchParam(resolvedSearchParams, "q").trim();
  const resourceType = getSearchParam(resolvedSearchParams, "type").trim();

  const [
    { resources, count, errorMessage },
    { resources: mapBasemapResources },
  ] = await Promise.all([
    loadResources({ queryText, resourceType }),
    loadMapBasemapResources(),
  ]);

  return (
    <ResourcesPageClient
      initialResources={resources}
      initialMapBasemapResources={mapBasemapResources}
      initialCount={count}
      initialErrorMessage={errorMessage}
    />
  );
}
