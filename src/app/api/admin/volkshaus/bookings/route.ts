import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/lib/access/access";
import { listAssignments } from "@/lib/access/assignments";
import { VOLKSHAUS_SCOPE_ID } from "@/lib/access/scopes";
import { loadUserAccess, toUserAccess } from "@/lib/access/server";
import { listMemberProfilesByUserIds } from "@/lib/member-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { listVolkshausBookings } from "@/lib/volkshaus-booking-store";

const resolvePublicOrigin = (request: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
};

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !can(
      await loadUserAccess(supabase, data.user),
      "volkshaus.bookings.manage",
      { scope: VOLKSHAUS_SCOPE_ID },
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const origin = resolvePublicOrigin(request);
    const bookings = (await listVolkshausBookings()).map((booking) => ({
      ...booking,
      accessUrl: `${origin}/volkshaus/anfrage/${booking.accessToken}`,
    }));
    const adminClient = createSupabaseAdminClient();
    const { data: usersPage, error: usersError } =
      await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const activeUsers = (usersPage.users ?? []).filter((user) =>
      Boolean(user.email_confirmed_at || user.last_sign_in_at),
    );
    const userIds = activeUsers.map((user) => user.id);
    const [memberProfiles, assignments] = await Promise.all([
      listMemberProfilesByUserIds(adminClient, userIds),
      listAssignments(adminClient),
    ]);
    // Zuweisbar ist, wer die Raumbuchung selbst bearbeiten darf.
    const canManageBookings = (user: (typeof activeUsers)[number]) =>
      can(toUserAccess(user, assignments), "volkshaus.bookings.manage", {
        scope: VOLKSHAUS_SCOPE_ID,
      });
    const assignees = activeUsers.filter(canManageBookings).map((user) => {
      const memberProfile = memberProfiles.get(user.id);
      return {
        id: user.id,
        email: user.email ?? "",
        firstName:
          typeof user.user_metadata?.first_name === "string"
            ? user.user_metadata.first_name
            : null,
        lastName:
          typeof user.user_metadata?.last_name === "string"
            ? user.user_metadata.last_name
            : null,
        campaiName: memberProfile?.campaiName ?? null,
      };
    });
    return NextResponse.json({ bookings, assignees });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Buchungsanfragen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
};
