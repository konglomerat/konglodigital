import { unstable_cache } from "next/cache";

import type { ResourcePayload } from "@/lib/campai-resources";
import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeProjectLinks } from "@/lib/project-links";
import {
  getProjectAuthorAvatarUrl,
  getProjectAuthorBio,
  getProjectAuthorInitials,
  getProjectAuthorName,
} from "@/lib/project-authors";
import { resolveResourceIdByPrettyTitle } from "@/lib/resource-pretty-title";
import {
  normalizeResourceMediaPosters,
  normalizeResourceMediaPreviews,
} from "@/lib/resource-media";
import {
  getPointFeatures,
  normalizeResourceMapFeatures,
} from "@/app/[lang]/resources/map-features";

type StoredProjectLink = {
  label?: string;
  url?: string;
};

type ProjectRow = {
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
  tags: string[] | null;
  publish_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  map_features?: unknown;
};

export type ProjectAuthor = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  initials: string;
};

export type ProjectRecord = ResourcePayload & {
  createdAt: string | null;
  updatedAt: string | null;
  author: ProjectAuthor | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PROJECTS_CACHE_TAG = "projects";

const PROJECT_SELECT_FIELDS =
  "id, pretty_title, owner_id, author_name, name, description, image, images, media_previews, media_posters, project_links, social_media_consent, workshop_resource_id, tags, publish_date, created_at, updated_at, map_features";

const getRelatedResourcesMap = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sourceIds: string[],
) => {
  const normalizedSourceIds = Array.from(
    new Set(sourceIds.map((id) => id.trim()).filter(Boolean)),
  );
  const relatedMap = new Map<
    string,
    Array<{
      id: string;
      name?: string;
      prettyTitle?: string | null;
      image?: string | null;
    }>
  >();
  normalizedSourceIds.forEach((id) => relatedMap.set(id, []));

  if (normalizedSourceIds.length === 0) {
    return relatedMap;
  }

  const [{ data: linksA }, { data: linksB }] = await Promise.all([
    supabase
      .from("resource_links")
      .select("resource_a, resource_b")
      .in("resource_a", normalizedSourceIds),
    supabase
      .from("resource_links")
      .select("resource_a, resource_b")
      .in("resource_b", normalizedSourceIds),
  ]);

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

  const { data: counterpartRows } = counterpartIds.length
    ? await supabase
        .from("resources")
        .select("id, name, pretty_title, image, images")
        .in("id", counterpartIds)
    : { data: [] };

  const counterpartById = new Map(
    (counterpartRows ?? [])
      .filter(
        (
          row,
        ): row is {
          id: string;
          name: string | null;
          pretty_title: string | null;
          image: string | null;
          images: string[] | null;
        } => typeof row.id === "string",
      )
      .map((row) => [
        row.id,
        {
          name: row.name ?? undefined,
          prettyTitle: row.pretty_title ?? null,
          image:
            row.images?.find(
              (image): image is string =>
                typeof image === "string" && Boolean(image),
            ) ??
            row.image ??
            null,
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
        image: counterpart?.image ?? null,
      });
    }
    if (normalizedSourceIds.includes(row.resource_b)) {
      const counterpart = counterpartById.get(row.resource_a);
      relatedMap.get(row.resource_b)?.push({
        id: row.resource_a,
        name: counterpart?.name,
        prettyTitle: counterpart?.prettyTitle,
        image: counterpart?.image ?? null,
      });
    }
  });

  return relatedMap;
};

const getWorkshopResourcesMap = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
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

  const { data } = await supabase
    .from("resources")
    .select("id, name, pretty_title")
    .in("id", normalizedIds);

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

const loadProjectAuthor = async (ownerId: string | null | undefined) => {
  if (!ownerId) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  try {
    const [{ data, error }, memberProfile] = await Promise.all([
      supabase.auth.admin.getUserById(ownerId),
      getMemberProfileByUserId(supabase, ownerId),
    ]);
    if (error || !data.user) {
      return null;
    }

    const metadata = mergeUserMetadataWithMemberProfile(
      data.user.user_metadata ?? {},
      memberProfile,
    );
    const name = getProjectAuthorName(metadata, data.user.email ?? null);
    return {
      id: data.user.id,
      name,
      avatarUrl: getProjectAuthorAvatarUrl(metadata),
      bio: getProjectAuthorBio(metadata),
      email: data.user.email ?? null,
      initials: getProjectAuthorInitials(name),
    } satisfies ProjectAuthor;
  } catch {
    return null;
  }
};

const toProjectRecord = (
  row: ProjectRow,
  relatedResources: Array<{
    id: string;
    name?: string;
    prettyTitle?: string | null;
    image?: string | null;
  }>,
  workshopById: Map<
    string,
    { id: string; name?: string; prettyTitle?: string | null }
  >,
  author: ProjectAuthor | null,
): ProjectRecord => {
  const mapFeatures = normalizeResourceMapFeatures(row.map_features ?? null);
  const pointFeature = getPointFeatures(mapFeatures).find(
    (feature) => feature.id === "gps-point",
  );
  const authorName = row.author_name?.trim() || null;
  const effectiveAuthor = authorName
    ? {
        id: author?.id ?? `manual-author:${row.id}`,
        name: authorName,
        avatarUrl: null,
        bio: null,
        email: null,
        initials: getProjectAuthorInitials(authorName),
      }
    : author;

  return {
    id: row.id,
    prettyTitle: row.pretty_title ?? null,
    ownerId: row.owner_id ?? null,
    authorName,
    name: row.name,
    description: row.description ?? undefined,
    image: row.image ?? null,
    images: row.images ?? (row.image ? [row.image] : undefined),
    mediaPreviews: normalizeResourceMediaPreviews(row.media_previews) ?? null,
    mediaPosters: normalizeResourceMediaPosters(row.media_posters) ?? null,
    publishDate: row.publish_date ?? null,
    gpsLatitude: pointFeature?.point[1] ?? null,
    gpsLongitude: pointFeature?.point[0] ?? null,
    type: "project",
    tags: row.tags ?? undefined,
    relatedResources,
    workshopResource:
      row.workshop_resource_id != null
        ? (workshopById.get(row.workshop_resource_id) ?? {
            id: row.workshop_resource_id,
          })
        : null,
    projectLinks: normalizeProjectLinks(row.project_links ?? []),
    socialMediaConsent: row.social_media_consent ?? false,
    mapFeatures,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    author: effectiveAuthor,
  };
};

const resolveProjectId = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  value: string,
) => {
  if (UUID_PATTERN.test(value)) {
    return value;
  }

  const resolved = await resolveResourceIdByPrettyTitle(supabase, value);
  return resolved?.resourceId ?? null;
};

const mapProjectRows = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  rows: ProjectRow[],
) => {
  const workshopById = await getWorkshopResourcesMap(
    supabase,
    rows.map((row) => row.workshop_resource_id ?? null),
  );

  return rows.map((row) => toProjectRecord(row, [], workshopById, null));
};

const loadProjectsFromDb = async (limit = 60) => {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("resources")
    .select(PROJECT_SELECT_FIELDS)
    .ilike("type", "project")
    .order("publish_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, Math.max(limit, 1) - 1);

  const rows = (data ?? []) as ProjectRow[];
  return mapProjectRows(supabase, rows);
};

const getCachedProjects = unstable_cache(loadProjectsFromDb, ["projects-list-v1"], {
  revalidate: 60 * 60 * 24 * 7,
  tags: [PROJECTS_CACHE_TAG],
});

export const loadProjects = async (limit = 60) => getCachedProjects(limit);

const loadProjectsByWorkshopResourceIdFromDb = async (
  workshopResourceId: string,
  limit = 60,
) => {
  const normalizedWorkshopResourceId = workshopResourceId.trim();
  if (!normalizedWorkshopResourceId) {
    return [] as ProjectRecord[];
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("resources")
    .select(PROJECT_SELECT_FIELDS)
    .ilike("type", "project")
    .eq("workshop_resource_id", normalizedWorkshopResourceId)
    .order("publish_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, Math.max(limit, 1) - 1);

  const rows = (data ?? []) as ProjectRow[];
  return mapProjectRows(supabase, rows);
};

const getCachedProjectsByWorkshopResourceId = unstable_cache(
  loadProjectsByWorkshopResourceIdFromDb,
  ["projects-by-workshop-resource-id-v1"],
  {
    revalidate: 60 * 60 * 24 * 7,
    tags: [PROJECTS_CACHE_TAG],
  },
);

export const loadProjectsByWorkshopResourceId = async (
  workshopResourceId: string,
  limit = 60,
) => getCachedProjectsByWorkshopResourceId(workshopResourceId, limit);

const loadProjectByIdentifierFromDb = async (identifier: string) => {
  const supabase = createSupabaseAdminClient();
  const projectId = await resolveProjectId(supabase, identifier);
  if (!projectId) {
    return null;
  }

  const { data } = await supabase
    .from("resources")
    .select(
      "id, pretty_title, owner_id, author_name, name, description, image, images, media_previews, media_posters, project_links, social_media_consent, workshop_resource_id, tags, publish_date, created_at, updated_at, map_features, type",
    )
    .eq("id", projectId)
    .ilike("type", "project")
    .maybeSingle();

  if (!data) {
    return null;
  }

  const row = data as ProjectRow;
  const [relatedMap, workshopById, author] = await Promise.all([
    getRelatedResourcesMap(supabase, [row.id]),
    getWorkshopResourcesMap(supabase, [row.workshop_resource_id ?? null]),
    loadProjectAuthor(row.owner_id ?? null),
  ]);

  return toProjectRecord(
    row,
    relatedMap.get(row.id) ?? [],
    workshopById,
    author,
  );
};

const getCachedProjectByIdentifier = unstable_cache(
  loadProjectByIdentifierFromDb,
  ["projects-by-identifier-v1"],
  {
    revalidate: 60 * 60 * 24 * 7,
    tags: [PROJECTS_CACHE_TAG],
  },
);

export const loadProjectByIdentifier = async (identifier: string) =>
  getCachedProjectByIdentifier(identifier);
