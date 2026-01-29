import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchPrintersFromCloud } from "@/lib/bambu-cloud";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const printers = await fetchPrintersFromCloud();
    return NextResponse.json({ printers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load printers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
