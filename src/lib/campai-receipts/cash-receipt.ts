import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCampaiBookingTags } from "@/lib/campai-booking-tags";
import { validateDebtorAddressForAmount } from "@/lib/campai-debtors";
import { uploadCampaiReceiptFile } from "@/lib/campai-receipt-files";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

import {
  loadCampaiConfig,
  loadExpenseAccount,
  loadRevenueAccount,
} from "./config";
import { writeReceiptNotes } from "./notes";
import {
  compactText,
  parseAmountToCents,
  parsePositiveInt,
  toIsoDate,
} from "./parsers";

export type CashReceiptDirection = "expense" | "revenue";

type ParsedCashReceipt = {
  amount: number;
  counterpartyAccount: number;
  counterpartyName: string;
  costCenter1: number | null;
  costCenter2: number | null;
  positionAccount: number | null;
  extraTags: string[];
  notes: string;
  description: string;
  positionDescription: string;
  receiptDate: string;
  receiptNumber: string;
  file: { base64: string; fileName: string; contentType: string };
};

type ParseResult =
  | { ok: true; receipt: ParsedCashReceipt }
  | { ok: false; status: number; error: string };

const resolveAmount = (
  body: Record<string, unknown>,
  direction: CashReceiptDirection,
): number => {
  const expense = parseAmountToCents(body.expense);
  const transfer = parseAmountToCents(body.transferAmount);
  const income = parseAmountToCents(body.income);
  return direction === "revenue"
    ? income || transfer || expense
    : expense || transfer || income;
};

const parseCashReceiptInput = (
  body: Record<string, unknown>,
  direction: CashReceiptDirection,
  accountName: string,
): ParseResult => {
  const isRevenue = direction === "revenue";
  const amount = resolveAmount(body, direction);

  if (amount <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Please provide a positive amount.",
    };
  }

  const counterpartyAccount = parsePositiveInt(body.counterpartyAccount);
  if (!counterpartyAccount) {
    return {
      ok: false,
      status: 400,
      error: isRevenue
        ? "Bitte einen gültigen Debitor auswählen."
        : "Bitte einen gültigen Kreditor auswählen.",
    };
  }

  const reason = compactText(body.reason, "Eigenbeleg");
  const occasion = compactText(body.occasion, "Eigenbeleg");
  const notes = compactText(body.notes);
  const senderName = compactText(body.senderName);
  const receiverName = compactText(body.receiverName);
  const counterpartyName =
    compactText(
      body.counterpartyName,
      isRevenue ? senderName : receiverName,
    ) || accountName;

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
  const positionDescription = (descriptionOverride || occasion).slice(0, 140);

  const timeStamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const receiptNumberOverride = compactText(body.receiptNumber);
  const autoPrefix = body.reason ? "EB" : "BEL";
  const receiptNumber = (
    receiptNumberOverride || `${autoPrefix}-${timeStamp}`
  ).slice(0, 30);
  const extraTags = Array.isArray(body.tags)
    ? body.tags
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return {
    ok: true,
    receipt: {
      amount,
      counterpartyAccount,
      counterpartyName,
      costCenter1: parsePositiveInt(body.costCenter1),
      costCenter2: parsePositiveInt(body.costCenter2),
      positionAccount: parsePositiveInt(body.positionAccount),
      extraTags,
      notes,
      description,
      positionDescription,
      receiptDate: toIsoDate(body.transactionDate),
      receiptNumber,
      file: {
        base64: compactText(body.receiptFileBase64 ?? body.pdfBase64),
        fileName: compactText(
          body.receiptFileName ?? body.pdfFileName,
          "nachweis.dat",
        ),
        contentType: compactText(
          body.receiptFileContentType,
          "application/octet-stream",
        ),
      },
    },
  };
};

const buildAccountHint = (
  direction: CashReceiptDirection,
  errorBody: string,
): string | undefined => {
  const normalized = errorBody.toLowerCase();
  if (
    direction === "expense" &&
    (normalized.includes("kreditor") ||
      normalized.includes("valides kreditoren-konto"))
  ) {
    return "Campai erwartet ein gültiges Kreditoren-Konto. Wähle einen vorhandenen Kreditor aus.";
  }
  if (
    direction === "revenue" &&
    (normalized.includes("debitor") ||
      normalized.includes("valides debitoren-konto"))
  ) {
    return "Campai erwartet ein gültiges Debitoren-Konto. Wähle einen vorhandenen Debitor aus.";
  }
  return undefined;
};

const buildPayload = (
  receipt: ParsedCashReceipt,
  positionAccount: number,
  tags: string[],
  receiptFileId: string | null,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    account: receipt.counterpartyAccount,
    receiptNumber: receipt.receiptNumber,
    isNet: false,
    totalGrossAmount: receipt.amount,
    receiptDate: receipt.receiptDate,
    dueDate: receipt.receiptDate,
    accountName: receipt.counterpartyName,
    description: receipt.description,
    refund: false,
    positions: [
      {
        account: positionAccount,
        amount: receipt.amount,
        description: receipt.positionDescription,
        costCenter1: receipt.costCenter1,
        costCenter2: receipt.costCenter2,
        taxCode: null,
      },
    ],
    queueReceiptDocument: false,
    tags,
    electronic: false,
  };
  if (receiptFileId) {
    payload.receiptFileId = receiptFileId;
    payload.receiptFileName = receipt.file.fileName;
  }
  return payload;
};

export const handleCashReceipt = async (
  request: NextRequest,
  direction: CashReceiptDirection,
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = loadCampaiConfig();
    const defaultPositionAccount =
      direction === "revenue" ? loadRevenueAccount() : loadExpenseAccount();

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const parsed = parseCashReceiptInput(body, direction, config.accountName);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const receipt = parsed.receipt;
    const positionAccount = receipt.positionAccount ?? defaultPositionAccount;

    if (direction === "revenue") {
      const debtorAddressValidation = await validateDebtorAddressForAmount({
        config,
        debtorAccount: receipt.counterpartyAccount,
        grossAmountCents: receipt.amount,
      });

      if (!debtorAddressValidation.ok) {
        return NextResponse.json(
          { error: debtorAddressValidation.error },
          { status: debtorAddressValidation.status },
        );
      }
    }

    const upload = await uploadCampaiReceiptFile({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      endpointOverride: config.uploadEndpointOverride || undefined,
      fileBase64: receipt.file.base64,
      fileName: receipt.file.fileName,
      fileContentType: receipt.file.contentType,
    });

    if (receipt.file.base64 && !upload.receiptFileId) {
      return NextResponse.json(
        {
          error:
            upload.uploadWarning ??
            "Datei-Upload zu Campai fehlgeschlagen. Beleg wurde nicht erstellt.",
        },
        { status: 502 },
      );
    }

    if (receipt.costCenter2 !== null && receipt.costCenter1 === null) {
      receipt.costCenter1 = 9;
    }

    const payload = buildPayload(
      receipt,
      positionAccount,
      buildCampaiBookingTags(data.user, receipt.extraTags),
      upload.receiptFileId ?? null,
    );

    const response = await fetch(`${config.baseUrl}/receipts/${direction}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        {
          error: errorBody || "Campai request failed.",
          hint: buildAccountHint(direction, errorBody),
        },
        { status: response.status },
      );
    }

    const dataResponse = (await response.json()) as {
      _id?: string;
      alreadyCollected?: boolean;
    };
    const receiptId = dataResponse._id ?? null;

    const noteWarning = receiptId
      ? await writeReceiptNotes({
          config,
          receiptId,
          user: data.user,
          internalNote: receipt.notes,
        })
      : "Beleg erstellt, aber Campai hat keine Receipt-ID zurückgegeben – Notiz konnte nicht angelegt werden.";

    return NextResponse.json({
      id: receiptId,
      alreadyCollected: dataResponse.alreadyCollected ?? false,
      uploadWarning: upload.uploadWarning ?? noteWarning,
      receiptFileId: upload.receiptFileId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
