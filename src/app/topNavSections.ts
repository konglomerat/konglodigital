// Hauptpunkte der Topnav, gemeinsam für Desktop und Telefon, damit beide
// dieselbe Struktur zeigen.
import { stripLocalePrefix } from "@/i18n/config";
import type { SiteNavItem } from "@/lib/payload-navigation";

export type TopNavSection = SiteNavItem;

// Die Links kommen aus der Payload-Navigation. Login-pflichtige Bereiche
// erscheinen ausgeloggt gar nicht.
export const getTopNavSections = (
  links: SiteNavItem[],
  isAuthenticated: boolean,
  inventoryHref: string,
): TopNavSection[] => [
  ...links,
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
