// Lesen und Schreiben von `scopes` und `role_assignments`. Wer was darf,
// entscheidet access.ts — hier wird nur gespeichert.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RoleAssignment } from "@/lib/access/access";
import { isRoleName, type RoleName } from "@/lib/access/role-config";
import { SCOPE_TYPES, type Scope, type ScopeType } from "@/lib/access/scopes";
import { isMissingRelationError } from "@/lib/supabase-errors";

const ASSIGNMENT_FIELDS =
  "id, user_id, role, scope_id, granted_by, created_at";

const asText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// Rollen, die aus der Config verschwunden sind, fallen still heraus — sie
// gewähren nichts mehr.
export const mapAssignmentRow = (
  row: Record<string, unknown>,
): RoleAssignment | null => {
  const userId = asText(row.user_id);
  if (!userId || !isRoleName(row.role)) {
    return null;
  }

  return {
    id: asText(row.id),
    userId,
    role: row.role,
    scopeId: asText(row.scope_id),
    grantedBy: asText(row.granted_by),
    createdAt: asText(row.created_at),
  };
};

const mapAssignmentRows = (rows: unknown[] | null) =>
  (rows ?? [])
    .map((row) => mapAssignmentRow(row as Record<string, unknown>))
    .filter((row): row is RoleAssignment => Boolean(row));

const mapScopeRow = (row: Record<string, unknown>): Scope | null => {
  const id = asText(row.id);
  const name = asText(row.name);
  const type = asText(row.type);
  if (!id || !name || !SCOPE_TYPES.includes(type as ScopeType)) {
    return null;
  }

  return {
    id,
    name,
    type: type as ScopeType,
    campaiCostCenter: asText(row.campai_cost_center),
  };
};

export const listScopes = async (client: SupabaseClient): Promise<Scope[]> => {
  const { data, error } = await client
    .from("scopes")
    .select("id, name, type, campai_cost_center");

  if (error) {
    if (isMissingRelationError(error, "scopes")) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map((row) => mapScopeRow(row as Record<string, unknown>))
    .filter((row): row is Scope => Boolean(row));
};

/** Ohne Filter: alle Zuweisungen. Mit RLS liefert ein Nutzer-Client nur die eigenen. */
export const listAssignments = async (
  client: SupabaseClient,
  filter: { userId?: string; scopeId?: string | null } = {},
): Promise<RoleAssignment[]> => {
  let query = client.from("role_assignments").select(ASSIGNMENT_FIELDS);
  if (filter.userId) {
    query = query.eq("user_id", filter.userId);
  }
  if (filter.scopeId === null) {
    query = query.is("scope_id", null);
  } else if (filter.scopeId) {
    query = query.eq("scope_id", filter.scopeId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "role_assignments")) {
      return [];
    }
    throw error;
  }

  return mapAssignmentRows(data);
};

export const getAssignmentById = async (
  client: SupabaseClient,
  id: string,
): Promise<RoleAssignment | null> => {
  const { data, error } = await client
    .from("role_assignments")
    .select(ASSIGNMENT_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapAssignmentRow(data as Record<string, unknown>) : null;
};

export const insertAssignment = async (
  client: SupabaseClient,
  params: {
    userId: string;
    role: RoleName;
    scopeId: string | null;
    grantedBy: string | null;
  },
): Promise<RoleAssignment> => {
  const { data, error } = await client
    .from("role_assignments")
    .insert({
      user_id: params.userId,
      role: params.role,
      scope_id: params.scopeId,
      granted_by: params.grantedBy,
    })
    .select(ASSIGNMENT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Diese Rolle ist in diesem Bereich bereits vergeben.");
    }
    throw error;
  }

  const mapped = mapAssignmentRow(data as Record<string, unknown>);
  if (!mapped) {
    throw new Error("Zuweisung konnte nach dem Speichern nicht gelesen werden.");
  }
  return mapped;
};

/** Der Trigger prevent_removing_last_global_admin hat abgelehnt. */
export class LastGlobalAdminError extends Error {}

export const deleteAssignment = async (client: SupabaseClient, id: string) => {
  const { error } = await client.from("role_assignments").delete().eq("id", id);

  if (error) {
    if (error.code === "P0001") {
      throw new LastGlobalAdminError(error.message);
    }
    throw error;
  }
};
