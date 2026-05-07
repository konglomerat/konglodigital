import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  addCampaiCostCenter,
  fetchCampaiCostCenters,
} from "@/lib/campai-cost-centers";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const includeNonBookable =
      request.nextUrl.searchParams.get("includeNonBookable") === "1";
    const costCenters = await fetchCampaiCostCenters({ includeNonBookable });

    return NextResponse.json({ costCenters });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Campai cost centers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    number?: unknown;
    label?: unknown;
    bookable?: unknown;
  };

  const parsedNumber =
    typeof body.number === "number"
      ? body.number
      : typeof body.number === "string"
        ? Number.parseInt(body.number.trim(), 10)
        : Number.NaN;
  const label = typeof body.label === "string" ? body.label : "";

  if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
    return NextResponse.json(
      { error: "Werkbereich-Nummer muss eine positive Zahl sein." },
      { status: 400 },
    );
  }

  if (!label.trim()) {
    return NextResponse.json(
      { error: "Werkbereich-Name ist erforderlich." },
      { status: 400 },
    );
  }

  try {
    const result = await addCampaiCostCenter({
      number: parsedNumber,
      label,
      bookable: body.bookable !== false,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create Campai cost center.";
    const status = message.includes("existiert bereits") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
};
