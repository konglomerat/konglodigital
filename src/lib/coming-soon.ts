// Bereiche, die noch in Arbeit sind: nur angemeldet erreichbar (middleware)
// und in der Topnav mit „Coming Soon“ markiert. Ausgeloggt fehlen sie und
// alle Links dorthin.
import { stripLocalePrefix } from "@/i18n/config";

export const COMING_SOON_PREFIXES = ["/werkbereiche", "/workshops"];

export const isComingSoonPath = (pathname: string) =>
  COMING_SOON_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

/** Auch für lokalisierte Links wie /en/werkbereiche; externe nie. */
export const isComingSoonHref = (href: string) =>
  href.startsWith("/") &&
  isComingSoonPath(stripLocalePrefix(href.split(/[?#]/)[0]).pathname);
