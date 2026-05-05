import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createSupabaseRouteClient,
  withSupabaseCookies,
} from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const sanitizeFileName = (value: string) => {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "beleg";
};

const withRouteCookies = (response: NextResponse, source: NextResponse) => {
  return withSupabaseCookies(response, source);
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const { supabase, response: routeResponse } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return withRouteCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      routeResponse,
    );
  }

  const { receiptId } = await context.params;
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${receiptId}/download`;

  const downloadUrlResponse = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!downloadUrlResponse.ok) {
    const errorBody = await downloadUrlResponse.text();
    return withRouteCookies(
      NextResponse.json(
        { error: errorBody || "Campai request failed." },
        { status: downloadUrlResponse.status },
      ),
      routeResponse,
    );
  }

  const payload = (await downloadUrlResponse.json()) as {
    url?: string;
    fileName?: string;
  };

  if (!payload.url) {
    return withRouteCookies(
      NextResponse.json({ error: "Download URL missing." }, { status: 502 }),
      routeResponse,
    );
  }

  const fileResponse = await fetch(payload.url, {
    method: "GET",
    cache: "no-store",
  });

  if (!fileResponse.ok) {
    const errorBody = await fileResponse.text();
    return withRouteCookies(
      NextResponse.json(
        { error: errorBody || "Receipt file could not be loaded." },
        { status: 502 },
      ),
      routeResponse,
    );
  }

  const contentType =
    fileResponse.headers.get("content-type") || "application/pdf";
  const fileNameBase = sanitizeFileName(payload.fileName || `beleg-${receiptId}`);

  const downloadResponse = new NextResponse(await fileResponse.arrayBuffer(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileNameBase}.pdf"`,
      "Content-Type": contentType,
    },
  });

  return withRouteCookies(downloadResponse, routeResponse);
};