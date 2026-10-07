import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ALL_SCOPES } from "@/lib/access/access";
import { extractReceiptCostCenters } from "@/lib/access/campai-receipt-cost-centers";
import { loadAllowedCostCenters, loadUserAccess } from "@/lib/access/server";
import { canViewReceiptCostCenters } from "@/lib/buchhaltung-werkbereiche";
import { fetchOwnDebtorAccount } from "@/lib/campai-own-debtor";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const parseDebtorAccount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const extractReceiptAccount = (payload: Record<string, unknown>) => {
  const accountRecord =
    payload.account && typeof payload.account === "object"
      ? (payload.account as Record<string, unknown>)
      : null;

  return parseDebtorAccount(
    payload.account ?? accountRecord?.account ?? accountRecord?.number ?? payload.customerNumber,
  );
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const { invoiceId } = await context.params;

  const allowedCostCenters = await loadAllowedCostCenters(
    supabase,
    await loadUserAccess(supabase, data.user),
    "receipts.view",
  );

  if (allowedCostCenters !== ALL_SCOPES) {
    const receiptResponse = await fetch(
      `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${invoiceId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        cache: "no-store",
      },
    );

    if (!receiptResponse.ok) {
      const errorBody = await receiptResponse.text();
      return NextResponse.json(
        { error: errorBody || "Campai request failed." },
        { status: receiptResponse.status },
      );
    }

    const receiptPayload = (await receiptResponse.json()) as Record<string, unknown>;
    // Ohne globale Buchhaltung: Belege der eigenen Bereiche oder des eigenen
    // Debitorenkontos — bestimmt aus dem Campai-Kontakt, wie in der Belegliste.
    const inOwnScopes =
      allowedCostCenters.length > 0 &&
      canViewReceiptCostCenters(
        extractReceiptCostCenters(receiptPayload),
        allowedCostCenters,
      );
    const linkedDebtorAccount = inOwnScopes
      ? null
      : await fetchOwnDebtorAccount(supabase, data.user.id).catch(() => null);
    const receiptAccount = extractReceiptAccount(receiptPayload);

    if (
      !inOwnScopes &&
      (linkedDebtorAccount === null || receiptAccount !== linkedDebtorAccount)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${invoiceId}/download`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: errorBody || "Campai request failed." },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    return NextResponse.json(
      { error: "Download URL missing." },
      { status: 502 },
    );
  }

  return NextResponse.redirect(payload.url);
};
