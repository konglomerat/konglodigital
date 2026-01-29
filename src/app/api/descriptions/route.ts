import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ids = url.searchParams.get("jobIds")?.split(",").filter(Boolean) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ descriptions: {}, currentUserId: data.user.id });
  }

  const { data: rows, error } = await supabase
    .from("print_job_descriptions")
    .select("job_id,description,owner_id")
    .in("job_id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const descriptions = (rows ?? []).reduce<
    Record<string, { description: string; ownerId: string | null }>
  >((acc, row) => {
    if (row.job_id) {
      acc[row.job_id] = {
        description: row.description ?? "",
        ownerId: row.owner_id ?? null,
      };
    }
    return acc;
  }, {});

  return NextResponse.json({ descriptions, currentUserId: data.user.id });
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    jobId?: string;
    description?: string;
  };
  const jobId = String(body.jobId ?? "").trim();
  const description = String(body.description ?? "").trim();

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

  if (existing?.owner_id && existing.owner_id !== data.user.id) {
    return NextResponse.json(
      { error: "This print is already owned by another user." },
      { status: 403 },
    );
  }

  const { error } = await supabase.from("print_job_descriptions").upsert(
    {
      job_id: jobId,
      owner_id: existing?.owner_id ?? data.user.id,
      description,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "job_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};
