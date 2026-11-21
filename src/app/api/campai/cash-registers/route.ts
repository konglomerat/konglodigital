import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ALL_SCOPES } from "@/lib/access/access";
import { getBuchhaltungRouteAccess } from "@/lib/access/server";
import {
  type AllowedCostCenters,
  isCostCenterAllowed,
} from "@/lib/buchhaltung-werkbereiche";
import {
  CASH_REGISTER_ACCOUNT_BY_COST_CENTER2,
  type CampaiCashRegisterBalanceSummary,
  fetchCampaiCashRegisterBalances,
} from "@/lib/campai-cash-register-balances";

// Mit Bereichs-Buchhaltung nur die Kassen der eigenen Bereiche; die Summe
// zählt dann auch nur diese.
const filterCashRegisters = (
  summary: CampaiCashRegisterBalanceSummary,
  allowed: AllowedCostCenters,
): CampaiCashRegisterBalanceSummary => {
  if (allowed === ALL_SCOPES) {
    return summary;
  }

  const accounts = new Set(
    Object.entries(CASH_REGISTER_ACCOUNT_BY_COST_CENTER2)
      .filter(([costCenter]) => isCostCenterAllowed(costCenter, allowed))
      .map(([, account]) => account),
  );
  const registers = summary.registers.filter((register) =>
    accounts.has(register.account),
  );

  return {
    ...summary,
    registers,
    total: registers.reduce((sum, register) => sum + register.balance, 0),
  };
};

export const GET = async (request: NextRequest) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.view");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : Number.NaN;
  const year =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 3000
      ? parsedYear
      : undefined;

  try {
    const summary = await fetchCampaiCashRegisterBalances({ year });
    return NextResponse.json(
      filterCashRegisters(summary, routeAccess.allowedCostCenters),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Campai cash register balances.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
