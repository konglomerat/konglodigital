import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRight } from "@/lib/permissions";

type ResolveMode = "pick" | "merge";

type ResolvePayload = {
  mode?: ResolveMode;
  keepResourceId?: string;
  removeResourceId?: string;
};

type ResourceRow = {
  id: string;
  owner_id: string | null;
  name: string;
  image: string | null;
  images: string[] | null;
};

const collectImageUrls = (resource: Pick<ResourceRow, "image" | "images">) => {
  const all = [resource.image, ...(Array.isArray(resource.images) ? resource.images : [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return Array.from(new Set(all));
};

const extractStoragePath = (url: string, bucket: string) => {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return parsed.pathname.slice(index + marker.length);
  } catch {
    return null;
  }
};

const deleteResource = async ({
  supabase,
  adminSupabase,
  resource,
  preserveUrls,
}: {
  supabase: ReturnType<typeof createSupabaseRouteClient>["supabase"];
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>;
  resource: ResourceRow;
  preserveUrls?: Set<string>;
}) => {
  const { error: deleteLinksError } = await supabase
    .from("resource_links")
    .delete()
    .or(`resource_a.eq.${resource.id},resource_b.eq.${resource.id}`);

  if (deleteLinksError) {
    throw new Error(deleteLinksError.message || "Unable to delete resource links.");
  }

  const { error: deleteError } = await supabase
    .from("resources")
    .delete()
    .eq("id", resource.id);

  if (deleteError) {
    throw new Error(deleteError.message || "Unable to delete resource.");
  }

  const urlsToDelete = collectImageUrls(resource).filter(
    (url) => !(preserveUrls?.has(url) ?? false),
  );
  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";
  const storagePaths = urlsToDelete
    .map((url) => extractStoragePath(url, storageBucket))
    .filter((path): path is string => Boolean(path));

  if (storagePaths.length > 0) {
    await adminSupabase.storage.from(storageBucket).remove(storagePaths);
  }
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const adminSupabase = createSupabaseAdminClient();

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as ResolvePayload;
  const mode = payload.mode;
  const keepResourceId = payload.keepResourceId?.trim();
  const removeResourceId = payload.removeResourceId?.trim();

  if ((mode !== "pick" && mode !== "merge") || !keepResourceId || !removeResourceId) {
    return NextResponse.json(
      { error: "Missing or invalid payload." },
      { status: 400 },
    );
  }

  if (keepResourceId === removeResourceId) {
    return NextResponse.json(
      { error: "Cannot resolve duplicate with the same resource." },
      { status: 400 },
    );
  }

  const { data: rows, error: loadError } = await supabase
    .from("resources")
    .select("id, owner_id, name, image, images")
    .in("id", [keepResourceId, removeResourceId]);

  if (loadError) {
    return NextResponse.json(
      { error: loadError.message || "Unable to load resources." },
      { status: 500 },
    );
  }

  const resources = (rows ?? []).filter(
    (row): row is ResourceRow => typeof row.id === "string",
  );

  const keepResource = resources.find((row) => row.id === keepResourceId);
  const removeResource = resources.find((row) => row.id === removeResourceId);

  if (!keepResource || !removeResource) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const canDeleteRemoveResource =
    hasRight(data.user, "resources:delete") ||
    removeResource.owner_id === data.user.id;

  if (!canDeleteRemoveResource) {
    return NextResponse.json(
      { error: "Insufficient permissions for deleting the duplicate resource." },
      { status: 403 },
    );
  }

  try {
    if (mode === "pick") {
      await deleteResource({
        supabase,
        adminSupabase,
        resource: removeResource,
      });

      revalidateTag("resources", { expire: 0 });
      return NextResponse.json({ success: true });
    }

    const canEditKeepResource =
      hasRight(data.user, "resources:edit") || keepResource.owner_id === data.user.id;

    if (!canEditKeepResource) {
      return NextResponse.json(
        { error: "Insufficient permissions for merging photos." },
        { status: 403 },
      );
    }

    const mergedUrls = Array.from(
      new Set([...collectImageUrls(keepResource), ...collectImageUrls(removeResource)]),
    );

    const { data: updatedKeepResource, error: updateError } = await supabase
      .from("resources")
      .update({
        image: mergedUrls[0] ?? null,
        images: mergedUrls,
      })
      .eq("id", keepResource.id)
      .select("id, image, images")
      .single();

    if (updateError || !updatedKeepResource) {
      return NextResponse.json(
        { error: updateError?.message || "Unable to update kept resource." },
        { status: 500 },
      );
    }

    await deleteResource({
      supabase,
      adminSupabase,
      resource: removeResource,
      preserveUrls: new Set(mergedUrls),
    });

    revalidateTag("resources", { expire: 0 });
    return NextResponse.json({
      success: true,
      keptResource: {
        id: updatedKeepResource.id,
        image:
          typeof updatedKeepResource.image === "string"
            ? updatedKeepResource.image
            : null,
        images: Array.isArray(updatedKeepResource.images)
          ? updatedKeepResource.images.filter(
              (url): url is string => typeof url === "string",
            )
          : [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message || "Unable to resolve duplicate."
            : "Unable to resolve duplicate.",
      },
      { status: 500 },
    );
  }
};
