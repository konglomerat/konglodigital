import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { uploadOpeninaryMedia } from "@/lib/openinary-server";
import { isImageMimeType } from "@/lib/resource-media";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload payload." },
      { status: 400 },
    );
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const invalidFile = files.find((file) => !isImageMimeType(file.type));
  if (invalidFile) {
    return NextResponse.json(
      { error: `Unsupported image type: ${invalidFile.type || "unknown"}.` },
      { status: 400 },
    );
  }

  try {
    const uploads = await Promise.all(
      files.map(async (file) => {
        const safeName = sanitizeFileName(file.name ?? "image");
        const path = `resources/${crypto.randomUUID()}-${safeName}`;
        return uploadOpeninaryMedia({
          data: Buffer.from(await file.arrayBuffer()),
          contentType: file.type,
          path,
          transformations: [
            "w_480,q_75",
            "w_960,q_75",
            "w_1600,q_82",
          ],
        });
      }),
    );

    return NextResponse.json({ urls: uploads.map((upload) => upload.url) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to upload images.",
      },
      { status: 500 },
    );
  }
};
