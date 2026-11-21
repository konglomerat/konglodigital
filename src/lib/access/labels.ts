// Anzeigenamen für Zuweisungen: „Buchhaltung · Holz" oder „Admin".
import type { RoleAssignment } from "@/lib/access/access";
import { getRoleDefinition } from "@/lib/access/role-config";
import { type Scope, findScope } from "@/lib/access/scopes";

export const GLOBAL_SCOPE_LABEL = "Global";

export const getScopeLabel = (
  scopes: readonly Scope[],
  scopeId: string | null,
) =>
  scopeId === null
    ? GLOBAL_SCOPE_LABEL
    : (findScope(scopes, scopeId)?.name ?? scopeId);

export const describeAssignment = (
  assignment: Pick<RoleAssignment, "role" | "scopeId">,
  scopes: readonly Scope[],
) => {
  const roleLabel = getRoleDefinition(assignment.role).label;
  return assignment.scopeId === null
    ? roleLabel
    : `${roleLabel} · ${getScopeLabel(scopes, assignment.scopeId)}`;
};
