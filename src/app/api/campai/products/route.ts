import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  extractProducts,
  normalizeProduct,
  type ProductPayload,
} from "@/lib/campai-products";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const GET = async (request: NextRequest) => {
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
    process.env.CAMPAI_PRODUCTS_ENDPOINT ?? `${baseUrl}/finance/products/list`;

  const searchParams = request.nextUrl.searchParams;
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const searchTerm = searchParams.get("searchTerm") ?? "";
  const debug = searchParams.get("debug") === "1";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      sort: {},
      limit: Number.isNaN(limit) ? 50 : limit,
      offset: Number.isNaN(offset) ? 0 : offset,
      returnCount: false,
      searchTerm,
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
  const products = extractProducts(dataResponse)
    .map((item) => normalizeProduct(item))
    .filter((item): item is ProductPayload => Boolean(item));

  if (debug) {
    return NextResponse.json({
      products,
      debug: {
        endpoint,
        limit: Number.isNaN(limit) ? 50 : limit,
        offset: Number.isNaN(offset) ? 0 : offset,
        searchTerm,
        raw: dataResponse,
        parsedCount: products.length,
      },
    });
  }

  return NextResponse.json({ products });
};
