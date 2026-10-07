// Lädt die Zuweisungen eines Nutzers für Seiten und Routen. Die Prüfungen
// selbst stehen in access.ts.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  ALL_SCOPES,
  allowedScopes,
  can,
  type RoleAssignment,
  type UserAccess,
} from "@/lib/access/access";
import { listAssignments, listScopes } from "@/lib/access/assignments";
import { type Permission, SYSTEM_ADMIN_ROLE } from "@/lib/access/role-config";
import {
  type AllowedCostCenters,
  getAllowedCostCenters,
} from "@/lib/buchhaltung-werkbereiche";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type UserLike = Pick<User, "id" | "email">;

/** Kommagetrennte Mailadressen, die immer globale Admins sind — damit ein
 *  leeres oder kaputtes role_assignments niemanden aussperrt. */
export const getBootstrapAdminEmails = () =>
  (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const getBootstrapAssignment = (user: UserLike): RoleAssignment | null => {
  const email = user.email?.trim().toLowerCase();
  if (!email || !getBootstrapAdminEmails().includes(email)) {
    return null;
  }

  return {
    id: null,
    userId: user.id,
    role: SYSTEM_ADMIN_ROLE,
    scopeId: null,
    grantedBy: null,
    createdAt: null,
  };
};

/** Die Zuweisungen dieses Nutzers aus einer (auch fremden) Liste, plus Bootstrap. */
export const toUserAccess = (
  user: UserLike,
  assignments: readonly RoleAssignment[],
): UserAccess => {
  const own = assignments.filter((assignment) => assignment.userId === user.id);
  const bootstrap = getBootstrapAssignment(user);
  return { userId: user.id, assignments: bootstrap ? [...own, bootstrap] : own };
};

/** Die echten Zuweisungen irgendeines Nutzers — ohne Rechte-Vorschau. */
export const loadAccessOf = async (
  client: SupabaseClient,
  user: UserLike | null | undefined,
): Promise<UserAccess | null> =>
  user
    ? toUserAccess(user, await listAssignments(client, { userId: user.id }))
    : null;

// --- Rechte-Vorschau ------------------------------------------------------
// Ein Admin kann die App mit den Zuweisungen einer anderen Person ansehen.
// Getauscht werden nur die Rechte, nicht die Identität. Das Cookie zählt nur,
// wenn der echte Nutzer access.manage hat — damit kann es nie mehr Rechte
// geben, als er ohnehin schon hat.

export const ACCESS_PREVIEW_COOKIE = "access_preview_user";

/** Mit Vorschau: wessen Rechte gerade gelten — sonst null. */
export const readAccessPreviewUserId = async (): Promise<string | null> => {
  try {
    const value = (await cookies()).get(ACCESS_PREVIEW_COOKIE)?.value?.trim();
    return value ? value : null;
  } catch {
    // Außerhalb eines Requests (Build, Skripte) gibt es keine Cookies.
    return null;
  }
};

export const canPreviewAccess = (realAccess: UserAccess | null) =>
  can(realAccess, "access.manage");

/**
 * Die Zuweisungen des angemeldeten Nutzers. Nur für die Session aufrufen —
 * für andere Personen ist loadAccessOf() da, sonst griffe die Vorschau.
 */
export const loadUserAccess = async (
  client: SupabaseClient,
  user: UserLike | null | undefined,
): Promise<UserAccess | null> => {
  const realAccess = await loadAccessOf(client, user);
  if (!user || !canPreviewAccess(realAccess)) {
    return realAccess;
  }

  const previewUserId = await readAccessPreviewUserId();
  if (!previewUserId || previewUserId === user.id) {
    return realAccess;
  }

  const adminClient = createSupabaseAdminClient();
  const { data } = await adminClient.auth.admin.getUserById(previewUserId);
  if (!data.user) {
    return realAccess;
  }
  return loadAccessOf(adminClient, data.user);
};

/** Für API-Routen: Session, Nutzer und Zuweisungen in einem Rutsch. */
export const getRouteAccess = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  const access = await loadUserAccess(supabase, data.user);
  return { supabase, response, user: data.user, access };
};

export const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const forbiddenResponse = (
  message = "Für diese Aktion fehlt dir die Berechtigung.",
) => NextResponse.json({ error: message }, { status: 403 });

/** Die Kostenstellen 2, für die der Nutzer diese Buchhaltungs-Berechtigung hat. */
export const loadAllowedCostCenters = async (
  client: SupabaseClient,
  access: UserAccess | null,
  permission: Permission,
): Promise<AllowedCostCenters> => {
  const allowed = allowedScopes(access, permission);
  if (allowed !== ALL_SCOPES && allowed.length === 0) {
    return [];
  }
  return getAllowedCostCenters(allowed, await listScopes(client));
};

type RouteAccess = Awaited<ReturnType<typeof getRouteAccess>>;

export type BuchhaltungRouteAccess =
  | { ok: false; response: NextResponse }
  | ({ ok: true; allowedCostCenters: AllowedCostCenters } & RouteAccess & {
        user: NonNullable<RouteAccess["user"]>;
      });

/**
 * Für Buchhaltungsrouten: angemeldet, die Berechtigung global oder in
 * mindestens einem Bereich — und die Kostenstellen 2, auf die sich der
 * Request beschränken muss.
 */
export const getBuchhaltungRouteAccess = async (
  request: NextRequest,
  permission: Permission,
): Promise<BuchhaltungRouteAccess> => {
  const routeAccess = await getRouteAccess(request);
  if (!routeAccess.user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const allowedCostCenters = await loadAllowedCostCenters(
    routeAccess.supabase,
    routeAccess.access,
    permission,
  );
  if (allowedCostCenters !== ALL_SCOPES && allowedCostCenters.length === 0) {
    return { ok: false, response: forbiddenResponse() };
  }

  return {
    ...routeAccess,
    user: routeAccess.user,
    ok: true,
    allowedCostCenters,
  };
};

/** Antwort, wenn eine Kostenstelle außerhalb der eigenen Bereiche liegt. */
export const costCenterForbiddenResponse = () =>
  forbiddenResponse(
    "Diese Kostenstelle liegt außerhalb der Bereiche, für die du Buchhaltung hast.",
  );
