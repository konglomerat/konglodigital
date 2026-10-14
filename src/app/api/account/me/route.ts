import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { loadUserAccess } from "@/lib/access/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = data.user;
  // Profil und Zuweisungen hängen nicht voneinander ab — parallel abfragen
  // spart eine komplette Roundtrip-Zeit auf der Kontoseite.
  const [memberProfile, access] = await Promise.all([
    getMemberProfileByUserId(supabase, user.id),
    loadUserAccess(supabase, user),
  ]);

  // Bewusst ohne Campai-Aufruf — die Live-Daten des Kontakts holt die
  // Kontoseite nach dem ersten Paint über /api/account/campai-profile.
  const metadata = mergeUserMetadataWithMemberProfile(
    user.user_metadata ?? {},
    memberProfile,
  );

  return NextResponse.json({
    user: {
      email: user.email ?? "",
      metadata,
      roleAssignments: access?.assignments ?? [],
    },
  });
};
