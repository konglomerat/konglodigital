// Rechte-Vorschau für Admins: setzt oder löscht das Cookie, mit dem
// loadUserAccess() die Zuweisungen einer anderen Person verwendet. Geprüft
// wird hier immer gegen die echten Rechte, sonst käme man aus einer Vorschau
// ohne access.manage nicht mehr heraus.
import { NextResponse, type NextRequest } from "next/server";

import { type AccessPerson, listPeople } from "@/lib/access/people";
import {
  ACCESS_PREVIEW_COOKIE,
  canPreviewAccess,
  forbiddenResponse,
  loadAccessOf,
  readAccessPreviewUserId,
  unauthorizedResponse,
} from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createSupabaseRouteClient,
  withSupabaseCookies,
} from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

// Eine Vorschau soll nicht über Tage hängen bleiben.
const PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 8;

export type AccessPreviewResponse = {
  people: AccessPerson[];
  previewUserId: string | null;
};

const getRealAdmin = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { user: null, response, error: unauthorizedResponse() };
  }
  if (!canPreviewAccess(await loadAccessOf(supabase, data.user))) {
    return { user: null, response, error: forbiddenResponse() };
  }
  return { user: data.user, response, error: null };
};

export const GET = async (request: NextRequest) => {
  const admin = await getRealAdmin(request);
  if (!admin.user) return admin.error;

  try {
    const people = await listPeople(createSupabaseAdminClient());
    return withSupabaseCookies(
      NextResponse.json({
        people: people.filter((person) => person.id !== admin.user.id),
        previewUserId: await readAccessPreviewUserId(),
      } satisfies AccessPreviewResponse),
      admin.response,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Personen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  const admin = await getRealAdmin(request);
  if (!admin.user) return admin.error;

  const body = (await request.json().catch(() => ({}))) as {
    userId?: unknown;
  };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!userId || userId === admin.user.id) {
    const response = NextResponse.json({ previewUserId: null });
    response.cookies.delete(ACCESS_PREVIEW_COOKIE);
    return withSupabaseCookies(response, admin.response);
  }

  const { data } =
    await createSupabaseAdminClient().auth.admin.getUserById(userId);
  if (!data.user) {
    return NextResponse.json(
      { error: "Person wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ previewUserId: userId });
  response.cookies.set(ACCESS_PREVIEW_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_MAX_AGE_SECONDS,
  });
  return withSupabaseCookies(response, admin.response);
};
