import type { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
// Match the existing /resources page boundary. The integration token must not
// turn the members' catalog into an anonymous API or file download service.
export async function hasInventoryViewer(request: NextRequest) {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();
  return !error && Boolean(data.user);
}
