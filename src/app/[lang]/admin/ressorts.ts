// Die Ressorts der Verwaltung. Die Sidenav zeigt nur, was canOpen() erlaubt —
// dieselben Regeln, mit denen die Seiten selbst über AccessGuard schützen.
// Die Ressort-Startseiten nutzen canOpen() direkt als Guard. Admin und
// Vorstand hängen an eigenen ressort.*-Berechtigungen: welche Rolle sie
// sieht, steht in role-config.ts.
import {
  type UserAccess,
  can,
  canAnywhere,
} from "@/lib/access/access";
import type { Permission } from "@/lib/access/role-config";
import { VOLKSHAUS_SCOPE_ID } from "@/lib/access/scopes";

export type RessortId =
  | "buchhaltung"
  | "vorstand"
  | "admin"
  | "vhc"
  | "oeffentlichkeitsarbeit";

type AccessCheck = (access: UserAccess | null) => boolean;

export type RessortChild = {
  href: string;
  label: string;
  canOpen: AccessCheck;
};

export type Ressort = {
  id: RessortId;
  href: string;
  label: string;
  /** Unlokalisierte Routen, bei denen dieses Ressort aktiv ist. */
  match: string[];
  /** Darf die Startseite des Ressorts geöffnet werden? */
  canOpen: AccessCheck;
  /** Unterpunkte in der Sidenav. Die Werkbereiche der Buchhaltung kommen aus
   *  Campai und werden in VerwaltungShell ergänzt und gefiltert. */
  children?: RessortChild[];
};

const canOpenAnyChild = (children: RessortChild[]): AccessCheck => (access) =>
  children.some((child) => child.canOpen(access));

/** Das Ressort selbst freigegeben und mindestens ein Unterpunkt offen. */
const canOpenRessort =
  (permission: Permission, children: RessortChild[]): AccessCheck =>
  (access) =>
    can(access, permission) && canOpenAnyChild(children)(access);

const VORSTAND_CHILDREN: RessortChild[] = [
  {
    href: "/kofi",
    label: "KoFi",
    canOpen: (access) => can(access, "kofi.view"),
  },
  {
    href: "/admin/vorstand/ehrenamtsbonus",
    label: "Ehrenamtsbonus",
    canOpen: (access) => can(access, "ehrenamtsbonus.manage"),
  },
];

const ADMIN_CHILDREN: RessortChild[] = [
  {
    href: "/admin/users",
    label: "Benutzer",
    canOpen: (access) => can(access, "users.manage"),
  },
  {
    href: "/admin/contacts",
    label: "Mitglieder",
    canOpen: (access) => can(access, "contacts.manage"),
  },
];

const OEFFENTLICHKEITSARBEIT_CHILDREN: RessortChild[] = [
  {
    href: "/admin/generate-newsletter",
    label: "Newsletter",
    canOpen: (access) => can(access, "newsletter.manage"),
  },
  {
    href: "/admin/generate-story",
    label: "Storys",
    canOpen: (access) => can(access, "stories.manage"),
  },
];

export const RESSORTS: Ressort[] = [
  {
    id: "buchhaltung",
    href: "/receipts",
    label: "Buchhaltung",
    match: ["/receipts"],
    canOpen: (access) => canAnywhere(access, "receipts.view"),
  },
  {
    id: "vorstand",
    href: "/admin/vorstand",
    label: "Vorstand",
    match: ["/admin/vorstand", "/kofi"],
    canOpen: canOpenRessort("ressort.vorstand", VORSTAND_CHILDREN),
    children: VORSTAND_CHILDREN,
  },
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    match: ["/admin", "/admin/users", "/admin/contacts"],
    canOpen: canOpenRessort("ressort.admin", ADMIN_CHILDREN),
    children: ADMIN_CHILDREN,
  },
  {
    id: "vhc",
    href: "/admin/volkshaus",
    label: "VHC",
    match: ["/admin/volkshaus"],
    canOpen: (access) =>
      can(access, "volkshaus.bookings.manage", { scope: VOLKSHAUS_SCOPE_ID }),
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
    canOpen: canOpenAnyChild(OEFFENTLICHKEITSARBEIT_CHILDREN),
    children: OEFFENTLICHKEITSARBEIT_CHILDREN,
  },
];

export const getRessort = (id: RessortId): Ressort => {
  const ressort = RESSORTS.find((entry) => entry.id === id);
  if (!ressort) {
    throw new Error(`Unbekanntes Ressort: ${id}`);
  }
  return ressort;
};

export const getVisibleRessorts = (access: UserAccess | null) =>
  RESSORTS.filter((ressort) => ressort.canOpen(access));

/** Einstieg in die Verwaltung: das erste Ressort, das der Nutzer öffnen darf —
 *  null, wenn es keins gibt (dann fehlt die Verwaltung in der Topnav). */
export const getVerwaltungEntryHref = (
  access: UserAccess | null,
): string | null => getVisibleRessorts(access)[0]?.href ?? null;
