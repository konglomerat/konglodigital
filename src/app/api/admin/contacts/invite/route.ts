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

/** Das erste bestehende Konto zu einer der Adressen — ein Durchlauf. */
const findExistingUserByEmails = async (
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  emails: string[],
) => {
  const wanted = new Set(emails);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const match = users.find((user) => {
      const email = user.email?.trim().toLowerCase();
      return Boolean(email && wanted.has(email));
    });

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

    const { contactId, email: requestedEmail } = (await request.json()) as {
      contactId?: string;
      email?: string;
    };

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

    // Eingeladen wird an eine Adresse, die in Campai am Kontakt steht — die
    // Hauptadresse oder eine aus „Alternative Kommunikation". Der Rumpf darf
    // nur zwischen diesen wählen.
    const contactEmails = [
      linkedContact.email,
      ...linkedContact.alternativeEmails,
    ].filter(
      (address, index, list): address is string =>
        Boolean(address) && list.indexOf(address) === index,
    );

    if (contactEmails.length === 0) {
      return NextResponse.json(
        { error: "Der Kontakt hat in Campai keine Mailadresse." },
        { status: 400 },
      );
    }

    const wantedEmail = requestedEmail?.trim().toLowerCase();
    if (wantedEmail && !contactEmails.includes(wantedEmail)) {
      return NextResponse.json(
        { error: "Diese Adresse steht in Campai nicht am Kontakt." },
        { status: 400 },
      );
    }
    const normalizedEmail = wantedEmail || contactEmails[0];

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

    const existingUser = await findExistingUserByEmails(
      adminClient,
      contactEmails,
    );

    // Pro Kontakt nur ein Konto: Hängt schon eins an einer anderen Adresse,
    // geht keine zweite Einladung raus.
    const existingEmail = existingUser?.email?.trim().toLowerCase();
    if (existingUser && existingEmail !== normalizedEmail) {
      return NextResponse.json(
        {
          error: `Der Kontakt hat bereits ein Konto unter ${existingEmail}.`,
        },
        { status: 409 },
      );
    }

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
      (await findExistingUserByEmails(adminClient, [normalizedEmail]));

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
