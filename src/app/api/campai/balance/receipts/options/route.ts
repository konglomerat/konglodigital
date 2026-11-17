import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBuchhaltungRouteAccess } from "@/lib/access/server";
import { fetchCampaiCostCenter1Labels } from "@/lib/campai-cost-centers";
import { fetchCampaiTaxes } from "@/lib/campai-taxes";

// Nachschlagewerte für die Beleg-Sidebar: Steuersätze (für die Summen) und
// die Sphären (costCenter1) für die Positionen.
export const GET = async (request: NextRequest) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.view");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }

  try {
    const [taxes, costCenter1] = await Promise.all([
      fetchCampaiTaxes(),
      fetchCampaiCostCenter1Labels().catch(() => []),
    ]);
    return NextResponse.json({
      taxes: taxes.map(({ code, rate, type }) => ({ code, rate, type })),
      costCenter1,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Optionen konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
