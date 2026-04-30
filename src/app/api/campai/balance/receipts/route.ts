import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listCampaiReceiptsByCostCenter2 } from "@/lib/campai-balance-receipts";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const parseCostCenterValues = (input: unknown): number[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return Math.trunc(entry);
      }
      if (typeof entry === "string") {
        const digits = entry.replace(/\D+/g, "");
        if (digits.length === 0) {
          return null;
        }
        const parsed = Number.parseInt(digits, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((value): value is number => value !== null && value > 0);
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const costCenter2 = parseCostCenterValues(body.costCenter2);

    if (costCenter2.length === 0) {
      return NextResponse.json({ receipts: [] });
    }

    const receipts = await listCampaiReceiptsByCostCenter2(costCenter2);
    return NextResponse.json({ receipts });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
