import { VEREINSPROJEKTE, WERKBEREICHE } from "@/lib/werkbereiche";

const PAGE_ALIASES: Record<string, string> = {
  startseite: "/",
  home: "/",
  verein: "/verein",
  "ueber-uns": "/verein",
  werkbereiche: "/werkbereiche",
  werkstattbereiche: "/werkbereiche",
  monatsbeitrag: "/monatsbeitrag",
  zugangskarte: "/monatsbeitrag",
};

const WERKBEREICH_SLUGS = new Set([
  ...WERKBEREICHE.map((entry) => entry.slug),
  ...VEREINSPROJEKTE.map((entry) => entry.slug),
]);

/** Public route for a Pages document, including the existing app page aliases. */
export function getPayloadPagePath(slug: string): string | null {
  // Matches the backend's single-segment slug field. Never turn a CMS
  // reference into an external URL, query string or path traversal.
  if (!/^[a-z0-9_-]+$/.test(slug)) return null;
  if (Object.hasOwn(PAGE_ALIASES, slug)) return PAGE_ALIASES[slug];

  const werkbereichSlug = slug.replace(/^(?:werkbereiche?-)+/, "");
  if (!werkbereichSlug) return null;
  if (slug !== werkbereichSlug || WERKBEREICH_SLUGS.has(slug)) {
    return `/werkbereiche/${werkbereichSlug}`;
  }

  return `/${slug}`;
}

export const isKnownWerkbereichSlug = (slug: string) => WERKBEREICH_SLUGS.has(slug);
