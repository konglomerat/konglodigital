// Hauptpunkte der Topnav, gemeinsam für Desktop und Telefon, damit beide
// dieselbe Struktur zeigen.
export type TopNavSection = {
  href: string;
  label: string;
};

// Login-pflichtige Bereiche erscheinen ausgeloggt gar nicht.
export const getTopNavSections = (isAuthenticated: boolean): TopNavSection[] => [
  { href: "/verein", label: "Verein" },
  { href: "/werkbereiche", label: "Werkbereiche" },
  { href: "/showcase", label: "Hier entstanden" },
  ...(isAuthenticated ? [{ href: "/resources", label: "Inventar" }] : []),
];

export const isTopNavSectionActive = (current: string, href: string) =>
  current === href || current.startsWith(`${href}/`);

export const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};
