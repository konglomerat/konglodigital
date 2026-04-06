import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { describeInventoryImages } from "@/lib/openai-vision";

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  let imageFiles: File[] = [];
  let imageUrls: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const images = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File)
      .slice(0, 3);
    if (images.length === 0) {
      const imageFile = formData.get("image") as File | null;
      if (imageFile) {
        images.push(imageFile);
      }
    }
    if (images.length === 0) {
      return NextResponse.json(
        { error: "Image is required." },
        { status: 400 },
      );
    }
    imageFiles = images;
  } else if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      imageUrls?: string[] | null;
      imageUrl?: string | null;
    };
    const urls = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : body.imageUrl
        ? [body.imageUrl]
        : [];
    const filtered = urls
      .filter((url) => typeof url === "string" && url.trim())
      .slice(0, 3);
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "Image URL is required." },
        { status: 400 },
      );
    }
    imageUrls = filtered;
  } else {
    return NextResponse.json(
      { error: "Expected multipart form data or JSON payload." },
      { status: 400 },
    );
  }

  try {
    const result = await describeInventoryImages({
      files: imageFiles,
      imageUrls,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "OpenAI vision response was empty." ||
      message === "OpenAI vision response was invalid."
        ? 502
        : 500;
    return NextResponse.json(
      { error: message || "OpenAI vision failed." },
      { status },
    );
  }
};
