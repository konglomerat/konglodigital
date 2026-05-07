import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { addCampaiReceiptNote } from "@/lib/campai-receipt-notes";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

type CampaiReceiptDetail = Record<string, unknown> & {
  type?: string;
  positions?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
};

const buildBaseUrl = () => {
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  return `https://cloud.campai.com/api/${organizationId}/${mandateId}`;
};

const fetchReceiptDetail = async (
  receiptId: string,
): Promise<{ ok: true; receipt: CampaiReceiptDetail } | { ok: false; status: number; error: string }> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const baseUrl = buildBaseUrl();
  const response = await fetch(`${baseUrl}/finance/receipts/${receiptId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      status: response.status,
      error: errorBody || "Campai request failed.",
    };
  }

  const receipt = (await response.json()) as CampaiReceiptDetail;
  return { ok: true, receipt };
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await context.params;
  if (!receiptId) {
    return NextResponse.json(
      { error: "Beleg-ID fehlt." },
      { status: 400 },
    );
  }

  try {
    const result = await fetchReceiptDetail(receiptId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ receipt: result.receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Beleg konnte nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

const UPDATE_FIELD_WHITELIST: Record<string, string[]> = {
  expense: [
    "account",
    "receiptNumber",
    "isNet",
    "totalGrossAmount",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "accountName",
    "description",
    "refund",
    "positions",
    "paymentSepaCreditTransferId",
    "receiptFileId",
    "receiptFileName",
  ],
  revenue: [
    "account",
    "receiptNumber",
    "isNet",
    "totalGrossAmount",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "accountName",
    "description",
    "refund",
    "deliveryDate",
    "positions",
    "paymentSepaCreditTransferId",
    "receiptFileId",
    "receiptFileName",
  ],
  invoice: [
    "draft",
    "address",
    "deliveryDateType",
    "title",
    "intro",
    "account",
    "isNet",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "offerReceipt",
    "offerReceiptNumber",
    "confirmationReceipt",
    "confirmationReceiptNumber",
    "email",
    "sendMethod",
    "accountName",
    "receiptNumber",
    "customerType",
    "customerNumber",
    "deliveryDate",
    "deliveryDateStart",
    "deliveryDateEnd",
    "description",
    "refund",
    "note",
    "discount",
    "discountType",
    "invoiceType",
    "paymentMethod",
    "paymentTerms",
    "positions",
    "paymentSepaCreditTransferId",
    "useDepositReceipts",
    "supplierNumber",
    "doNotSendReceipt",
  ],
};

const POSITION_FIELD_WHITELIST: Record<string, string[]> = {
  expense: ["account", "amount", "description", "costCenter1", "costCenter2", "taxCode"],
  revenue: ["account", "amount", "description", "costCenter1", "costCenter2", "taxCode"],
  invoice: [
    "unitAmount",
    "discount",
    "description",
    "account",
    "details",
    "quantity",
    "unit",
    "costCenter1",
    "costCenter2",
    "taxCode",
  ],
};

const pickFields = (
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
};

type EditablePositionPatch = {
  description?: string | null;
  costCenter2?: number | null;
};

const isEditableType = (type: unknown): type is "expense" | "revenue" | "invoice" =>
  type === "expense" || type === "revenue" || type === "invoice";

export const PATCH = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await context.params;
  if (!receiptId) {
    return NextResponse.json({ error: "Beleg-ID fehlt." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    description?: string | null;
    positions?: EditablePositionPatch[];
  };

  try {
    const detailResult = await fetchReceiptDetail(receiptId);
    if (!detailResult.ok) {
      return NextResponse.json(
        { error: detailResult.error },
        { status: detailResult.status },
      );
    }

    const receipt = detailResult.receipt;
    const type = receipt.type;

    if (!isEditableType(type)) {
      return NextResponse.json(
        { error: `Belegtyp "${String(type)}" kann nicht bearbeitet werden.` },
        { status: 400 },
      );
    }

    const sourcePositions = Array.isArray(receipt.positions) ? receipt.positions : [];
    const patches = Array.isArray(body.positions) ? body.positions : [];

    const isCashLinked = Array.isArray(receipt.payments)
      ? (receipt.payments as Array<Record<string, unknown>>).some(
          (payment) => typeof payment?.cashTransaction === "string" && payment.cashTransaction.length > 0,
        )
      : false;

    if (isCashLinked) {
      return NextResponse.json(
        {
          error:
            "Dieser Beleg ist mit einer Zahlung verknüpft und kann nicht bearbeitet werden. Bitte direkt in Campai anpassen.",
        },
        { status: 400 },
      );
    }

    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const baseUrl = buildBaseUrl();

    const fieldWhitelist = UPDATE_FIELD_WHITELIST[type];
    const positionWhitelist = POSITION_FIELD_WHITELIST[type];

    const payload = pickFields(receipt as Record<string, unknown>, fieldWhitelist);

    if (typeof body.description === "string") {
      payload.description = body.description.slice(0, 140);
    }

    const nextPositions = sourcePositions.map((position, index) => {
      const sanitized = pickFields(position, positionWhitelist);
      const patch = patches[index];
      if (patch) {
        if (typeof patch.description === "string") {
          sanitized.description = patch.description.slice(0, 200);
        }
        if (patch.costCenter2 === null) {
          sanitized.costCenter2 = null;
        } else if (typeof patch.costCenter2 === "number" && Number.isFinite(patch.costCenter2)) {
          sanitized.costCenter2 = patch.costCenter2;
        }
      }
      return sanitized;
    });

    payload.positions = nextPositions;

    const updateResponse = await fetch(
      `${baseUrl}/receipts/${type}/${receiptId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!updateResponse.ok) {
      const errorBody = await updateResponse.text();
      return NextResponse.json(
        { error: errorBody || "Campai request failed." },
        { status: updateResponse.status },
      );
    }

    const refreshed = await fetchReceiptDetail(receiptId);
    if (!refreshed.ok) {
      return NextResponse.json(
        { error: refreshed.error },
        { status: refreshed.status },
      );
    }
    return NextResponse.json({ receipt: refreshed.receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Beleg konnte nicht aktualisiert werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await context.params;
  if (!receiptId) {
    return NextResponse.json({ error: "Beleg-ID fehlt." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    content?: string | null;
  };
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json(
      { error: "Bitte eine Notiz eingeben." },
      { status: 400 },
    );
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

    const noteResult = await addCampaiReceiptNote({
      apiKey,
      organizationId,
      mandateId,
      receiptId,
      content,
    });

    if (!noteResult.ok) {
      return NextResponse.json({ error: noteResult.error }, { status: 502 });
    }

    const refreshed = await fetchReceiptDetail(receiptId);
    if (!refreshed.ok) {
      return NextResponse.json(
        { error: refreshed.error },
        { status: refreshed.status },
      );
    }

    return NextResponse.json({ receipt: refreshed.receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Notiz konnte nicht gespeichert werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
