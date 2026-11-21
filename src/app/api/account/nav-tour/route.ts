import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createSupabaseRouteClient,
  withSupabaseCookies,
} from "@/lib/supabase/route";

// Merkt, dass der Nutzer die Tour zur neuen Navigation gesehen hat (NavTour).
export const POST = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { error } = await supabase.auth.updateUser({
    data: { nav_tour_seen: true },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // updateUser frischt die Session auf — die neuen Cookies müssen mit zurück.
  return withSupabaseCookies(NextResponse.json({ success: true }), response);
};
