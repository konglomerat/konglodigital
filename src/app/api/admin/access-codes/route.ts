import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const GET = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return createUnauthorizedResponse();
    }

    const limitParam = Number.parseInt(
      request.nextUrl.searchParams.get("limit") ?? "50",
      10,
    );
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 50;

    const adminClient = createSupabaseAdminClient();
    const { data: entries, error } = await adminClient
      .from("access_code_inbox")
      .select(
        "id, sender, recipient, subject, access_code, extracted_from, body_preview, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return NextResponse.json({ entries: entries ?? [] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Codes konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
