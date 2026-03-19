import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  withSupabaseCookies,
  createSupabaseRouteClient,
} from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildCampaiProfileData,
  getCampaiActiveMemberContactByEmail,
  splitCampaiContactName,
} from "@/lib/campai-members";
import { upsertMemberProfile } from "@/lib/member-profiles";
import { getInitialUserRole } from "@/lib/roles";
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
  const { supabase, response } = createSupabaseRouteClient(request);
  const { email } = (await request.json()) as {
    email?: string;
  };

  if (!email?.trim()) {
    return NextResponse.json(
      {
        error: "Bitte gib eine Mailadresse ein.",
      },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const linkedContact = await getCampaiActiveMemberContactByEmail(normalizedEmail);

  if (
    !linkedContact ||
    !linkedContact.email ||
    !linkedContact.memberNumber ||
    linkedContact.debtorAccount === null
  ) {
    return withSupabaseCookies(NextResponse.json({ ok: true }), response);
  }

  const adminClient = createSupabaseAdminClient();
  const splitName = splitCampaiContactName(linkedContact.name);
  const initialRole = getInitialUserRole(linkedContact.tags);
  const userMetadata = {
    first_name: splitName.firstName,
    last_name: splitName.lastName,
  };
  const memberProfile = buildCampaiProfileData(linkedContact);
  const redirectTo = new URL("/register/complete", request.url).toString();
  const existingUser = await findExistingUserByEmail(adminClient, normalizedEmail);

  if (existingUser) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      existingUser.id,
      {
        user_metadata: {
          ...(existingUser.user_metadata ?? {}),
          ...userMetadata,
        },
      },
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await upsertMemberProfile(adminClient, existingUser.id, memberProfile);

    const existingAccess = await getUserAccessByUserId(adminClient, existingUser.id);
    const nextAccess =
      existingAccess ??
      (await upsertUserAccess(adminClient, {
        userId: existingUser.id,
        role: initialRole,
        rights: getUserRightsFromAppMetadata(existingUser),
      }));
    await syncUserAccessToAuthMetadata(adminClient, existingUser, nextAccess);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo },
    );

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    return withSupabaseCookies(NextResponse.json({ ok: true }), response);
  }

  const { data: inviteData, error } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
    {
      data: userMetadata,
      redirectTo,
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const invitedUser =
    inviteData.user ?? (await findExistingUserByEmail(adminClient, normalizedEmail));

  if (!invitedUser) {
    return NextResponse.json(
      { error: "Registrierungsprofil konnte nicht gespeichert werden." },
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

  return withSupabaseCookies(NextResponse.json({ ok: true }), response);
};
