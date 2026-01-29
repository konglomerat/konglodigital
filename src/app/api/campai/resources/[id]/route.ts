import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  extractResources,
  normalizeResource,
  type ResourcePayload,
} from "@/lib/campai-resources";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
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

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;
  const endpoint =
    process.env.CAMPAI_RESOURCES_ENDPOINT ??
    `${baseUrl}/booking/resources/list`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      sort: {},
      limit: 100,
      offset: 0,
      returnCount: false,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: errorBody || "Campai request failed." },
      { status: response.status },
    );
  }

  const dataResponse = (await response.json()) as unknown;
  const resources = extractResources(dataResponse)
    .map((item) => normalizeResource(item))
    .filter((item): item is ResourcePayload => Boolean(item));
  const resource =
    resources.find((item) => item.id === params.id) ?? resources[0] ?? null;

  if (!resource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ resource });
};
