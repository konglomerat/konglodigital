import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  getMemberProfileByUserId,
  mergeMemberProfilePreferences,
  normalizeMemberProfilePreferences,
  upsertMemberProfilePreferences,
} from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getMemberProfileByUserId(supabase, data.user.id);

  return NextResponse.json({
    preferences: profile?.preferences ?? {},
  });
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    preferences?: unknown;
  };
  const incomingPreferences = normalizeMemberProfilePreferences(
    body.preferences,
  );

  try {
    const profile = await getMemberProfileByUserId(supabase, data.user.id);
    const mergedPreferences = mergeMemberProfilePreferences(
      profile?.preferences,
      incomingPreferences,
    );

    const updatedProfile = await upsertMemberProfilePreferences(
      supabase,
      data.user.id,
      mergedPreferences,
    );

    return NextResponse.json({
      success: true,
      preferences: updatedProfile.preferences,
    });
  } catch (preferencesError) {
    const errorMessage =
      typeof preferencesError === "object" &&
      preferencesError !== null &&
      "message" in preferencesError &&
      typeof preferencesError.message === "string"
        ? preferencesError.message
        : "Preferences could not be updated.";

    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
};