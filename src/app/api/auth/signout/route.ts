import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const POST = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true }, { headers: response.headers });
};
