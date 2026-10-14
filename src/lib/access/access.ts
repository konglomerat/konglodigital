// Die zentralen Prüfungen des Rollenmodells „Rollen mit Geltungsbereich".
// Rein und ohne Server-Abhängigkeit: Seiten, Routen und Tests teilen sich das.
//
// Eine Zuweisung ohne scopeId gilt global, sonst nur im genannten Bereich.
// Geprüft wird immer eine Berechtigung, nie ein Rollenname.
import {
  type Permission,
  type RoleName,
  getRoleDefinition,
  roleHasPermission,
} from "@/lib/access/role-config";

export type RoleAssignment = {
  /** null bei Zuweisungen, die nicht aus der DB kommen (Bootstrap-Admin). */
  id: string | null;
  userId: string;
  role: RoleName;
  /** null = global. */
  scopeId: string | null;
  grantedBy: string | null;
  createdAt: string | null;
};

export type UserAccess = {
  userId: string;
  assignments: readonly RoleAssignment[];
};

export const ALL_SCOPES = "all" as const;

/** Alle Bereiche — oder genau diese Liste (kann leer sein). */
export type AllowedScopes = typeof ALL_SCOPES | string[];

type AccessInput = UserAccess | null | undefined;

const assignmentsWith = (access: AccessInput, permission: Permission) =>
  (access?.assignments ?? []).filter((assignment) =>
    roleHasPermission(assignment.role, permission),
  );

/**
 * Darf der Nutzer das — global oder im genannten Bereich?
 * Ohne `scope` zählt nur eine globale Zuweisung; für „in irgendeinem
 * Bereich" gibt es canAnywhere().
 */
export const can = (
  access: AccessInput,
  permission: Permission,
  options: { scope?: string | null } = {},
): boolean => {
  const scope = options.scope ?? null;
  return assignmentsWith(access, permission).some(
    (assignment) =>
      assignment.scopeId === null ||
      (scope !== null && assignment.scopeId === scope),
  );
};

/** In welchen Bereichen darf der Nutzer das? ALL_SCOPES bei globaler Zuweisung. */
export const allowedScopes = (
  access: AccessInput,
  permission: Permission,
): AllowedScopes => {
  const matching = assignmentsWith(access, permission);
  if (matching.some((assignment) => assignment.scopeId === null)) {
    return ALL_SCOPES;
  }

  return Array.from(
    new Set(
      matching
        .map((assignment) => assignment.scopeId)
        .filter((scopeId): scopeId is string => scopeId !== null),
    ),
  ).sort();
};

export const isScopeAllowed = (allowed: AllowedScopes, scopeId: string) =>
  allowed === ALL_SCOPES || allowed.includes(scopeId);

/** Global oder in mindestens einem Bereich. */
export const canAnywhere = (access: AccessInput, permission: Permission) => {
  const allowed = allowedScopes(access, permission);
  return allowed === ALL_SCOPES || allowed.length > 0;
};

export const canAny = (
  access: AccessInput,
  permissions: readonly Permission[],
  options: { scope?: string | null } = {},
) => permissions.some((permission) => can(access, permission, options));

/** Ist die Kombination aus Rolle und Geltungsbereich laut Config erlaubt? */
export const getAssignmentShapeError = (
  role: RoleName,
  scopeId: string | null,
): string | null =>
  scopeId !== null && getRoleDefinition(role).scoping === "global"
    ? `Die Rolle „${getRoleDefinition(role).label}" kann nur global vergeben werden.`
    : null;

/** Darf der Nutzer Rollen vergeben und entziehen? Nur mit access.manage. */
export const canManageAccess = (access: AccessInput) =>
  can(access, "access.manage");

/** Darf der Nutzer diese Rolle in diesem Bereich vergeben (oder entziehen)? */
export const canGrantRole = (
  access: AccessInput,
  role: RoleName,
  scopeId: string | null,
): boolean =>
  !getAssignmentShapeError(role, scopeId) && canManageAccess(access);
