import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  fetchPrintJobsAndUsageFromCloud,
  fetchPrintJobsFromCloud,
} from "@/lib/bambu-cloud";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const includeUsage = url.searchParams.get("includeUsage") === "1";

  try {
    if (includeUsage) {
      return NextResponse.json(
        await fetchPrintJobsAndUsageFromCloud(Number.isNaN(limit) ? 20 : limit),
      );
    }
    const jobs = await fetchPrintJobsFromCloud(
      Number.isNaN(limit) ? 20 : limit,
    );
    return NextResponse.json({ jobs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load jobs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
