import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createSupabaseRouteClient,
  withSupabaseCookies,
} from "@/lib/supabase/route";

export const POST = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  await supabase.auth.signOut();
  return withSupabaseCookies(NextResponse.json({ ok: true }), response);
};
