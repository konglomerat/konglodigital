import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { extractProducts, normalizeProduct } from "@/lib/campai-products";

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
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint =
    process.env.CAMPAI_PRODUCTS_ENDPOINT ??
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/products/list`;

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
      searchTerm: "",
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
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const { id } = await context.params;
  const found = products.find((product) => product.id === id);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ product: found });
};
