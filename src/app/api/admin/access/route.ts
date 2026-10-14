// Rollen einer Person vergeben und entziehen — nur mit access.manage, und nur
// in Kombinationen, die role-config.ts erlaubt (canGrantRole). Gespeichert wird
// danach mit dem Service-Client.
import { NextResponse, type NextRequest } from "next/server";

import {
  type RoleAssignment,
  canGrantRole,
  canManageAccess,
  getAssignmentShapeError,
} from "@/lib/access/access";
import {
  LastGlobalAdminError,
  deleteAssignment,
  getAssignmentById,
  insertAssignment,
  listAssignments,
  listScopes,
} from "@/lib/access/assignments";
import { getScopeLabel } from "@/lib/access/labels";
import { listPeople } from "@/lib/access/people";
import {
  ROLE_CONFIG,
  ROLE_NAMES,
  isRoleName,
} from "@/lib/access/role-config";
import {
  GLOBAL_SCOPE_PARAM,
  findScope,
  sortScopes,
} from "@/lib/access/scopes";
import {
  forbiddenResponse,
  getRouteAccess,
  unauthorizedResponse,
} from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const parseScopeParam = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return !trimmed || trimmed === GLOBAL_SCOPE_PARAM ? null : trimmed;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export type AccessAssignmentView = RoleAssignment & {
  id: string;
  userName: string;
  userEmail: string;
  scopeLabel: string;
  grantedByName: string | null;
};

export type AccessOverviewResponse = {
  scopes: ReturnType<typeof sortScopes>;
  roles: {
    name: string;
    label: string;
    description: string;
    scoping: string;
  }[];
  assignments: AccessAssignmentView[];
  /** Kombinationen aus Rolle und Bereich, die sich vergeben lassen. */
  grantOptions: { role: string; scopeId: string | null }[];
};

export const GET = async (request: NextRequest) => {
  const { user, access } = await getRouteAccess(request);
  if (!user) return unauthorizedResponse();
  if (!canManageAccess(access)) return forbiddenResponse();

  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Person fehlt." }, { status: 400 });
  }

  try {
    const adminClient = createSupabaseAdminClient();
    const [scopes, people, assignments] = await Promise.all([
      listScopes(adminClient).then(sortScopes),
      listPeople(adminClient),
      listAssignments(adminClient, { userId }),
    ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));

    const visible = assignments
      .filter(
        (assignment): assignment is RoleAssignment & { id: string } =>
          assignment.id !== null,
      )
      .map((assignment) => {
        const person = peopleById.get(assignment.userId);
        return {
          ...assignment,
          userName: person?.name || assignment.userId,
          userEmail: person?.email ?? "",
          scopeLabel: getScopeLabel(scopes, assignment.scopeId),
          grantedByName: assignment.grantedBy
            ? (peopleById.get(assignment.grantedBy)?.name ?? null)
            : null,
        };
      });

    const grantOptions = ROLE_NAMES.flatMap((role) =>
      [null, ...scopes.map((scope) => scope.id)]
        .filter((scopeId) => canGrantRole(access, role, scopeId))
        .map((scopeId) => ({ role, scopeId })),
    );

    return NextResponse.json({
      scopes,
      roles: ROLE_NAMES.map((name) => ({
        name,
        label: ROLE_CONFIG[name].label,
        description: ROLE_CONFIG[name].description,
        scoping: ROLE_CONFIG[name].scoping,
      })),
      assignments: visible,
      grantOptions,
    } satisfies AccessOverviewResponse);
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Rollen konnten nicht geladen werden.") },
      { status: 500 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  const { user, access } = await getRouteAccess(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const scopeId = parseScopeParam(
    typeof body.scopeId === "string" ? body.scopeId : null,
  );

  if (!userId) {
    return NextResponse.json({ error: "Person fehlt." }, { status: 400 });
  }
  if (!isRoleName(body.role)) {
    return NextResponse.json({ error: "Unbekannte Rolle." }, { status: 400 });
  }
  const role = body.role;

  const shapeError = getAssignmentShapeError(role, scopeId);
  if (shapeError) {
    return NextResponse.json({ error: shapeError }, { status: 400 });
  }
  if (!canGrantRole(access, role, scopeId)) {
    return forbiddenResponse("Rollen vergeben dürfen nur Admins.");
  }

  try {
    const adminClient = createSupabaseAdminClient();
    if (scopeId !== null && !findScope(await listScopes(adminClient), scopeId)) {
      return NextResponse.json(
        { error: "Unbekannter Bereich." },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } =
      await adminClient.auth.admin.getUserById(userId);
    if (targetError || !target.user) {
      return NextResponse.json(
        { error: "Person wurde nicht gefunden." },
        { status: 404 },
      );
    }

    const assignment = await insertAssignment(adminClient, {
      userId,
      role,
      scopeId,
      grantedBy: user.id,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Rolle konnte nicht vergeben werden.") },
      { status: 400 },
    );
  }
};

export const DELETE = async (request: NextRequest) => {
  const { user, access } = await getRouteAccess(request);
  if (!user) return unauthorizedResponse();

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Zuweisung fehlt." }, { status: 400 });
  }

  try {
    const adminClient = createSupabaseAdminClient();
    const assignment = await getAssignmentById(adminClient, id);
    if (!assignment) {
      return NextResponse.json(
        { error: "Zuweisung wurde nicht gefunden." },
        { status: 404 },
      );
    }
    if (!canGrantRole(access, assignment.role, assignment.scopeId)) {
      return forbiddenResponse("Rollen entziehen dürfen nur Admins.");
    }

    await deleteAssignment(adminClient, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Rolle konnte nicht entzogen werden.") },
      { status: error instanceof LastGlobalAdminError ? 409 : 500 },
    );
  }
};
