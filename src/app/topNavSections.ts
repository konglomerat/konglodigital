// Hauptpunkte der Topnav, gemeinsam für Desktop und Telefon, damit beide
// dieselbe Struktur zeigen.
import { stripLocalePrefix } from "@/i18n/config";
import { isComingSoonHref } from "@/lib/coming-soon";
import type { SiteNavItem } from "@/lib/payload-navigation";

export type TopNavSection = SiteNavItem & { comingSoon?: boolean };

// Die Links kommen aus der Payload-Navigation. Login-pflichtige Bereiche
// erscheinen ausgeloggt gar nicht — auch die, die noch in Arbeit sind und
// angemeldet „Coming Soon“ tragen.
export const getTopNavSections = (
  links: SiteNavItem[],
  isAuthenticated: boolean,
  inventoryHref: string,
): TopNavSection[] => [
  ...links.flatMap((link) => {
    const comingSoon = isComingSoonHref(link.href);
    if (comingSoon && !isAuthenticated) return [];
    return [comingSoon ? { ...link, comingSoon } : link];
  }),
  ...(isAuthenticated && !links.some((link) => link.href === inventoryHref)
    ? [{ href: inventoryHref, label: "Inventar" }]
    : []),
];

export const isInternalHref = (href: string) => href.startsWith("/");

export const isTopNavSectionActive = (current: string, href: string) => {
  if (!isInternalHref(href)) return false;
  const targetPath = stripLocalePrefix(href.split(/[?#]/)[0]).pathname;
  return (
    current === targetPath ||
    (targetPath !== "/" && current.startsWith(`${targetPath}/`))
  );
};

export const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};
