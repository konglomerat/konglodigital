import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { memberProfileToMetadata, getMemberProfileByUserId } from "@/lib/member-profiles";
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

  return NextResponse.json({
    user: {
      email: user.email ?? "",
      metadata: {
        ...(user.user_metadata ?? {}),
        ...memberProfileToMetadata(memberProfile),
        role,
        rights: getUserRightsFromAppMetadata(user),
      },
    },
  });
};
