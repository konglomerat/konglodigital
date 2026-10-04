import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchCampaiCashRegisterBalances } from "@/lib/campai-cash-register-balances";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : Number.NaN;
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 3000
      ? parsedYear
      : undefined;

  try {
    const summary = await fetchCampaiCashRegisterBalances({ year });
    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Campai cash register balances.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
