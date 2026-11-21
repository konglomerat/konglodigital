import "server-only";

import { cache } from "react";
import { localizePathname, stripLocalePrefix, type Locale } from "@/i18n/config";
import { getPayloadCmsBaseUrl, resolvePayloadLinkHref, type PayloadLink } from "./payload-cms";

export type SiteNavItem = {
  href: string;
  label: string;
  newTab?: boolean;
};

export const DEFAULT_HEADER_LINKS: SiteNavItem[] = [
  { href: "/verein", label: "Verein" },
  { href: "/werkbereiche", label: "Werkbereiche" },
  { href: "/showcase", label: "Beiträge" },
  { href: "/workshops", label: "Workshops" },
];

export const DEFAULT_FOOTER_LINKS: SiteNavItem[] = [
  { href: "https://konglomerat.org/impressum", label: "Impressum", newTab: true },
  { href: "https://konglomerat.org/datenschutz", label: "Datenschutz", newTab: true },
  { href: "https://support.konglomerat.org", label: "Support", newTab: true },
  { href: "/design-system", label: "Design System" },
];

/** null means unavailable; an explicitly saved empty menu stays empty. */
export function resolveNavigationItems(value: unknown): SiteNavItem[] | null {
  if (!value || typeof value !== "object" || !("navItems" in value)) return null;
  if (!Array.isArray(value.navItems)) return null;
  // Payload returns { navItems: [] } before a global has ever been saved.
  if (value.navItems.length === 0 && !("id" in value)) return null;

  return value.navItems.flatMap((item): SiteNavItem[] => {
    if (!item || typeof item !== "object" || !item.link || typeof item.link !== "object") return [];
    const link = item.link as PayloadLink;
    const label = typeof link.label === "string" ? link.label.trim() : "";
    // Anonymous Payload reads normally omit inaccessible relationships. Also
    // reject explicitly supplied drafts rather than linking to private pages.
    const reference = link.reference?.value;
    if (link.type === "reference" && typeof reference === "object" && reference?._status === "draft") return [];
    const href = resolvePayloadLinkHref(link);
    if (!label || !href || href.startsWith("//") || /[\\\u0000-\u001f]/.test(href)) return [];
    return [{ href, label, newTab: link.newTab === true }];
  });
}

async function loadNavigationGlobal(slug: "header" | "footer") {
  const baseUrl = getPayloadCmsBaseUrl();
  if (!baseUrl) return null;
  try {
    const url = new URL(`/api/globals/${slug}`, baseUrl);
    url.searchParams.set("depth", "1");
    url.searchParams.set("draft", "false");
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60, tags: ["payload-cms", `payload-${slug}`] },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? resolveNavigationItems(await response.json()) : null;
  } catch {
    // Navigation must remain usable if the CMS is offline or not configured.
    return null;
  }
}

export const loadPayloadNavigation = cache(async () => {
  const [header, footer] = await Promise.all([
    loadNavigationGlobal("header"),
    loadNavigationGlobal("footer"),
  ]);
  return { header, footer };
});

export function localizeNavigationItems(items: SiteNavItem[], locale: Locale): SiteNavItem[] {
  return items.map((item) => ({
    ...item,
    href: item.href.startsWith("/") && !/^\/(api|auth)(\/|$)/.test(item.href)
      ? localizePathname(stripLocalePrefix(item.href).pathname, locale)
      : item.href,
  }));
}
