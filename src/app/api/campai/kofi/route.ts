import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { loadCampaiKoFi } from "@/lib/campai-kofi";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const parsePositiveInt = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canAccess = await userCanAccessModule(supabase, data.user, "invoices");
  if (!canAccess) {
    return NextResponse.json(
      { error: "KoFi ist nur für Admin und Accounting verfügbar." },
      { status: 403 },
    );
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
    const year =
      parsePositiveInt(request.nextUrl.searchParams.get("year")) ??
      new Date().getFullYear();
    const costCenter = parsePositiveInt(
      request.nextUrl.searchParams.get("costCenter"),
    );
    const account = parsePositiveInt(
      request.nextUrl.searchParams.get("account"),
    );
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

    const report = await loadCampaiKoFi({
      apiKey,
      organizationId,
      mandateId,
      year,
      costCenter,
      account,
      search,
    });

    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "KoFi-Daten konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
