import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { getUserRightsFromAppMetadata } from "@/lib/user-access";
import { getLegacyUserRole, getUserRoles } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = data.user;
  // Profil und Rollen hängen nicht voneinander ab — parallel abfragen spart
  // eine komplette Roundtrip-Zeit auf der Kontoseite.
  const [memberProfile, roles] = await Promise.all([
    getMemberProfileByUserId(supabase, user.id),
    getUserRoles(supabase, user),
  ]);

  // Bewusst ohne Campai-Aufruf: der Live-Namensabgleich blättert durch alle
  // Kontakte und lag damit vor jeder Antwort. Er hat jetzt eine eigene Route
  // (/api/account/campai-name), die niemand blockiert.
  const metadata = mergeUserMetadataWithMemberProfile(
    user.user_metadata ?? {},
    memberProfile,
  );

  return NextResponse.json({
    user: {
      email: user.email ?? "",
      metadata: {
        ...metadata,
        roles,
        role: getLegacyUserRole(roles),
        rights: getUserRightsFromAppMetadata(user),
      },
    },
  });
};
