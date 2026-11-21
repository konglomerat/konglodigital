import type { ResourcePayload } from "./campai-resources";
import type { PayloadPost, PayloadRichText, PayloadRichTextNode, PayloadRecord } from "./payload-cms";
import { getShowcaseAuthorInitials } from "./showcase-authors";
import { normalizeShowcaseLinks } from "./showcase-links";

export type ShowcaseAuthor = { id: string; name: string; avatarUrl: string | null; bio: string | null; email: null; initials: string };
export type ShowcaseRecord = ResourcePayload & {
  cmsId: string;
  isLegacyNews: boolean;
  originalUrl: string | null;
  legacyDateLabel: string | null;
  richText: PayloadRichText | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: ShowcaseAuthor | null;
};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const record = (value: unknown): PayloadRecord => value && typeof value === "object" && !Array.isArray(value) ? value as PayloadRecord : {};
const records = (value: unknown): PayloadRecord[] => Array.isArray(value) ? value.map(record) : [];
export const safeMediaUrl = (value: unknown, base: string): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try { const url = new URL(raw, base); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
};
/** Plain text for teasers, newsletters and stories; detail pages render rich text. */
export function lexicalPlainText(node: PayloadRichTextNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "linebreak") return "\n";
  const children = (node.children ?? []).map(lexicalPlainText).join("");
  return ["paragraph", "heading", "listitem", "quote"].includes(node.type ?? "") ? `${children}\n\n` : children;
}
export function toPayloadShowcase(post: PayloadPost, base: string): ShowcaseRecord | null {
  // Defense in depth: publication must be checked even if an upstream query is wrong.
  if (post._status !== "published" || !post.slug?.trim()) return null;
  const id = text(post.legacyResourceId) || String(post.id);
  const gallery = records(post.gallery);
  const mediaUrl = (value: unknown) => safeMediaUrl(record(value).url, base);
  const hero = mediaUrl(post.heroImage);
  const galleryUrls = gallery.map(item => mediaUrl(item.media) || safeMediaUrl(item.url, base));
  const images = [...new Set([hero, ...galleryUrls].filter((url): url is string => Boolean(url)))];
  const previews: Record<string, string> = {}, posters: Record<string, string> = {};
  gallery.forEach((item, index) => {
    const url = galleryUrls[index];
    if (!url) return;
    const preview = safeMediaUrl(item.previewUrl, base), poster = safeMediaUrl(item.posterUrl, base);
    if (preview) previews[url] = preview;
    if (poster) posters[url] = poster;
  });
  const authorName = text(post.authorName) || text(records(post.populatedAuthors)[0]?.name);
  const resource = (value: unknown) => {
    const row = record(value), resourceId = text(row.resourceId);
    return resourceId ? { id: resourceId, name: text(row.name) || resourceId, prettyTitle: text(row.slug), image: safeMediaUrl(row.imageUrl, base) } : null;
  };
  return {
    id, cmsId: String(post.id), isLegacyNews: post.sourceType === "legacy-news", originalUrl: safeMediaUrl(post.originalUrl, base), prettyTitle: post.slug, name: post.title, type: "project",
    legacyDateLabel: text(post.legacyDateLabel),
    ownerId: null, authorName, author: authorName ? { id: `post-author:${post.id}`, name: authorName, bio: text(post.authorBio), avatarUrl: safeMediaUrl(post.authorAvatarUrl, base), email: null, initials: getShowcaseAuthorInitials(authorName) } : null,
    excerpt: text(post.excerpt) || undefined,
    description: lexicalPlainText(post.content?.root).trim(), richText: post.content || null,
    image: images[0] || null, images, mediaPreviews: previews, mediaPosters: posters,
    tags: records(post.tags).map(row => text(row.tag)).filter((tag): tag is string => Boolean(tag)),
    workshopResource: resource(post.workshop),
    relatedResources: records(post.resources).map(resource).filter((row): row is NonNullable<typeof row> => Boolean(row)),
    showcaseLinks: normalizeShowcaseLinks(records(post.projectLinks)), socialMediaConsent: post.socialMediaConsent === true,
    isPrivate: false, publishDate: post.publishedAt || null,
    createdAt: text(post.sourceCreatedAt) || text(post.createdAt), updatedAt: text(post.updatedAt),
  };
}
export const showcaseAsResourceRow = (showcase: ShowcaseRecord) => ({
  id: showcase.id, pretty_title: showcase.prettyTitle ?? null, owner_id: null,
  name: showcase.name, excerpt: showcase.excerpt ?? null, description: showcase.description ?? null,
  image: showcase.image ?? null, images: showcase.images ?? [], type: "project",
  tags: showcase.tags ?? [], is_private: false, media_posters: showcase.mediaPosters,
  social_media_consent: showcase.socialMediaConsent === true,
  workshop_resource_id: showcase.workshopResource?.id ?? null,
  publish_date: showcase.publishDate ?? null, created_at: showcase.createdAt, updated_at: showcase.updatedAt,
});
