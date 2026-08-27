import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCampaiMemberContactById } from "@/lib/campai-contacts";
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
  let liveCampaiName: string | null = null;

  if (memberProfile?.campaiContactId) {
    try {
      const linkedContact = await getCampaiMemberContactById(
        memberProfile.campaiContactId,
      );
      liveCampaiName = linkedContact?.name?.trim() || null;
    } catch {
      liveCampaiName = null;
    }
  }

  const metadata = mergeUserMetadataWithMemberProfile(
    user.user_metadata ?? {},
    memberProfile,
  );

  return NextResponse.json({
    user: {
      email: user.email ?? "",
      metadata: {
        ...metadata,
        ...(liveCampaiName ? { campai_name: liveCampaiName } : {}),
        roles,
        role: getLegacyUserRole(roles),
        rights: getUserRightsFromAppMetadata(user),
      },
    },
  });
};
