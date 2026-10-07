// Rollen und ihre Berechtigungen — versioniert im Code, nicht in der DB.
// In role_assignments steht nur der Rollenname; was eine Rolle darf, steht
// hier. Code fragt nie Rollennamen ab, sondern immer can()/allowedScopes()
// mit einer Berechtigung (siehe access.ts).

export const PERMISSIONS = [
  /** Ressort Admin in der Verwaltung (Menü und Startseite). */
  "ressort.admin",
  /** Ressort Vorstand in der Verwaltung (Menü und Startseite). */
  "ressort.vorstand",
  /** Benutzerliste, Einladungen, Campai-Verknüpfung. */
  "users.manage",
  /** Jede Rolle in jedem Geltungsbereich vergeben und entziehen. */
  "access.manage",
  /** Campai-Mitgliederkontakte einsehen. */
  "contacts.manage",
  "ehrenamtsbonus.manage",
  /** KoFi-Auswertung über alle Kostenstellen. */
  "kofi.view",
  "newsletter.manage",
  "stories.manage",
  /** Belege, Kassen und Rechnungen der Buchhaltung einsehen. */
  "receipts.view",
  /** Belege, Rechnungen, Erstattungen und Eigenbelege anlegen und ändern. */
  "receipts.edit",
  /** Inhalte eines Werkbereichs oder Projekts pflegen (vorbereitet). */
  "content.edit",
  /** Raumbuchungen im Volkshaus bearbeiten — Geltungsbereich `vhc`. */
  "volkshaus.bookings.manage",
  /** Alle Inventar-Einträge bearbeiten (eigene darf jedes Mitglied). */
  "resources.edit",
  /** Inventar-Einträge löschen und Dubletten auflösen. */
  "resources.delete",
  /** Fremde Showcase-Einträge bearbeiten und löschen. */
  "showcase.edit",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** `global`: nur ohne Geltungsbereich vergebbar. `global_or_scope`: auch pro Bereich. */
export type RoleScoping = "global" | "global_or_scope";

export type RoleDefinition = {
  label: string;
  description: string;
  scoping: RoleScoping;
  permissions: readonly Permission[];
};

export const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    description: "Darf alles, auch Rollen vergeben.",
    scoping: "global",
    permissions: PERMISSIONS,
  },
  vorstand: {
    label: "Vorstand",
    description: "Ehrenamtsbonus und KoFi.",
    scoping: "global",
    permissions: ["ressort.vorstand", "ehrenamtsbonus.manage", "kofi.view"],
  },
  oeffentlichkeitsarbeit: {
    label: "Öffentlichkeitsarbeit",
    description: "Newsletter und Storys.",
    scoping: "global",
    permissions: ["newsletter.manage", "stories.manage"],
  },
  buchhaltung: {
    label: "Buchhaltung",
    description: "Belege, Rechnungen und Kassen. Global zusätzlich KoFi.",
    scoping: "global_or_scope",
    permissions: ["receipts.view", "receipts.edit", "kofi.view"],
  },
  cms: {
    label: "CMS",
    description: "Inhalte von Werkbereichen und Projekten pflegen.",
    scoping: "global_or_scope",
    permissions: ["content.edit"],
  },
  tools: {
    label: "Tools",
    description: "Die Werkzeuge eines Bereichs, z. B. die Raumbuchung im VHC.",
    scoping: "global_or_scope",
    permissions: ["volkshaus.bookings.manage"],
  },
  inventar: {
    label: "Inventar",
    description:
      "Alle Ressourcen im Inventar bearbeiten und löschen. Anlegen und eigene bearbeiten darf jedes Mitglied.",
    scoping: "global",
    permissions: ["resources.edit", "resources.delete"],
  },
  showcase: {
    label: "Showcase",
    description: "Alle Showcase-Einträge bearbeiten.",
    scoping: "global",
    permissions: ["showcase.edit"],
  },
} as const satisfies Record<string, RoleDefinition>;

export type RoleName = keyof typeof ROLE_CONFIG;

export const ROLE_NAMES = Object.keys(ROLE_CONFIG) as RoleName[];

/** Die Rolle, ohne die das System nicht verwaltet werden kann. Der letzte
 *  globale Eintrag ist per DB-Trigger geschützt, ein Bootstrap-Admin kommt
 *  über BOOTSTRAP_ADMIN_EMAILS. */
export const SYSTEM_ADMIN_ROLE: RoleName = "admin";

export const isRoleName = (value: unknown): value is RoleName =>
  typeof value === "string" && Object.hasOwn(ROLE_CONFIG, value);

export const getRoleDefinition = (role: RoleName): RoleDefinition =>
  ROLE_CONFIG[role];

export const roleHasPermission = (role: RoleName, permission: Permission) =>
  getRoleDefinition(role).permissions.includes(permission);
