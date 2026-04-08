import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { normalizeResourceMapFeatures } from "@/app/[lang]/resources/map-features";
import { hasRight } from "@/lib/permissions";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type ResourceRow = {
  id: string;
  owner_id: string | null;
  map_features: unknown;
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const params = await context.params;
  if (!params.id) {
    return NextResponse.json(
      { error: "Missing resource id." },
      { status: 400 },
    );
  }

  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("resources")
    .select("id, map_features")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Unable to load map features." },
      { status: 500 },
    );
  }

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    resourceId: row.id,
    mapFeatures: normalizeResourceMapFeatures(
      (row as ResourceRow).map_features ?? null,
    ),
  });
};

export const PUT = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const params = await context.params;
  if (!params.id) {
    return NextResponse.json(
      { error: "Missing resource id." },
      { status: 400 },
    );
  }

  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existingResource, error: existingResourceError } =
    await supabase
      .from("resources")
      .select("id, owner_id")
      .eq("id", params.id)
      .maybeSingle();

  if (existingResourceError) {
    return NextResponse.json(
      { error: existingResourceError.message || "Unable to load resource." },
      { status: 500 },
    );
  }

  if (!existingResource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canEditByRight = hasRight(data.user, "resources:edit");
  if (!canEditByRight && existingResource.owner_id !== data.user.id) {
    return NextResponse.json(
      { error: "Insufficient permissions." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as { mapFeatures?: unknown };
  const mapFeatures = normalizeResourceMapFeatures(payload.mapFeatures ?? []);

  const { data: updated, error: updateError } = await supabase
    .from("resources")
    .update({
      map_features: mapFeatures.length > 0 ? mapFeatures : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("id, map_features")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || "Unable to update map features." },
      { status: 500 },
    );
  }

  revalidateTag("resources", { expire: 0 });

  return NextResponse.json({
    resourceId: updated.id,
    mapFeatures: normalizeResourceMapFeatures(updated.map_features ?? []),
  });
};
