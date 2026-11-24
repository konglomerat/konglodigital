import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  costCenterForbiddenResponse,
  getBuchhaltungRouteAccess,
} from "@/lib/access/server";
import { isCostCenterAllowed } from "@/lib/buchhaltung-werkbereiche";
import { CASH_REGISTER_ACCOUNT_BY_COST_CENTER2 } from "@/lib/campai-cash-register-balances";
import { loadCampaiConfig } from "@/lib/campai-receipts/config";
import { compactText, toIsoDate } from "@/lib/campai-receipts/parsers";

// Kassenbuchung: Bargeld rein oder raus, direkt im Kassenbuch der Barkasse
// des Werkbereichs. Campai erkennt das Kassenkonto selbst (source
// "cashRegister") und vergibt die Belegnummer <Konto>-<n>.
//
// Konten sind bewusst fest: Einnahmen landen auf Spenden, Ausgaben auf
// Sonstige betriebliche Aufwendungen — die Kasse bucht bei Bedarf in Campai um.
// Der Betrag ist brutto; mit Steuerschlüssel teilt Campai ihn selbst auf.
const REVENUE_ACCOUNT = 40400; // Spenden (BH 2021)
const EXPENSE_ACCOUNT = 63000; // Sonstige betriebliche Aufwendungen
const COST_CENTER1 = 9; // wie die übrigen Buchungsformulare

const TAX_CODES = {
  revenue: ["US0", "US7", "US19"],
  expense: ["VS0", "VS7", "VS19"],
} as const;

type Direction = keyof typeof TAX_CODES;

const MAX_AMOUNT_CENTS = 9_999_999_999;

export const POST = async (request: NextRequest) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.edit");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const direction = body.direction;
  if (direction !== "revenue" && direction !== "expense") {
    return NextResponse.json(
      { error: "Bitte Einnahme oder Ausgabe wählen." },
      { status: 400 },
    );
  }

  const costCenter2 =
    typeof body.costCenter2 === "string" || typeof body.costCenter2 === "number"
      ? String(body.costCenter2).trim()
      : "";
  const cashAccount = CASH_REGISTER_ACCOUNT_BY_COST_CENTER2[costCenter2];
  if (cashAccount === undefined) {
    return NextResponse.json(
      { error: "Dieser Werkbereich hat keine eigene Barkasse." },
      { status: 400 },
    );
  }
  if (!isCostCenterAllowed(costCenter2, routeAccess.allowedCostCenters)) {
    return costCenterForbiddenResponse();
  }

  const amount =
    typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_CENTS) {
    return NextResponse.json(
      { error: "Bitte einen Betrag größer als 0 angeben." },
      { status: 400 },
    );
  }

  const text = compactText(body.text);
  if (!text) {
    return NextResponse.json(
      { error: "Bitte eine Beschreibung angeben." },
      { status: 400 },
    );
  }
  if (text.length > 1000) {
    return NextResponse.json(
      { error: "Die Beschreibung ist zu lang (höchstens 1000 Zeichen)." },
      { status: 400 },
    );
  }

  const allowedTaxCodes: readonly string[] = TAX_CODES[direction as Direction];
  const taxCode =
    typeof body.taxCode === "string" && allowedTaxCodes.includes(body.taxCode)
      ? body.taxCode
      : null;
  if (taxCode === null) {
    return NextResponse.json(
      { error: "Unbekannter Steuersatz." },
      { status: 400 },
    );
  }

  const receiptDate = toIsoDate(body.receiptDate);

  try {
    const config = loadCampaiConfig();
    const payload = {
      text,
      receiptDate,
      amount,
      cashAccount,
      ...(direction === "revenue"
        ? { revenueAccount: REVENUE_ACCOUNT }
        : { expenseAccount: EXPENSE_ACCOUNT }),
      taxCode,
      costCenter1: COST_CENTER1,
      costCenter2: Number.parseInt(costCenter2, 10),
    };

    // Ohne `finance/` im Pfad — anders als die übrigen Buchhaltungs-Endpunkte.
    const response = await fetch(
      `${config.baseUrl}/accounting/postings/${direction}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return NextResponse.json(
        { error: errorBody || "Campai hat die Kassenbuchung abgelehnt." },
        { status: response.status },
      );
    }

    const data = (await response.json().catch(() => ({}))) as {
      _id?: string;
    };
    return NextResponse.json({ id: data._id ?? null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kassenbuchung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
