import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCampaiMemberContactById } from "@/lib/campai-contacts";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Der Live-Abgleich des Campai-Namens ist teuer: getCampaiMemberContactById
// blättert seitenweise durch alle Kontakte, bis die ID passt. Deshalb steht er
// hier allein und nicht mehr in /api/account/me — die Kontoseite rendert mit
// dem in member_profiles gespeicherten Namen und zieht diesen Wert erst
// nachträglich nach, falls Campai einen neueren kennt.
export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);

  if (!memberProfile?.campaiContactId) {
    return NextResponse.json({ name: null });
  }

  try {
    const linkedContact = await getCampaiMemberContactById(
      memberProfile.campaiContactId,
    );
    return NextResponse.json({ name: linkedContact?.name?.trim() || null });
  } catch {
    return NextResponse.json({ name: null });
  }
};
