import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCampaiBookingTags } from "@/lib/campai-booking-tags";
import { uploadCampaiReceiptFile } from "@/lib/campai-receipt-files";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const parseAmountToCents = (value: unknown): number => {
  if (typeof value !== "string") {
    return 0;
  }
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * 100);
};

const compactText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 0 ? compact : fallback;
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

const resolveCostCenter = (
  body: Record<string, unknown>,
  fallback: string,
): number | null => {
  return (
    parsePositiveInt(body.costCenter1) ??
    parsePositiveInt(body.senderArea) ??
    parsePositiveInt(body.receiverArea) ??
    parsePositiveInt(fallback)
  );
};

const parseBookingType = (value: unknown): "ausgabe" | "einnahme" | null => {
  if (value === "ausgabe" || value === "einnahme") {
    return value;
  }
  return null;
};

const toIsoDate = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

const addReceiptNote = async (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  receiptId: string;
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { apiKey, organizationId, mandateId, receiptId, content } = params;

  if (!content) {
    return { ok: true };
  }

  const url = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${receiptId}/notes`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ content }),
    });
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    return { ok: false, error: `Netzwerkfehler: ${msg}` };
  }

  if (!response.ok) {
    if (response.status === 403) {
      return { ok: true };
    }

    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${response.status}: ${body || "Campai note endpoint failed"}`,
    };
  }

  return { ok: true };
};

const buildReceiptUserNote = (params: {
  userId: string;
  noteText: string;
}) =>
  [params.noteText, `Benutzer-ID: ${params.userId}`]
    .filter(Boolean)
    .join("\n");

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tags = buildCampaiBookingTags(data.user);

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
    const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;
    const creditorAccount = Number.parseInt(
      requiredEnv("CAMPAI_CREDITOR_ACCOUNT"),
      10,
    );
    const revenueAccount = Number.parseInt(
      process.env.CAMPAI_REVENUE_ACCOUNT ??
        process.env.CAMPAI_INCOME_ACCOUNT ??
        requiredEnv("CAMPAI_ACCOUNT"),
      10,
    );
    const expenseAccount = Number.parseInt(
      process.env.CAMPAI_EXPENSE_ACCOUNT ?? requiredEnv("CAMPAI_ACCOUNT"),
      10,
    );
    const accountName = process.env.CAMPAI_ACCOUNT_NAME ?? "";
    const defaultCostCenter1 = process.env.CAMPAI_COST_CENTER1 ?? "";

    if (!Number.isInteger(creditorAccount) || creditorAccount <= 0) {
      return NextResponse.json(
        { error: "Invalid CAMPAI_CREDITOR_ACCOUNT" },
        { status: 500 },
      );
    }

    if (!Number.isInteger(expenseAccount) || expenseAccount <= 0) {
      return NextResponse.json(
        { error: "Invalid CAMPAI_EXPENSE_ACCOUNT/CAMPAI_ACCOUNT" },
        { status: 500 },
      );
    }

    if (!Number.isInteger(revenueAccount) || revenueAccount <= 0) {
      return NextResponse.json(
        {
          error:
            "Invalid CAMPAI_REVENUE_ACCOUNT/CAMPAI_INCOME_ACCOUNT/CAMPAI_ACCOUNT",
        },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const costCenter1 = resolveCostCenter(body, defaultCostCenter1);

    if (!costCenter1) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid numeric costCenter1. Set CAMPAI_COST_CENTER1 to a positive integer or provide numeric costCenter1/senderArea/receiverArea.",
        },
        { status: 400 },
      );
    }

    const expenseAmount = parseAmountToCents(body.expense);
    const transferAmount = parseAmountToCents(body.transferAmount);
    const incomeAmount = parseAmountToCents(body.income);
    const amount = expenseAmount || transferAmount || incomeAmount;
    const bookingType =
      parseBookingType(body.bookingType) ??
      (incomeAmount > 0 && expenseAmount === 0 && transferAmount === 0
        ? "einnahme"
        : "ausgabe");
    const isRevenueReceipt = bookingType === "einnahme";
    const counterpartyAccount = parsePositiveInt(body.counterpartyAccount);
    const costCenter2 = parsePositiveInt(body.costCenter2);

    if (amount <= 0) {
      return NextResponse.json(
        {
          error:
            "Please provide a positive amount (expense, transfer or income).",
        },
        { status: 400 },
      );
    }

    if (!counterpartyAccount) {
      return NextResponse.json(
        {
          error:
            isRevenueReceipt
              ? "Bitte einen gültigen Debitor auswählen."
              : "Bitte einen gültigen Kreditor auswählen.",
        },
        { status: 400 },
      );
    }

    const reason = compactText(body.reason, "Eigenbeleg");
    const occasion = compactText(body.occasion, "Eigenbeleg");
    const notes = compactText(body.notes);
    const receiptNote = buildReceiptUserNote({
      userId: data.user.id,
      noteText: notes,
    });
    const senderName = compactText(body.senderName);
    const receiverName = compactText(body.receiverName);
    const counterpartyName = compactText(
      body.counterpartyName,
      isRevenueReceipt ? senderName : receiverName,
    );
    const receiptDate = toIsoDate(body.transactionDate);
    const dueDate = receiptDate;
    const timeStamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const receiptNumberOverride = compactText(body.receiptNumber);
    const autoPrefix = body.reason ? "EB" : "BEL";
    const receiptNumber = (receiptNumberOverride || `${autoPrefix}-${timeStamp}`).slice(0, 30);

    // Callers can send a top-level `description` to skip the reason:occasion format.
    const descriptionOverride = compactText(body.description);
    const description = descriptionOverride
      ? descriptionOverride.slice(0, 140)
      : [
          `${reason}: ${occasion}`,
          senderName ? `Von: ${senderName}` : "",
          receiverName ? `An: ${receiverName}` : "",
          notes ? `Notiz: ${notes}` : "",
        ]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 140);

    const receiptFileBase64 = compactText(
      body.receiptFileBase64 ?? body.pdfBase64,
    );
    const receiptFileName = compactText(
      body.receiptFileName ?? body.pdfFileName,
      "nachweis.dat",
    );
    const receiptFileContentType = compactText(
      body.receiptFileContentType,
      "application/octet-stream",
    );
    const uploadEndpointOverride = compactText(
      process.env.CAMPAI_RECEIPT_FILE_UPLOAD_ENDPOINT,
    );

    const { receiptFileId, uploadWarning } = await uploadCampaiReceiptFile({
      apiKey,
      baseUrl,
      endpointOverride: uploadEndpointOverride || undefined,
      fileBase64: receiptFileBase64,
      fileName: receiptFileName,
      fileContentType: receiptFileContentType,
    });

    if (receiptFileBase64 && !receiptFileId) {
      return NextResponse.json(
        {
          error:
            uploadWarning ??
            "Datei-Upload zu Campai fehlgeschlagen. Beleg wurde nicht erstellt.",
        },
        { status: 502 },
      );
    }

    const fallbackCounterpartyAccount = isRevenueReceipt ? null : creditorAccount;
    const finalAccount = counterpartyAccount ?? fallbackCounterpartyAccount;
    const finalAccountName = counterpartyName || accountName;

    if (!finalAccount) {
      return NextResponse.json(
        {
          error:
            "Kein gültiges Gegenkonto für den Campai-Beleg verfügbar.",
        },
        { status: 400 },
      );
    }

    const positionAccount = isRevenueReceipt ? revenueAccount : expenseAccount;

    const payload: Record<string, unknown> = {
      account: finalAccount,
      receiptNumber,
      isNet: false,
      totalGrossAmount: amount,
      receiptDate,
      dueDate,
      accountName: finalAccountName,
      description,
      refund: false,
      positions: [
        {
          account: positionAccount,
          amount,
          description: (descriptionOverride || occasion).slice(0, 140),
          costCenter1,
          costCenter2,
          taxCode: null,
        },
      ],
      queueReceiptDocument: false,
      tags,
      electronic: false,
    };

    if (receiptFileId) {
      payload.receiptFileId = receiptFileId;
      payload.receiptFileName = receiptFileName;
    }

    const response = await fetch(
      `${baseUrl}/receipts/${isRevenueReceipt ? "revenue" : "expense"}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      const normalized = errorBody.toLowerCase();
      const accountHint =
        !isRevenueReceipt &&
        (normalized.includes("kreditor") ||
          normalized.includes("valides kreditoren-konto"))
          ? "Campai erwartet ein gültiges Kreditoren-Konto. Wähle einen vorhandenen Kreditor aus oder setze CAMPAI_CREDITOR_ACCOUNT auf ein gültiges Fallback-Konto."
          : isRevenueReceipt &&
              (normalized.includes("debitor") ||
                normalized.includes("valides debitoren-konto"))
            ? "Campai erwartet ein gültiges Debitoren-Konto. Wähle einen vorhandenen Debitor aus."
          : undefined;
      return NextResponse.json(
        {
          error: errorBody || "Campai request failed.",
          hint: accountHint,
        },
        { status: response.status },
      );
    }

    const dataResponse = (await response.json()) as {
      _id?: string;
      alreadyCollected?: boolean;
    };

    let noteWarning: string | undefined;
    const receiptId = dataResponse._id ?? null;
    if (!receiptId) {
      noteWarning = "Beleg erstellt, aber Campai hat keine Receipt-ID zurückgegeben – Notiz konnte nicht angelegt werden.";
    } else {
      const noteResult = await addReceiptNote({
        apiKey,
        organizationId,
        mandateId,
        receiptId,
        content: receiptNote,
      });

      if (!noteResult.ok) {
        noteWarning = `Beleg erstellt, aber die Notiz konnte nicht gespeichert werden: ${noteResult.error}`;
      }
    }

    return NextResponse.json({
      id: receiptId,
      alreadyCollected: dataResponse.alreadyCollected ?? false,
      uploadWarning: uploadWarning ?? noteWarning,
      receiptFileId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
