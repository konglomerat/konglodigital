import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeAvatarUrl = (value: unknown) => {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const avatarUrlRaw = normalizeOptionalText(body.avatarUrl);
  const avatarUrl = normalizeAvatarUrl(body.avatarUrl);
  const shortBio = normalizeOptionalText(body.shortBio);

  if (avatarUrlRaw && !avatarUrl) {
    return NextResponse.json(
      { error: "Avatar URL must be a valid http or https URL." },
      { status: 400 },
    );
  }

  try {
    const { error } = await supabase.auth.updateUser({
      data: {
        ...(data.user.user_metadata ?? {}),
        avatar_url: avatarUrl,
        short_bio: shortBio,
      },
    });

    if (error) {
      throw error;
    }
  } catch (profileError) {
    const errorMessage =
      typeof profileError === "object" &&
      profileError !== null &&
      "message" in profileError &&
      typeof profileError.message === "string"
        ? profileError.message
        : "Profile could not be updated.";

    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return NextResponse.json({ success: true });
};
