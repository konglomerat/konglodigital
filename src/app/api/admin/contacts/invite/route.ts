import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildCampaiProfileData,
  getCampaiActiveContactByEmail,
  splitCampaiContactName,
} from "@/app/api/campai/contacts/route";
import { upsertMemberProfile } from "@/lib/member-profiles";
import { getInitialUserRole, userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  getUserAccessByUserId,
  getUserRightsFromAppMetadata,
  syncUserAccessToAuthMetadata,
  upsertUserAccess,
} from "@/lib/user-access";

const findExistingUserByEmail = async (
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) => {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const match = users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );

    if (match) {
      return match;
    }

    if (users.length < 1000) {
      return null;
    }
  }

  return null;
};

export const POST = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userCanAccessModule(supabase, authData.user, "admin"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email } = (await request.json()) as { email?: string };

    if (!email?.trim()) {
      return NextResponse.json(
        { error: "Keine Mailadresse vorhanden." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const adminClient = createSupabaseAdminClient();
    const linkedContact = await getCampaiActiveContactByEmail(normalizedEmail);

    if (!linkedContact) {
      return NextResponse.json(
        { error: "Kontakt wurde in Campai nicht gefunden." },
        { status: 404 },
      );
    }

    const splitName = splitCampaiContactName(linkedContact.name);
    const userMetadata = {
      first_name: splitName.firstName,
      last_name: splitName.lastName,
    };
    const memberProfile = buildCampaiProfileData(linkedContact);
    const initialRole = getInitialUserRole(linkedContact.tags);

    const publicBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      request.url;
    const redirectTo = new URL("/register/complete", publicBaseUrl).toString();

    const existingUser = await findExistingUserByEmail(
      adminClient,
      normalizedEmail,
    );

    if (existingUser) {
      const { error: updateError } =
        await adminClient.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...(existingUser.user_metadata ?? {}),
            ...userMetadata,
          },
        });
      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }

      await upsertMemberProfile(adminClient, existingUser.id, memberProfile);

      const existingAccess = await getUserAccessByUserId(
        adminClient,
        existingUser.id,
      );
      const nextAccess =
        existingAccess ??
        (await upsertUserAccess(adminClient, {
          userId: existingUser.id,
          role: initialRole,
          rights: getUserRightsFromAppMetadata(existingUser),
        }));
      await syncUserAccessToAuthMetadata(
        adminClient,
        existingUser,
        nextAccess,
      );

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo },
      );
      if (resetError) {
        return NextResponse.json(
          { error: resetError.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, status: "magic_link_sent" });
    }

    const { data: inviteData, error } =
      await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: userMetadata,
        redirectTo,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const invitedUser =
      inviteData.user ??
      (await findExistingUserByEmail(adminClient, normalizedEmail));

    if (!invitedUser) {
      return NextResponse.json(
        { error: "Einladung konnte nicht gespeichert werden." },
        { status: 500 },
      );
    }

    await upsertMemberProfile(adminClient, invitedUser.id, memberProfile);
    const createdAccess = await upsertUserAccess(adminClient, {
      userId: invitedUser.id,
      role: initialRole,
      rights: getUserRightsFromAppMetadata(invitedUser),
    });
    await syncUserAccessToAuthMetadata(adminClient, invitedUser, createdAccess);

    return NextResponse.json({ ok: true, status: "invited" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Einladung konnte nicht gesendet werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
