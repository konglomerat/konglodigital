import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildCampaiProfileData,
  getCampaiActiveContactById,
  splitCampaiContactName,
} from "@/lib/campai-contact-directory";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { upsertMemberProfile } from "@/lib/member-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

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

    if (!can(await loadUserAccess(supabase, authData.user), "users.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { contactId } = (await request.json()) as { contactId?: string };

    if (!contactId?.trim()) {
      return NextResponse.json(
        { error: "Kein Kontakt angegeben." },
        { status: 400 },
      );
    }

    const adminClient = createSupabaseAdminClient();
    const linkedContact = await getCampaiActiveContactById(contactId.trim());

    if (!linkedContact) {
      return NextResponse.json(
        { error: "Kontakt wurde in Campai nicht gefunden." },
        { status: 404 },
      );
    }

    // Eingeladen wird an die Adresse, die in Campai am Kontakt steht — sie
    // kommt aus dem Abruf, nicht aus dem Rumpf der Anfrage.
    const normalizedEmail = linkedContact.email;

    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "Der Kontakt hat in Campai keine Mailadresse." },
        { status: 400 },
      );
    }

    const splitName = splitCampaiContactName(linkedContact.name);
    const userMetadata = {
      first_name: splitName.firstName,
      last_name: splitName.lastName,
    };
    const memberProfile = buildCampaiProfileData(linkedContact);

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

    return NextResponse.json({ ok: true, status: "invited" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Einladung konnte nicht gesendet werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
