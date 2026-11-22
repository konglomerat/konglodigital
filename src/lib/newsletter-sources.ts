import "server-only";

import { cache } from "react";
import { createHash } from "node:crypto";
import { loadAllShowcases, loadShowcaseByIdentifier } from "@/app/[lang]/showcase/showcase-data";
import { getUpcomingEvents } from "@/app/[lang]/calendar/calendar-data";
import { getPayloadCmsBaseUrl, type PayloadPage } from "@/lib/payload-cms";
import { lexicalPlainText, safeMediaUrl, type ShowcaseRecord } from "@/lib/payload-showcases";
import { getPayloadPagePath } from "@/lib/payload-page-path";
import { buildShowcasePath } from "@/lib/showcase-path";
import { isImageUrl } from "@/lib/resource-media";

export type NewsletterSourceKind = "project" | "archive" | "page" | "workshop" | "event";
export type NewsletterSource = {
  id: string;
  name: string;
  prettyTitle: string | null;
  excerpt: string | null;
  description: string | null;
  images: string[];
  publishDate: string | null;
  updatedAt: string | null;
  createdAt?: string | null;
  href: string;
  kind: NewsletterSourceKind;
};

function fromPost(post: ShowcaseRecord): NewsletterSource {
  return {
    id: post.id, name: post.name, prettyTitle: post.prettyTitle ?? null,
    excerpt: post.excerpt ?? null, description: post.description ?? null,
    images: [...new Set([post.image, ...(post.images ?? [])].filter((url): url is string => typeof url === "string" && Boolean(url) && isImageUrl(url)))],
    publishDate: post.publishDate ?? null, updatedAt: post.updatedAt ?? null, createdAt: post.createdAt,
    href: buildShowcasePath(post), kind: post.isLegacyNews ? "archive" : "project",
  };
}

export const loadNewsletterPages = cache(async (): Promise<NewsletterSource[]> => {
  const base = getPayloadCmsBaseUrl();
  if (!base) throw new Error("Das Seiten-CMS ist nicht eingerichtet.");
  const entries: NewsletterSource[] = [];
  for (let page = 1; ; page++) {
    const url = new URL("/api/pages", base);
    url.search = new URLSearchParams({ "where[_status][equals]": "published", draft: "false", depth: "1", limit: "100", page: String(page), sort: "title" }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("CMS-Seiten konnten nicht geladen werden.");
    const result = await response.json() as { docs?: PayloadPage[]; hasNextPage?: boolean };
    if (!Array.isArray(result.docs)) throw new Error("Ungültige Antwort vom Seiten-CMS.");
    for (const doc of result.docs) {
      const href = doc.slug ? getPayloadPagePath(doc.slug) : null;
      if (doc._status !== "published" || !href) continue;
      const media = doc.hero?.media ?? doc.meta?.image;
      const image = typeof media === "object" && media ? safeMediaUrl(media.url, base) : null;
      entries.push({
        id: `page:${doc.id}`, name: doc.title, prettyTitle: doc.slug ?? null,
        excerpt: doc.meta?.description ?? null,
        description: [lexicalPlainText(doc.hero?.richText?.root), ...(doc.layout ?? []).flatMap(block => [
          lexicalPlainText(block.richText?.root), lexicalPlainText(block.introContent?.root),
          ...(block.columns ?? []).map(column => lexicalPlainText(column.richText?.root)),
          block.description ?? "",
        ])].filter(Boolean).join("\n\n").trim(),
        images: image && isImageUrl(image) ? [image] : [], publishDate: null,
        updatedAt: doc.updatedAt ?? null, createdAt: typeof doc.createdAt === "string" ? doc.createdAt : null, href,
        kind: href.startsWith("/werkbereiche/") ? "workshop" : "page",
      });
    }
    if (!result.hasNextPage) break;
  }
  return entries;
});

export const loadNewsletterEvents = cache(async (): Promise<NewsletterSource[]> => {
  const events = await getUpcomingEvents(28);
  return events.map(event => {
    const date = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin", dateStyle: "full", ...(event.allDay ? {} : { timeStyle: "short" as const }),
    }).format(event.start);
    return {
      id: `event:${createHash("sha256").update(`${event.id}:${event.start.toISOString()}`).digest("hex")}`, name: event.summary,
      prettyTitle: null, excerpt: [date, event.location, event.description].filter(Boolean).join(" · "),
      description: event.description ?? null, images: [], publishDate: event.start.toISOString(),
      updatedAt: null, href: "/calendar", kind: "event" as const,
    };
  });
});

export async function loadNewsletterLibrary() {
  const results = await Promise.allSettled([
    loadAllShowcases().then(posts => posts.map(fromPost)), loadNewsletterPages(), loadNewsletterEvents(),
  ]);
  const names = ["Beiträge", "Seiten und Werkbereiche", "Termine"];
  return {
    entries: results.flatMap(result => result.status === "fulfilled" ? result.value : []),
    warnings: results.flatMap((result, index) => result.status === "rejected" ? [`${names[index]} konnten nicht geladen werden. Bitte lade die Seite erneut.`] : []),
  };
}

/** Load each auxiliary collection once per request, also in Route Handlers. */
export async function loadNewsletterSources(ids: string[]): Promise<Array<NewsletterSource | null>> {
  const [pages, events] = await Promise.all([
    ids.some(id => id.startsWith("page:")) ? loadNewsletterPages() : [],
    ids.some(id => id.startsWith("event:")) ? loadNewsletterEvents() : [],
  ]);
  const auxiliary = new Map([...pages, ...events].map(entry => [entry.id, entry]));
  return Promise.all(ids.map(async id => {
    if (id.startsWith("page:") || id.startsWith("event:")) return auxiliary.get(id) ?? null;
    const post = await loadShowcaseByIdentifier(id);
    return post ? fromPost(post) : null;
  }));
}
