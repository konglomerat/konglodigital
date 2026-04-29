import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchCampaiCostCenters } from "@/lib/campai-cost-centers";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const costCenters = await fetchCampaiCostCenters();

    return NextResponse.json({ costCenters });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Campai cost centers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
