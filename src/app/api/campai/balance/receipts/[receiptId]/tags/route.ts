import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractReceiptCostCenters } from "@/lib/access/campai-receipt-cost-centers";
import {
  costCenterForbiddenResponse,
  getBuchhaltungRouteAccess,
} from "@/lib/access/server";
import { canEditReceiptCostCenters } from "@/lib/buchhaltung-werkbereiche";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

// Ersetzt die Tags eines Belegs. Campai erlaubt höchstens 20 Tags mit je
// 1–40 Zeichen und ersetzt die Liste vollständig.
export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.edit");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }

  const { receiptId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { tags?: unknown };
  if (!Array.isArray(body.tags)) {
    return NextResponse.json({ error: "Tags fehlen." }, { status: 400 });
  }
  const tags = Array.from(
    new Set(
      body.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
  if (tags.length > 20 || tags.some((tag) => tag.length > 40)) {
    return NextResponse.json(
      { error: "Höchstens 20 Tags mit je bis zu 40 Zeichen." },
      { status: 400 },
    );
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const baseUrl = `https://cloud.campai.com/api/${requiredEnv("CAMPAI_ORGANIZATION_ID")}/${requiredEnv("CAMPAI_MANDATE_ID")}`;
    const headers = { "Content-Type": "application/json", "X-API-Key": apiKey };

    const current = await fetch(`${baseUrl}/finance/receipts/${receiptId}`, {
      headers,
      cache: "no-store",
    });
    if (!current.ok) {
      return NextResponse.json(
        { error: (await current.text()) || "Beleg nicht gefunden." },
        { status: current.status },
      );
    }
    const receipt = (await current.json()) as Record<string, unknown>;
    if (
      !canEditReceiptCostCenters(
        extractReceiptCostCenters(receipt),
        routeAccess.allowedCostCenters,
      )
    ) {
      return costCenterForbiddenResponse();
    }

    const response = await fetch(`${baseUrl}/finance/receipts/${receiptId}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tags }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: (await response.text()) || "Tags konnten nicht gespeichert werden." },
        { status: response.status },
      );
    }

    const refreshed = await fetch(`${baseUrl}/finance/receipts/${receiptId}`, {
      headers,
      cache: "no-store",
    });
    return NextResponse.json({
      receipt: refreshed.ok ? await refreshed.json() : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tags konnten nicht gespeichert werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
