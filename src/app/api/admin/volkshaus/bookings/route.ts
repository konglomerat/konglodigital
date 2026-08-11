import { NextResponse, type NextRequest } from "next/server";

import { listMemberProfilesByUserIds } from "@/lib/member-profiles";
import { normalizeUserRoles, userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { listUserAccessByUserIds } from "@/lib/user-access";
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
  if (!(await userCanAccessModule(supabase, data.user, "volkshaus"))) {
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
    const [memberProfiles, accessByUserId] = await Promise.all([
      listMemberProfilesByUserIds(adminClient, userIds),
      listUserAccessByUserIds(adminClient, userIds),
    ]);
    const assignees = activeUsers
      .map((user) => {
        const memberProfile = memberProfiles.get(user.id);
        const roles =
          accessByUserId.get(user.id)?.roles ??
          normalizeUserRoles(
            user.app_metadata?.roles ?? user.app_metadata?.role,
          );
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
          roles,
        };
      })
      .filter(
        (user) => user.roles.includes("admin") || user.roles.includes("vhc"),
      );
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
