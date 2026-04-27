import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRight } from "@/lib/permissions";
import { syncResourceToCampai, type ResourceSyncRecord } from "@/lib/campai-resource-rentals";

const INVENTORY_HIDDEN_RESOURCE_TYPE = "project";

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasRight(data.user, "resources:edit") && !hasRight(data.user, "resources:create")) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: resources, error: resourcesError } = await adminSupabase
    .from("resources")
    .select(
      "id, name, description, image, images, type, attachable, categories, campai_resource_id, campai_offer_id, campai_default_rate_id, campai_site_id",
    )
    .not("type", "ilike", INVENTORY_HIDDEN_RESOURCE_TYPE)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (resourcesError) {
    return NextResponse.json(
      { error: resourcesError.message || "Unable to load resources." },
      { status: 500 },
    );
  }

  const results = await Promise.all(
    (resources ?? []).map((resource) =>
      syncResourceToCampai(adminSupabase, resource as ResourceSyncRecord).then(
        (result) => ({
          resourceId: resource.id,
          name: resource.name,
          ...result,
        }),
      ),
    ),
  );

  revalidateTag("resources", { expire: 0 });

  return NextResponse.json({
    synced: results.filter((result) => result.status === "synced").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  });
};
