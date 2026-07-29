import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listAllActiveCampaiContacts } from "@/lib/campai-contacts";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type ContactInviteStatus = "pending" | "invited" | "active";

type AuthSummary = {
  status: ContactInviteStatus;
  invitedAt: string | null;
  userId: string | null;
};

const buildAuthSummariesByEmail = async (): Promise<Map<string, AuthSummary>> => {
  const adminClient = createSupabaseAdminClient();
  const summaries = new Map<string, AuthSummary>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw error;
    }
    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        continue;
      }
      const isActive = Boolean(
        user.email_confirmed_at || user.last_sign_in_at,
      );
      const invitedAtCandidate =
        (user as { invited_at?: string | null }).invited_at ??
        user.created_at ??
        null;
      summaries.set(email, {
        status: isActive ? "active" : "invited",
        invitedAt: invitedAtCandidate,
        userId: user.id,
      });
    }
    if (users.length < 1000) {
      break;
    }
  }
  return summaries;
};

export const GET = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [contacts, authSummariesByEmail] = await Promise.all([
      listAllActiveCampaiContacts(),
      buildAuthSummariesByEmail(),
    ]);

    const rows = contacts
      .map((contact) => {
        const authSummary = contact.email
          ? authSummariesByEmail.get(contact.email.trim().toLowerCase())
          : undefined;
        return {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          memberNumber: contact.memberNumber,
          balance: contact.balance,
          tags: contact.tags,
          types: contact.types,
          entryAt: contact.entryAt,
          inviteStatus: (authSummary?.status ?? "pending") as ContactInviteStatus,
          invitedAt: authSummary?.invitedAt ?? null,
          userId: authSummary?.userId ?? null,
        };
      })
      .sort((left, right) => {
        const leftTime = left.entryAt ? Date.parse(left.entryAt) : NaN;
        const rightTime = right.entryAt ? Date.parse(right.entryAt) : NaN;
        const leftValid = Number.isFinite(leftTime);
        const rightValid = Number.isFinite(rightTime);
        if (leftValid && rightValid) {
          return rightTime - leftTime;
        }
        if (leftValid) return -1;
        if (rightValid) return 1;
        return left.name.localeCompare(right.name, "de-DE");
      });

    return NextResponse.json({ contacts: rows });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Campai-Kontakte konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
