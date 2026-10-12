import "server-only";

import { cache } from "react";

import { getPayloadPagePath, isKnownWerkbereichSlug } from "@/lib/payload-page-path";

export type PayloadRecord = Record<string, unknown>;

export type PayloadMedia = PayloadRecord & {
  id?: string | number;
  alt?: string | null;
  caption?: PayloadRichText | null;
  filename?: string | null;
  height?: number | null;
  mimeType?: string | null;
  thumbnailURL?: string | null;
  updatedAt?: string | null;
  url?: string | null;
  width?: number | null;
};

export type PayloadRichTextNode = PayloadRecord & {
  children?: PayloadRichTextNode[];
  fields?: PayloadRecord;
  format?: number | string | null;
  tag?: string;
  text?: string;
  type?: string;
  value?: unknown;
};

export type PayloadRichText = PayloadRecord & {
  root?: PayloadRichTextNode;
};

export type PayloadLink = PayloadRecord & {
  appearance?: "default" | "outline" | null;
  label?: string | null;
  newTab?: boolean | null;
  reference?:
    | {
        relationTo?: "pages" | "posts" | null;
        value?: PayloadRecord | string | number | null;
      }
    | null;
  type?: "reference" | "custom" | null;
  url?: string | null;
};

export type PayloadContentColumn = PayloadRecord & {
  enableLink?: boolean | null;
  id?: string | null;
  link?: PayloadLink | null;
  richText?: PayloadRichText | null;
  size?: "oneThird" | "half" | "twoThirds" | "full" | null;
};

export type PayloadBlock = PayloadRecord & {
  location?: string | null;
  access?: string | null;
  hours?: string | null;
  costs?: string | null;
  description?: string | null;
  address?: string | null;
  aspectRatio?: "16/9" | "4/3" | "1/1" | null;
  blockName?: string | null;
  blockType?: string;
  cards?: PayloadRecord[] | null;
  categories?: Array<PayloadRecord | string | number> | null;
  columnCount?: "2" | "3" | "4" | null;
  columns?: PayloadContentColumn[] | null;
  email?: string | null;
  enableIntro?: boolean | null;
  form?: PayloadRecord | string | number | null;
  heading?: string | null;
  id?: string | null;
  introContent?: PayloadRichText | null;
  items?: PayloadRecord[] | null;
  kind?: "iframe" | "video" | "audio" | null;
  limit?: number | null;
  links?: Array<{ link?: PayloadLink | null }> | null;
  mapUrl?: string | null;
  media?: PayloadMedia | string | number | null;
  phone?: string | null;
  populateBy?: "collection" | "selection" | null;
  richText?: PayloadRichText | null;
  slot?:
    | "calendarUpcoming"
    | "news"
    | "showcaseOfMonth"
    | "resourceOfMonth"
    | null;
  title?: string | null;
  url?: string | null;
  selectedDocs?:
    | Array<{
        relationTo?: "posts" | null;
        value?: PayloadPost | string | number | null;
      }>
    | null;
};

export type PayloadPage = PayloadRecord & {
  _status?: "draft" | "published" | null;
  hero?:
    | (PayloadRecord & {
        links?: Array<{ link?: PayloadLink | null }> | null;
        media?: PayloadMedia | string | number | null;
        richText?: PayloadRichText | null;
        type?: "none" | "lowImpact" | "mediumImpact" | "highImpact";
      })
    | null;
  id: string | number;
  layout?: PayloadBlock[] | null;
  meta?:
    | (PayloadRecord & {
        description?: string | null;
        image?: PayloadMedia | string | number | null;
        title?: string | null;
      })
    | null;
  slug?: string | null;
  title: string;
  updatedAt?: string | null;
};

export type PayloadPost = PayloadRecord & {
  _status?: "draft" | "published" | null;
  content?: PayloadRichText | null;
  heroImage?: PayloadMedia | string | number | null;
  id: string | number;
  meta?:
    | (PayloadRecord & {
        description?: string | null;
        image?: PayloadMedia | string | number | null;
        title?: string | null;
      })
    | null;
  publishedAt?: string | null;
  slug?: string | null;
  title: string;
};

type PayloadListResponse<T> = {
  docs?: T[];
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

export const getPayloadCmsBaseUrl = () => {
  const value =
    process.env.PAYLOAD_CMS_URL ??
    process.env.PAYLOAD_PUBLIC_SERVER_URL ??
    process.env.NEXT_PUBLIC_CMS_URL ??
    "";

  return value.trim() ? trimTrailingSlashes(value.trim()) : null;
};

export const resolvePayloadMediaUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const baseUrl = getPayloadCmsBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}${value.startsWith("/") ? value : `/${value}`}`;
};

const getPageSlugCandidates = (slug: string) =>
  Array.from(
    new Set([
      `werkbereich-${slug}`,
      `werkbereiche-${slug}`,
      ...(isKnownWerkbereichSlug(slug) ? [slug] : []),
    ]),
  );

const fetchPayloadJson = async <T>(url: URL): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60, tags: ["payload-cms"] },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Das CMS darf die öffentliche Seite nicht mitreißen. Ohne Verbindung
    // bleibt der bisherige statische Inhalt sichtbar.
    return null;
  }
};

const loadPayloadPageByCandidateKey = cache(
  async (candidateKey: string): Promise<PayloadPage | null> => {
    const baseUrl = getPayloadCmsBaseUrl();
    if (!baseUrl) return null;

    const candidates = candidateKey.split("\n").filter(Boolean);
    if (candidates.length === 0) return null;

    const url = new URL("/api/pages", baseUrl);
    url.searchParams.set("where[_status][equals]", "published");
    candidates.forEach((candidate, index) => {
      url.searchParams.set(
        `where[or][${index}][slug][equals]`,
        candidate,
      );
    });
    url.searchParams.set("depth", "3");
    url.searchParams.set("draft", "false");
    url.searchParams.set("limit", String(candidates.length));

    const result = await fetchPayloadJson<PayloadListResponse<PayloadPage>>(url);
    const docs = (result?.docs ?? []).filter((page) => page._status === "published");
    if (docs.length === 0) return null;

    return (
      candidates
        .map((candidate) => docs.find((page) => page.slug === candidate))
        .find(Boolean) ?? null
    );
  },
);

/**
 * Lädt die erste veröffentlichte Payload-Page in der Reihenfolge der Slugs.
 * Alias-Slugs halten bestehende CMS-Installationen ohne Datenmigration nutzbar.
 */
export const loadPayloadPage = (slug: string, ...aliases: string[]) => {
  const candidates = Array.from(
    new Set([slug, ...aliases].map((value) => value.trim()).filter(Boolean)),
  );
  return loadPayloadPageByCandidateKey(candidates.join("\n"));
};

export const loadPayloadWerkbereichPage = (slug: string) => {
  const [primary, ...aliases] = getPageSlugCandidates(slug);
  return loadPayloadPage(primary, ...aliases);
};

export const payloadPageHasAppSlot = (
  page: PayloadPage,
  slot: NonNullable<PayloadBlock["slot"]>,
) =>
  (page.layout ?? []).some(
    (block) => block.blockType === "appSlot" && block.slot === slot,
  );

const getRelationId = (value: PayloadRecord | string | number) =>
  typeof value === "object" ? value.id : value;

export const loadPayloadArchivePosts = cache(
  async (block: PayloadBlock): Promise<PayloadPost[]> => {
    if (block.populateBy === "selection") {
      return (block.selectedDocs ?? [])
        .map((entry) =>
          entry && typeof entry.value === "object"
            ? (entry.value as PayloadPost)
            : null,
        )
        .filter((post): post is PayloadPost => Boolean(post?.title));
    }

    const baseUrl = getPayloadCmsBaseUrl();
    if (!baseUrl) return [];

    const url = new URL("/api/posts", baseUrl);
    url.searchParams.set("depth", "2");
    url.searchParams.set("draft", "false");
    url.searchParams.set("sort", "-publishedAt");
    url.searchParams.set("limit", String(Math.max(1, block.limit ?? 3)));

    const categoryIds = (block.categories ?? [])
      .map(getRelationId)
      .filter((value): value is string | number => value != null);
    if (categoryIds.length > 0) {
      url.searchParams.set(
        "where[categories][in]",
        categoryIds.join(","),
      );
    }

    const result = await fetchPayloadJson<PayloadListResponse<PayloadPost>>(url);
    return result?.docs ?? [];
  },
);

export const resolvePayloadLinkHref = (link: PayloadLink | null | undefined) => {
  if (!link) return null;

  if (link.type === "reference" && link.reference) {
    const { relationTo, value } = link.reference;
    if (value && typeof value === "object") {
      const slug = typeof value.slug === "string" ? value.slug : null;
      if (!slug) return null;

      if (relationTo === "pages") {
        return getPayloadPagePath(slug);
      }

      if (relationTo === "posts") {
        const baseUrl = getPayloadCmsBaseUrl();
        return baseUrl ? `${baseUrl}/posts/${slug}` : null;
      }
    }
  }

  const url = typeof link.url === "string" ? link.url.trim() : "";
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("#")) return url;

  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};
