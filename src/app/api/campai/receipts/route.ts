import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  addCampaiReceiptNote,
  buildCampaiReceiptCreatorNote,
} from "@/lib/campai-receipt-notes";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
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

const extractUploadId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const direct = record._id ?? record.id ?? record.fileId ?? record.documentId;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    return extractUploadId(data);
  }

  const result = record.result;
  if (result && typeof result === "object") {
    return extractUploadId(result);
  }

  return null;
};

const uploadViaStorageUploadUrl = async (params: {
  apiKey: string;
  fileBytes: Uint8Array;
  fileName: string;
  fileContentType: string;
}) => {
  const { apiKey, fileBytes, fileName, fileContentType } = params;

  const uploadUrlResponse = await fetch(
    "https://cloud.campai.com/api/storage/uploadUrl",
    {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    },
  );

  if (!uploadUrlResponse.ok) {
    return null;
  }

  const uploadUrlPayload = (await uploadUrlResponse
    .json()
    .catch(() => null)) as { id?: string; url?: string } | null;

  const uploadId =
    typeof uploadUrlPayload?.id === "string" ? uploadUrlPayload.id : "";
  const uploadUrl =
    typeof uploadUrlPayload?.url === "string" ? uploadUrlPayload.url : "";

  if (!uploadId || !uploadUrl) {
    return null;
  }

  const normalizedBytes = new Uint8Array(fileBytes);
  const fileArrayBuffer = normalizedBytes.buffer;
  const fileBlob = new Blob([fileArrayBuffer], {
    type: fileContentType || "application/octet-stream",
  });

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": fileContentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${fileName || "nachweis.dat"}"`,
    },
    body: fileBlob,
  });

  if (putResponse.ok) {
    return uploadId;
  }

  const formData = new FormData();
  formData.append("file", fileBlob, fileName || "nachweis.dat");
  const postResponse = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  return postResponse.ok ? uploadId : null;
};

const tryUploadReceiptFile = async (params: {
  apiKey: string;
  baseUrl: string;
  endpointOverride?: string;
  fileBase64: string;
  fileName: string;
  fileContentType: string;
}) => {
  const {
    apiKey,
    baseUrl,
    endpointOverride,
    fileBase64,
    fileName,
    fileContentType,
  } = params;
  if (!fileBase64) {
    return {
      receiptFileId: null as string | null,
      uploadWarning: undefined as string | undefined,
    };
  }

  const candidates = endpointOverride
    ? [endpointOverride]
    : [
        `${baseUrl}/files/upload`,
        `${baseUrl}/documents/upload`,
        `${baseUrl}/finance/files/upload`,
        `${baseUrl}/finance/receipts/files/upload`,
      ];

  const bytes = Uint8Array.from(Buffer.from(fileBase64, "base64"));

  const storageUploadId = await uploadViaStorageUploadUrl({
    apiKey,
    fileBytes: bytes,
    fileName,
    fileContentType,
  });

  if (storageUploadId) {
    return { receiptFileId: storageUploadId, uploadWarning: undefined };
  }

  const fileBlob = new Blob([bytes], {
    type: fileContentType || "application/octet-stream",
  });

  for (const endpoint of candidates) {
    const formData = new FormData();
    formData.append("file", fileBlob, fileName || "nachweis.dat");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const fileId = extractUploadId(payload);
    if (fileId) {
      return { receiptFileId: fileId, uploadWarning: undefined };
    }
  }

  return {
    receiptFileId: null,
    uploadWarning:
      "Upload von 'Nachweis über Vorgang' zu Campai fehlgeschlagen. Beleg wurde ohne Dateianhang erstellt.",
  };
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);
  const creatorNote = buildCampaiReceiptCreatorNote({
    user: data.user,
    memberProfile,
  });

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
    const receiptNumber = `EB-${timeStamp}`.slice(0, 30);

    const description = [
      `${reason}: ${occasion}`,
      senderName ? `Von: ${senderName}` : "",
      receiverName ? `An: ${receiverName}` : "",
      notes ? `Notiz: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 140);

    const tags = ["API"];

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

    const { receiptFileId, uploadWarning } = await tryUploadReceiptFile({
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
          description: occasion.slice(0, 140),
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

    const receiptId = dataResponse._id ?? null;
    let noteWarning: string | undefined;

    if (!receiptId) {
      noteWarning =
        "Beleg erstellt, aber Campai hat keine Receipt-ID zurückgegeben. Die Ersteller-Notiz konnte nicht angelegt werden.";
    } else {
      const noteResult = await addCampaiReceiptNote({
        apiKey,
        organizationId,
        mandateId,
        receiptId,
        content: creatorNote,
      });

      if (!noteResult.ok) {
        noteWarning = `Beleg erstellt, aber die Ersteller-Notiz konnte nicht gespeichert werden: ${noteResult.error}`;
      }
    }

    return NextResponse.json({
      id: receiptId,
      alreadyCollected: dataResponse.alreadyCollected ?? false,
      uploadWarning,
      receiptFileId,
      noteWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
