import { loadAllShowcases, loadShowcaseByIdentifier } from "@/app/[lang]/showcase/showcase-data";
import { showcaseAsResourceRow } from "@/lib/payload-showcases";
import {
  DEFAULT_LOCALE,
  localizePathname,
  normalizeLocale,
} from "@/i18n/config";
import { buildShowcasePath } from "@/lib/showcase-path";
import { getShowcaseAuthorName } from "@/lib/showcase-authors";
import {
  buildResourcePath,
  slugifyResourceTitle,
} from "@/lib/resource-pretty-title";
import { getSupabaseRenderedImageUrl, isImageUrl } from "@/lib/resource-media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isShowcaseResourceType,
} from "@/lib/showcase-resource-type";

type StoryResourceRow = {
  id: string;
  pretty_title: string | null;
  owner_id: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  type: string | null;
  tags: string[] | null;
  social_media_consent: boolean | null;
  workshop_resource_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type WorkshopRow = {
  id: string;
  name: string | null;
};

type StorySelectableRow = Pick<
  StoryResourceRow,
  | "id"
  | "pretty_title"
  | "owner_id"
  | "name"
  | "description"
  | "image"
  | "images"
  | "type"
  | "social_media_consent"
  | "updated_at"
  | "created_at"
>;

export type StorySelectableItem = {
  id: string;
  prettyTitle: string | null;
  name: string;
  description: string | null;
  image: string | null;
  contentKind: "showcase" | "resource";
  resourceType: string | null;
  socialMediaConsent: boolean;
  updatedAt: string | null;
};

export type StorySource = StorySelectableItem & {
  authorFirstName: string | null;
  workshopName: string | null;
  tags: string[];
  imageUrls: string[];
  path: string;
  sourceLabel: string;
  downloadBaseName: string;
};

export type StoryDraftSlide = {
  kicker: string;
  headline: string;
  body: string;
};

export type StoryDraftResult = {
  source: StorySource;
  slides: StoryDraftSlide[];
};

const normalizeStringArray = (value: string[] | null | undefined) =>
  (value ?? []).filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry),
  );

export const stripMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[>#*_~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const truncateStoryText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
};

const getContentKind = (row: Pick<StoryResourceRow, "type">) =>
  isShowcaseResourceType(row.type) ? "showcase" : "resource";

const getPathForRow = (
  row: Pick<StoryResourceRow, "id" | "pretty_title" | "type">,
  locale = DEFAULT_LOCALE,
) => {
  const normalizedLocale = normalizeLocale(locale);
  const path = isShowcaseResourceType(row.type)
    ? buildShowcasePath({
        id: row.id,
        prettyTitle: row.pretty_title,
      })
    : buildResourcePath({
        id: row.id,
        prettyTitle: row.pretty_title,
      });

  return localizePathname(path, normalizedLocale);
};

const getImageUrlsForRow = (row: Pick<StoryResourceRow, "image" | "images">) => {
  const imageUrls = normalizeStringArray(row.images);
  if (imageUrls.length > 0) {
    return imageUrls.filter(isImageUrl);
  }

  return row.image && isImageUrl(row.image) ? [row.image] : [];
};

const getSourceLabel = (contentKind: StorySelectableItem["contentKind"]) =>
  contentKind === "showcase" ? "Beitrag" : "Ressource";

const getFirstName = (value: string | null) => {
  if (!value) {
    return null;
  }

  const firstName = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0];

  if (!firstName || firstName.includes("@")) {
    return null;
  }

  return firstName;
};

const STORY_SELECTABLE_COLUMNS =
  "id, pretty_title, owner_id, name, description, image, images, type, social_media_consent, updated_at, created_at";
export const loadStorySelectableItems = async (limit = 400) => {
  const supabase = createSupabaseAdminClient();
  const recentItemLimit = Math.max(Math.trunc(limit), 1);
  const [recentResult, showcaseRows] = await Promise.all([
    supabase
      .from("resources")
      .select(STORY_SELECTABLE_COLUMNS)
      .or("type.is.null,type.not.ilike.project")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, recentItemLimit - 1),
    loadAllShowcases().then(rows => rows.map(showcaseAsResourceRow)),
  ]);

  if (recentResult.error) {
    throw recentResult.error;
  }

  // Keep the bounded recent-resource list, but always include every showcase.
  // The client applies its showcase/resource filter only after this data loads.
  const rowsById = new Map<string, StorySelectableRow>();
  for (const row of [
    ...((recentResult.data ?? []) as StorySelectableRow[]),
    ...showcaseRows,
  ]) {
    if (!rowsById.has(row.id)) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).map((row) => ({
    id: row.id,
    prettyTitle: row.pretty_title ?? null,
    name: row.name,
    description: row.description ?? null,
    image: getImageUrlsForRow(row)[0] ?? null,
    contentKind: getContentKind(row),
    resourceType: row.type ?? null,
    socialMediaConsent: row.social_media_consent ?? false,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  })) satisfies StorySelectableItem[];
};

export const loadStorySource = async (
  itemId: string,
  locale = DEFAULT_LOCALE,
) => {
  const showcase = await loadShowcaseByIdentifier(itemId);
  if (showcase) {
    const imageUrls = [...new Set([showcase.image, ...(showcase.images ?? [])].filter((url): url is string => Boolean(url) && isImageUrl(url!)))];
    return {
      id: showcase.id, prettyTitle: showcase.prettyTitle ?? null, name: showcase.name,
      description: showcase.description ?? null, image: imageUrls[0] ?? null,
      contentKind: "showcase", resourceType: "project", socialMediaConsent: showcase.socialMediaConsent === true,
      updatedAt: showcase.updatedAt, authorFirstName: showcase.author?.name.split(/\s+/)[0] ?? null,
      workshopName: showcase.workshopResource?.name ?? null, tags: showcase.tags ?? [], imageUrls,
      path: localizePathname(buildShowcasePath(showcase), normalizeLocale(locale)), sourceLabel: "Beitrag",
      downloadBaseName: slugifyResourceTitle(showcase.prettyTitle || showcase.name, `story-${showcase.id}`),
    } satisfies StorySource;
  }
  // Numeric IDs belong to Payload. Never fall back to a stale migrated project.
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("resources")
    .select(
      "id, pretty_title, owner_id, name, description, image, images, type, tags, social_media_consent, workshop_resource_id, updated_at, created_at",
    )
    .or("type.is.null,type.not.ilike.project")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as StoryResourceRow;
  const contentKind = getContentKind(row);
  const workshopId = row.workshop_resource_id?.trim() || null;

  let workshopName: string | null = null;
  let authorFirstName: string | null = null;
  if (contentKind === "showcase" && workshopId) {
    const { data: workshopRow } = await supabase
      .from("resources")
      .select("id, name")
      .eq("id", workshopId)
      .maybeSingle();
    workshopName = (workshopRow as WorkshopRow | null)?.name ?? null;
  }

  if (row.owner_id?.trim()) {
    try {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(row.owner_id);
      if (!userError && userData.user) {
        authorFirstName = getFirstName(
          getShowcaseAuthorName(
            userData.user.user_metadata ?? {},
            userData.user.email ?? null,
          ),
        );
      }
    } catch {
      authorFirstName = null;
    }
  }

  const imageUrls = getImageUrlsForRow(row);
  const downloadBaseName = slugifyResourceTitle(
    row.pretty_title?.trim() || row.name,
    `story-${row.id.slice(0, 8)}`,
  );

  return {
    id: row.id,
    prettyTitle: row.pretty_title ?? null,
    name: row.name,
    description: row.description ?? null,
    image: imageUrls[0] ?? null,
    contentKind,
    resourceType: row.type ?? null,
    socialMediaConsent: row.social_media_consent ?? false,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    authorFirstName,
    workshopName,
    tags: normalizeStringArray(row.tags),
    imageUrls,
    path: getPathForRow(row, locale),
    sourceLabel: getSourceLabel(contentKind),
    downloadBaseName,
  } satisfies StorySource;
};

export const getStorySlideImageUrl = (
  source: Pick<StorySource, "imageUrls">,
  slideIndex: number,
) => {
  const candidate = source.imageUrls[slideIndex] ?? source.imageUrls[0] ?? null;
  if (!candidate) {
    return null;
  }

  return getSupabaseRenderedImageUrl(candidate, {
    width: 1080,
    height: 1920,
    resize: "cover",
  });
};

export const createFallbackStoryDraft = (
  source: StorySource,
  slideCount: number,
) => {
  const safeSlideCount = Math.min(Math.max(slideCount, 1), 2);
  const summary = truncateStoryText(
    stripMarkdown(source.description ?? ""),
    110,
  );

  const firstSlide: StoryDraftSlide = {
    kicker: truncateStoryText(
      source.workshopName || source.sourceLabel,
      26,
    ),
    headline: truncateStoryText(source.name, 64),
    body:
      summary ||
      (source.contentKind === "showcase"
        ? "Ein Einblick in einen aktuellen Beitrag aus den Werkstaetten."
        : "Ein Einblick in eine Ressource aus den Werkstaetten."),
  };

  const secondSlide: StoryDraftSlide = {
    kicker: truncateStoryText(source.sourceLabel, 26),
    headline:
      source.contentKind === "showcase"
        ? "Mehr zum Beitrag"
        : "Mehr zur Ressource",
    body: truncateStoryText(
      source.workshopName
        ? `Zu finden in ${source.workshopName}. Mehr Details gibt es auf digital.konglomerat.org.`
        : "Mehr Details gibt es auf digital.konglomerat.org.",
      120,
    ),
  };

  return {
    source,
    slides:
      safeSlideCount === 1 ? [firstSlide] : [firstSlide, secondSlide],
  } satisfies StoryDraftResult;
};
