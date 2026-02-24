import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRight } from "@/lib/permissions";

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

type UploadRequest = {
  files?: Array<{
    name?: string;
    contentType?: string;
  }>;
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRight(data.user, "resources:create")) {
    return NextResponse.json(
      { error: "Insufficient permissions." },
      { status: 403 },
    );
  }

  let payload: UploadRequest;
  try {
    payload = (await request.json()) as UploadRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const files = Array.isArray(payload.files)
    ? payload.files.filter((file) => Boolean(file?.name))
    : [];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";
  const adminSupabase = createSupabaseAdminClient();

  try {
    const uploads = await Promise.all(
      files.map(async (file) => {
        const safeName = sanitizeFileName(file.name ?? "image");
        const path = `resources/${crypto.randomUUID()}-${safeName}`;
        const { data: signed, error } = await adminSupabase.storage
          .from(storageBucket)
          .createSignedUploadUrl(path);
        if (error || !signed?.signedUrl || !signed?.token) {
          throw new Error(error?.message || "Signed upload creation failed.");
        }
        return {
          path,
          signedUrl: signed.signedUrl,
          token: signed.token,
          contentType: file.contentType ?? "application/octet-stream",
        };
      }),
    );

    return NextResponse.json({ bucket: storageBucket, uploads });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to prepare uploads.",
      },
      { status: 500 },
    );
  }
};
