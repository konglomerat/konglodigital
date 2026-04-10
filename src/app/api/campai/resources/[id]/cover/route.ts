import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { toFile } from "openai/uploads";
import sharp from "sharp";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getResourceEditPermissionError, hasRight } from "@/lib/permissions";
import { createOpenAIClient } from "@/lib/openai";
import type { ResourcePayload } from "@/lib/campai-resources";
import {
  getPointFeatures,
  normalizeResourceMapFeatures,
} from "@/app/[lang]/resources/map-features";

type StoredCategory = {
  name?: string;
  bookingCategoryId?: string | null;
};

type ResourceRow = {
  id: string;
  pretty_title?: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images?: string[] | null;
  gps_altitude?: number | null;
  type: string | null;
  attachable: boolean | null;
  tags: string[] | null;
  categories: StoredCategory[] | null;
  map_features?: unknown;
};

const toResourcePayload = (row: ResourceRow): ResourcePayload => ({
  ...(() => {
    const mapFeatures = normalizeResourceMapFeatures(row.map_features ?? null);
    const pointFeature = getPointFeatures(mapFeatures).find(
      (feature) => feature.id === "gps-point",
    );
    return {
      mapFeatures,
      gpsLatitude: pointFeature?.point[1] ?? null,
      gpsLongitude: pointFeature?.point[0] ?? null,
    };
  })(),
  id: row.id,
  prettyTitle: row.pretty_title ?? null,
  name: row.name,
  description: row.description ?? undefined,
  image: row.image ?? null,
  images: row.images ?? (row.image ? [row.image] : undefined),
  gpsAltitude: row.gps_altitude ?? null,
  type: row.type ?? undefined,
  attachable: row.attachable ?? undefined,
  tags: row.tags ?? undefined,
  categories: Array.isArray(row.categories)
    ? row.categories.map((category) => ({
        name: category.name,
        bookingCategoryId: category.bookingCategoryId ?? undefined,
      }))
    : undefined,
});

const COVER_PROMPT = `Isolate the device on the photo in front of a pure white background. 
  Professional high-end studio lighting, similar to Apple product photography.
  Soft, diffused light with subtle natural shadows. 
  Device should be centered. 
  Square aspect ratio. Ultra-clean, keep details, sharp focus, high resolution, no additional objects. It should fit the frame. Not too much white space.`;

const MAX_OPENAI_INPUT_DIMENSION = 1024;

const resizeForOpenAI = async (buffer: Buffer) => {
  try {
    const pipeline = sharp(buffer, { failOnError: false })
      .rotate()
      .resize({
        width: MAX_OPENAI_INPUT_DIMENSION,
        height: MAX_OPENAI_INPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
        //fit: "contain",
        //background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 80, mozjpeg: true });

    const resized = await pipeline.toBuffer();
    return {
      buffer: resized,
      contentType: "image/jpeg",
      filename: "resource-resized.jpg",
    };
  } catch {
    return {
      buffer,
      contentType: "application/octet-stream",
      filename: "resource",
    };
  }
};

const parseCoverRequest = async (request: NextRequest) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      promptOverride: null as string | null,
      sourceIndex: null as number | null,
    };
  }
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      sourceIndex?: unknown;
    };

    const promptOverride =
      typeof body?.prompt === "string" ? body.prompt.trim() : null;

    const sourceIndexRaw = body?.sourceIndex;
    const sourceIndex =
      typeof sourceIndexRaw === "number" && Number.isInteger(sourceIndexRaw)
        ? sourceIndexRaw
        : typeof sourceIndexRaw === "string" && sourceIndexRaw.trim()
          ? Number.parseInt(sourceIndexRaw, 10)
          : null;

    return {
      promptOverride: promptOverride ? promptOverride : "",
      sourceIndex: Number.isInteger(sourceIndex) ? sourceIndex : null,
    };
  } catch {
    return {
      promptOverride: null as string | null,
      sourceIndex: null as number | null,
    };
  }
};

export const runtime = "nodejs";

export const POST = async (
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
  const adminSupabase = createSupabaseAdminClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { promptOverride, sourceIndex } = await parseCoverRequest(request);
  if (promptOverride !== null && promptOverride.length > 5000) {
    return NextResponse.json(
      { error: "Prompt is too long (max 5000 characters)." },
      { status: 400 },
    );
  }
  if (sourceIndex !== null && sourceIndex < 0) {
    return NextResponse.json(
      { error: "sourceIndex must be a non-negative integer." },
      { status: 400 },
    );
  }
  const prompt =
    promptOverride === null || promptOverride.length === 0
      ? COVER_PROMPT
      : promptOverride;

  const canEditByRight = hasRight(data.user, "resources:edit");
  if (!canEditByRight) {
    const { data: existing, error: existingError } = await supabase
      .from("resources")
      .select("owner_id")
      .eq("id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message || "Unable to load resource." },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const editPermissionError = getResourceEditPermissionError({
      hasEditRight: canEditByRight,
      isOwner: existing.owner_id === data.user.id,
    });
    if (editPermissionError) {
      return NextResponse.json(
        { error: editPermissionError },
        { status: 403 },
      );
    }
  }

  const { data: row, error: fetchError } = await supabase
    .from("resources")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message || "Unable to load resource." },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingUrls = Array.isArray((row as ResourceRow).images)
    ? ((row as ResourceRow).images ?? []).filter(
        (url): url is string =>
          typeof url === "string" && url.trim().length > 0,
      )
    : typeof (row as ResourceRow).image === "string" &&
        (row as ResourceRow).image
      ? [(row as ResourceRow).image as string]
      : [];

  const indexToUse = sourceIndex ?? 0;
  const sourceUrl = existingUrls[indexToUse];
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "Selected source image was not found." },
      { status: 400 },
    );
  }

  let inputBuffer: Buffer;
  let inputType = "image/jpeg";
  try {
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to download image (HTTP ${response.status}).`);
    }
    inputType = response.headers.get("content-type") || inputType;
    const arrayBuffer = await response.arrayBuffer();
    inputBuffer = Buffer.from(arrayBuffer);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to download resource image.",
      },
      { status: 502 },
    );
  }

  const resized = await resizeForOpenAI(inputBuffer);
  const resizedBuffer = resized.buffer;
  const resizedType = resized.contentType || inputType;
  const resizedName = resized.filename || "resource.jpg";

  const imageEditProvider = (process.env.IMAGE_EDIT_PROVIDER ?? "google")
    .trim()
    .toLowerCase();

  const isGoogleProvider = imageEditProvider === "google";
  const providerApiKey = isGoogleProvider
    ? (process.env.GOOGLE_AI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      process.env.OPENAI_API_KEY)
    : process.env.OPENAI_API_KEY;
  const providerBaseURL =
    process.env.OPENAI_BASE_URL ?? process.env.IMAGE_EDIT_BASE_URL;

  if (!providerApiKey) {
    return NextResponse.json(
      { error: "Missing image edit API key." },
      { status: 500 },
    );
  }

  const googleImageEditModel =
    process.env.GOOGLE_GEMINI_IMAGE_MODEL ??
    process.env.GOOGLE_IMAGE_EDIT_MODEL ??
    "gemini-2.5-flash-image";
  //"gemini-3-pro-image-preview";
  const openaiImageEditModel =
    process.env.IMAGE_EDIT_MODEL ??
    process.env.OPENAI_IMAGE_EDIT_MODEL ??
    process.env.OPENAI_IMAGE_MODEL ??
    "gpt-image-1";

  let outputB64: string | undefined;
  try {
    if (isGoogleProvider) {
      const genAI = new GoogleGenAI({ apiKey: providerApiKey });
      const result = await genAI.models.generateContent({
        model: googleImageEditModel,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
        contents: [
          {
            inlineData: {
              data: resizedBuffer.toString("base64"),
              mimeType: resizedType,
            },
          },
          {
            text: `${prompt}\n\nOutput requirements: return exactly one square image in 1:1 aspect ratio (1024x1024).`,
          },
        ],
      });

      const parts = result.candidates?.[0]?.content?.parts ?? [];
      const imagePart = (parts as unknown[]).find((part) => {
        if (typeof part !== "object" || part === null) {
          return false;
        }
        const inlineData = (part as { inlineData?: { data?: unknown } })
          .inlineData;
        return typeof inlineData?.data === "string";
      }) as { inlineData?: { data?: string } } | undefined;

      outputB64 = imagePart?.inlineData?.data;
    } else {
      const openai = createOpenAIClient({
        apiKey: providerApiKey,
        baseURL: providerBaseURL?.trim() || undefined,
      });
      const inputFile = await toFile(resizedBuffer, resizedName, {
        type: resizedType,
      });

      const result = await openai.images.edit({
        model: openaiImageEditModel,
        image: inputFile,
        prompt,
        size: "1024x1024",
        background: "opaque",
        quality: "high",
      });

      outputB64 = result.data?.[0]?.b64_json;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Image edit failed.",
      },
      { status: 502 },
    );
  }

  if (!outputB64) {
    return NextResponse.json(
      { error: "Image edit did not return an image." },
      { status: 502 },
    );
  }

  const outputBuffer = Buffer.from(outputB64, "base64");

  let outputJpegBuffer: Buffer;
  try {
    outputJpegBuffer = await sharp(outputBuffer, { failOnError: false })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: "Unable to encode generated image as JPEG." },
      { status: 502 },
    );
  }

  const storageBucket = process.env.SUPABASE_RESOURCES_BUCKET ?? "resources";
  const path = `resources/${params.id}/cover-${crypto.randomUUID()}.jpg`;

  try {
    const { data: stored, error: uploadError } = await adminSupabase.storage
      .from(storageBucket)
      .upload(path, outputJpegBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError || !stored?.path) {
      throw new Error(uploadError?.message || "Supabase image upload failed.");
    }

    const publicUrl = supabase.storage.from(storageBucket).getPublicUrl(path)
      .data.publicUrl;

    const nextUrls = [publicUrl, ...existingUrls];

    const { data: updated, error: updateError } = await supabase
      .from("resources")
      .update({
        image: publicUrl,
        images: nextUrls,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select("*")
      .maybeSingle();

    if (updateError || !updated) {
      throw new Error(updateError?.message || "Unable to update resource.");
    }

    const resource = toResourcePayload(updated as ResourceRow);
    revalidateTag("resources", { expire: 0 });
    return NextResponse.json({ resource });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save cover image.",
      },
      { status: 500 },
    );
  }
};
