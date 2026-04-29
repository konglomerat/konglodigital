import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCampaiMemberContactById } from "@/lib/campai-members";
import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { getUserRightsFromAppMetadata } from "@/lib/user-access";
import { getUserRole } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = data.user;
  const memberProfile = await getMemberProfileByUserId(supabase, user.id);
  const role = await getUserRole(supabase, user);
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
        role,
        rights: getUserRightsFromAppMetadata(user),
      },
    },
  });
};
