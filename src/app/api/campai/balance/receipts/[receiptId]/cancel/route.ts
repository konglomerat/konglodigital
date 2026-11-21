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

/** Heutiges Datum in Berlin, als Mitternacht UTC — so speichert Campai Belegdaten. */
const todayAsCampaiDate = () => {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  return `${day}T00:00:00.000Z`;
};

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.edit");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }

  const { receiptId } = await context.params;
  if (!receiptId) {
    return NextResponse.json({ error: "Beleg-ID fehlt." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    reason?: string | null;
  };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      { error: "Bitte einen Grund für das Storno angeben." },
      { status: 400 },
    );
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
    const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;

    const detailResponse = await fetch(
      `${baseUrl}/finance/receipts/${receiptId}`,
      {
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        cache: "no-store",
      },
    );
    if (!detailResponse.ok) {
      const errorBody = await detailResponse.text();
      return NextResponse.json(
        { error: errorBody || "Campai request failed." },
        { status: detailResponse.status },
      );
    }
    const receipt = (await detailResponse.json()) as Record<string, unknown>;

    if (
      !canEditReceiptCostCenters(
        extractReceiptCostCenters(receipt),
        routeAccess.allowedCostCenters,
      )
    ) {
      return costCenterForbiddenResponse();
    }

    if (typeof receipt.canceledAt === "string" && receipt.canceledAt) {
      return NextResponse.json(
        { error: "Dieser Beleg ist bereits storniert." },
        { status: 400 },
      );
    }

    // Nur unbezahlte Belege ohne jede Zahlungszuordnung: Bei bezahlten müsste
    // erst die Zahlung gelöst werden, das bleibt Sache der Buchhaltung.
    const payments = Array.isArray(receipt.payments) ? receipt.payments : [];
    if (receipt.paymentStatus !== "unpaid" || payments.length > 0) {
      return NextResponse.json(
        {
          error:
            "Nur unbezahlte Belege können storniert werden. Bitte direkt in Campai anpassen.",
        },
        { status: 400 },
      );
    }

    const cancelResponse = await fetch(
      `${baseUrl}/finance/receipts/${receiptId}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({
          reason: reason.slice(0, 240),
          cancelDate: todayAsCampaiDate(),
          sendCancelationReceipt: false,
        }),
      },
    );

    if (!cancelResponse.ok) {
      const errorBody = await cancelResponse.text();
      return NextResponse.json(
        { error: errorBody || "Storno in Campai fehlgeschlagen." },
        { status: cancelResponse.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Beleg konnte nicht storniert werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
