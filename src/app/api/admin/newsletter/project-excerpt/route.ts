import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { PROJECTS_CACHE_TAG } from "@/app/[lang]/projects/project-data";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EXCERPT_LENGTH = 5_000;

export const PATCH = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: unknown;
    excerpt?: unknown;
  };
  const projectId =
    typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json(
      { error: "Ungültiges Projekt." },
      { status: 400 },
    );
  }
  if (typeof body.excerpt !== "string") {
    return NextResponse.json(
      { error: "Der Projekttext fehlt." },
      { status: 400 },
    );
  }

  const excerpt = body.excerpt.trim().slice(0, MAX_EXCERPT_LENGTH) || null;
  const adminSupabase = createSupabaseAdminClient();
  const { data: project, error } = await adminSupabase
    .from("resources")
    .update({ excerpt, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .ilike("type", "project")
    .select("id, excerpt")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Projekttext konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "Projekt wurde nicht gefunden." },
      { status: 404 },
    );
  }

  revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 });
  return NextResponse.json({
    ok: true,
    projectId: project.id,
    excerpt: project.excerpt ?? "",
  });
};
