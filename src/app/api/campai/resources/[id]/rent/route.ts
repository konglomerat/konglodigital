import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMemberProfileByUserId, mergeUserMetadataWithMemberProfile } from "@/lib/member-profiles";
import {
  buildCampaiRentalSnapshot,
  createCampaiBookingForResource,
  syncResourceToCampai,
  type ResourceSyncRecord,
} from "@/lib/campai-resource-rentals";

type ResourceRentRow = ResourceSyncRecord & {
  campai_sync_status?: string | null;
  campai_sync_error?: string | null;
};

const getViewerContext = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      user: null,
      memberProfile: null,
      viewer: {
        authenticated: false,
        hasConnectedCampaiAccount: false,
        displayName: null,
      },
    };
  }

  const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);
  const metadata = mergeUserMetadataWithMemberProfile(
    data.user.user_metadata ?? {},
    memberProfile,
  );
  const firstName =
    typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName =
    typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (typeof metadata.campai_name === "string" ? metadata.campai_name.trim() : "") ||
    (data.user.email ?? "").trim() ||
    null;

  return {
    user: data.user,
    memberProfile,
    viewer: {
      authenticated: true,
      hasConnectedCampaiAccount: Boolean(memberProfile?.campaiContactId),
      displayName,
    },
  };
};

const loadResource = async (id: string) => {
  const adminSupabase = createSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("resources")
    .select(
      "id, name, description, image, images, type, attachable, categories, campai_resource_id, campai_offer_id, campai_default_rate_id, campai_site_id, campai_sync_status, campai_sync_error",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to load resource.");
  }

  return {
    adminSupabase,
    resource: (data as ResourceRentRow | null) ?? null,
  };
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params;

  try {
    const [{ adminSupabase, resource }, viewerContext] = await Promise.all([
      loadResource(id),
      getViewerContext(request),
    ]);

    if (!resource) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    let snapshotResource = resource;
    if (!resource.campai_resource_id && resource.campai_sync_status === "failed") {
      const syncResult = await syncResourceToCampai(adminSupabase, resource);
      if (syncResult.status === "synced") {
        snapshotResource = {
          ...resource,
          campai_resource_id: syncResult.resourceId,
          campai_offer_id: syncResult.offerId,
          campai_default_rate_id: syncResult.rateId,
          campai_site_id: syncResult.siteId,
          campai_sync_status: "synced",
          campai_sync_error: null,
        };
      } else {
        snapshotResource = {
          ...resource,
          campai_sync_status: syncResult.status,
          campai_sync_error: syncResult.message,
        };
      }
    }

    const snapshot = await buildCampaiRentalSnapshot({
      resource: snapshotResource,
      viewer: viewerContext.viewer,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Campai rental status.",
      },
      { status: 500 },
    );
  }
};

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params;

  try {
    const viewerContext = await getViewerContext(request);
    if (!viewerContext.user || !viewerContext.memberProfile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!viewerContext.memberProfile.campaiContactId) {
      return NextResponse.json(
        { error: "Your account needs a connected Campai profile before you can rent resources." },
        { status: 400 },
      );
    }

    const { adminSupabase, resource } = await loadResource(id);
    if (!resource) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const syncResult = await syncResourceToCampai(adminSupabase, resource);
    if (syncResult.status !== "synced") {
      return NextResponse.json(
        {
          error:
            syncResult.status === "failed"
              ? syncResult.message
              : "This resource cannot be rented through Campai.",
        },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const start = typeof body.start === "string" ? body.start : "";
    const end = typeof body.end === "string" ? body.end : "";
    const booking = await createCampaiBookingForResource(
      {
        ...resource,
        campai_resource_id: syncResult.resourceId,
        campai_offer_id: syncResult.offerId,
        campai_default_rate_id: syncResult.rateId,
        campai_site_id: syncResult.siteId,
      },
      {
        userEmail: viewerContext.user.email ?? "",
        userName: viewerContext.viewer.displayName ?? "",
        memberProfile: viewerContext.memberProfile,
        resourceId: id,
        start,
        end,
      },
    );

    return NextResponse.json({
      success: true,
      bookingId: booking._id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create booking.",
      },
      { status: 500 },
    );
  }
};
