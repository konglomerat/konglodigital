import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

type ClaimResult = {
  claimed: string[];
  skipped: { jobId: string; reason: string }[];
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { jobIds?: string[] };
  const jobIds = (body.jobIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (jobIds.length === 0) {
    return NextResponse.json(
      { error: "No job ids provided." },
      { status: 400 },
    );
  }

  const { data: rows, error } = await supabase
    .from("print_job_descriptions")
    .select("job_id,owner_id,description")
    .in("job_id", jobIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existingMap = new Map((rows ?? []).map((row) => [row.job_id, row]));

  const toUpsert: Array<{
    job_id: string;
    owner_id: string;
    description?: string;
  }> = [];
  const result: ClaimResult = { claimed: [], skipped: [] };

  for (const jobId of jobIds) {
    const existing = existingMap.get(jobId);
    if (!existing) {
      toUpsert.push({ job_id: jobId, owner_id: data.user.id, description: "" });
      result.claimed.push(jobId);
      continue;
    }

    if (!existing.owner_id) {
      toUpsert.push({
        job_id: jobId,
        owner_id: data.user.id,
        description: existing.description ?? "",
      });
      result.claimed.push(jobId);
      continue;
    }

    if (existing.owner_id === data.user.id) {
      result.skipped.push({ jobId, reason: "Already owned" });
    } else {
      result.skipped.push({ jobId, reason: "Owned by another user" });
    }
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("print_job_descriptions")
      .upsert(toUpsert, { onConflict: "job_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json(result);
};
