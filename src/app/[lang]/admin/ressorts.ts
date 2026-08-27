import { type AppModule, type UserRole, rolesCanAccessModule } from "@/lib/roles";

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
  /** Module, von denen eines fuer den Zugriff reicht. */
  modules: AppModule[];
};

export const RESSORTS: Ressort[] = [
  {
    id: "buchhaltung",
    href: "/receipts",
    label: "Buchhaltung",
    match: ["/receipts"],
    modules: ["invoices"],
  },
  {
    id: "vorstand",
    href: "/admin/vorstand",
    label: "Vorstand",
    match: ["/admin/vorstand", "/kofi"],
    modules: ["admin", "volkshaus"],
  },
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    match: ["/admin", "/admin/users", "/admin/contacts"],
    modules: ["admin"],
  },
  {
    id: "vhc",
    href: "/admin/volkshaus",
    label: "VHC",
    match: ["/admin/volkshaus"],
    modules: ["volkshaus"],
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
    modules: ["admin", "volkshaus"],
  },
];

export const getRessort = (id: RessortId): Ressort => {
  const ressort = RESSORTS.find((entry) => entry.id === id);
  if (!ressort) {
    throw new Error(`Unbekanntes Ressort: ${id}`);
  }
  return ressort;
};

export const getVerwaltungEntryHref = (roles: readonly UserRole[]): string => {
  const accessible = RESSORTS.find((ressort) =>
    ressort.modules.some((module) => rolesCanAccessModule(roles, module)),
  );
  return (accessible ?? RESSORTS[0]).href;
};
