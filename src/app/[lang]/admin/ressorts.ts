import { type AppModule, type UserRole, rolesCanAccessModule } from "@/lib/roles";

export type RessortId =
  | "buchhaltung"
  | "vorstand"
  | "admin"
  | "vhc"
  | "oeffentlichkeitsarbeit";

export type RessortChild = {
  href: string;
  label: string;
};

export type Ressort = {
  id: RessortId;
  href: string;
  label: string;
  /** Unlokalisierte Routen, bei denen dieses Ressort aktiv ist. */
  match: string[];
  /** Module, von denen eines fuer den Zugriff reicht. */
  modules: AppModule[];
  /** Unterpunkte in der Sidenav. Die Werkbereiche der Buchhaltung kommen aus
   *  Campai und werden in VerwaltungShell ergänzt. */
  children?: RessortChild[];
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
    children: [
      { href: "/kofi", label: "KoFi" },
      { href: "/admin/vorstand/ehrenamtsbonus", label: "Ehrenamtsbonus" },
    ],
  },
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    match: ["/admin", "/admin/users", "/admin/contacts"],
    modules: ["admin"],
    children: [
      { href: "/admin/users", label: "Benutzer" },
      { href: "/admin/contacts", label: "Mitglieder" },
    ],
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
    children: [
      { href: "/admin/generate-newsletter", label: "Newsletter" },
      { href: "/admin/generate-story", label: "Storys" },
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

export const getVerwaltungEntryHref = (roles: readonly UserRole[]): string => {
  const accessible = RESSORTS.find((ressort) =>
    ressort.modules.some((module) => rolesCanAccessModule(roles, module)),
  );
  return (accessible ?? RESSORTS[0]).href;
};
