export type RessortId =
  | "buchhaltung"
  | "vorstand"
  | "admin"
  | "vhc"
  | "oeffentlichkeitsarbeit";

export type Ressort = {
  id: RessortId;
  href: string;
  label: string;
  /** Unlokalisierte Routen, bei denen dieses Ressort aktiv ist. */
  match: string[];
};

export const RESSORTS: Ressort[] = [
  {
    id: "buchhaltung",
    href: "/receipts",
    label: "Buchhaltung",
    match: ["/receipts"],
  },
  {
    id: "vorstand",
    href: "/admin/vorstand",
    label: "Vorstand",
    match: ["/admin/vorstand", "/kofi"],
  },
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    match: ["/admin", "/admin/users", "/admin/contacts"],
  },
  {
    id: "vhc",
    href: "/admin/volkshaus",
    label: "VHC",
    match: ["/admin/volkshaus"],
  },
  {
    id: "oeffentlichkeitsarbeit",
    href: "/admin/oeffentlichkeitsarbeit",
    label: "Öffentlichkeitsarbeit",
    match: [
      "/admin/oeffentlichkeitsarbeit",
      "/admin/generate-newsletter",
      "/admin/generate-story",
    ],
  },
];

export const getRessort = (id: RessortId): Ressort => {
  const ressort = RESSORTS.find((entry) => entry.id === id);
  if (!ressort) {
    throw new Error(`Unbekanntes Ressort: ${id}`);
  }
  return ressort;
};
