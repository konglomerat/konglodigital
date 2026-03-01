import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
    const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;

    const body = (await request.json()) as {
      year: number;
      costCenters?: number[];
    };

    const payload: Record<string, unknown> = {
      range: { year: body.year },
      limit: 10000,
      offset: 0,
      returnCount: true,
      groupMode: { groupBy: "accountType" },
    };

    if (body.costCenters && body.costCenters.length > 0) {
      payload.costCenters = body.costCenters;
    } else {
      payload.includeAllCostCenters = true;
    }

    const response = await fetch(
      `${baseUrl}/finance/accounting/balances/list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Campai API error: ${response.status} ${text}` },
        { status: response.status },
      );
    }

    const data2 = await response.json();
    return NextResponse.json(data2);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load balances.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
