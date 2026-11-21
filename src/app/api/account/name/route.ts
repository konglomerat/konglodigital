import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Der Name eines Kontos ohne Campai-Verknüpfung. Er steht nur in den
// Nutzer-Metadaten — mit Verknüpfung gilt der Name aus Campai, und geändert
// wird er über /api/account/campai-profile.

const toName = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 40) : "";

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberProfile = await getMemberProfileByUserId(
    supabase,
    data.user.id,
  ).catch(() => null);

  if (memberProfile?.campaiContactId) {
    return NextResponse.json(
      {
        error:
          "Dein Konto ist mit Campai verknüpft — der Name wird dort geändert.",
      },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const firstName = toName(body.firstName);
  const lastName = toName(body.lastName);

  if (!lastName) {
    return NextResponse.json(
      { error: "Der Name darf nicht leer sein." },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    data: { first_name: firstName, last_name: lastName },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ firstName, lastName });
};
