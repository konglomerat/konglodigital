import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { jobId?: string };
  const jobId = String(body.jobId ?? "").trim();

  if (!jobId) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("print_job_descriptions")
    .select("owner_id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing?.owner_id || existing.owner_id !== data.user.id) {
    return NextResponse.json(
      { error: "You can only unclaim your own prints." },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("print_job_descriptions")
    .update({
      owner_id: null,
      description: null,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};
