import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { uploadCampaiReceiptFile } from "@/lib/campai-receipt-files";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const compactText = (value: unknown, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 0 ? compact : fallback;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const normalized = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : normalized;
  }

  const germanDateMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDateMatch) {
    const normalized = `${germanDateMatch[3]}-${germanDateMatch[2].padStart(2, "0")}-${germanDateMatch[1].padStart(2, "0")}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : normalized;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

type ScanReceiptResponse = {
  receiptDate?: string;
  receiptNumber?: string;
  totalGrossAmount?: number;
} | null;

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
    const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;
    const uploadEndpointOverride = compactText(
      process.env.CAMPAI_RECEIPT_FILE_UPLOAD_ENDPOINT,
    );

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const receiptType =
      body.receiptType === "revenue" ? "revenue" : "expense";
    const refund = body.refund === true;
    const receiptFileBase64 = compactText(body.receiptFileBase64);
    const receiptFileName = compactText(body.receiptFileName, "nachweis.dat");
    const receiptFileContentType = compactText(
      body.receiptFileContentType,
      "application/octet-stream",
    );

    if (!receiptFileBase64) {
      return NextResponse.json(
        { error: "Bitte zuerst eine Belegdatei auswählen." },
        { status: 400 },
      );
    }

    const { receiptFileId, uploadWarning } = await uploadCampaiReceiptFile({
      apiKey,
      baseUrl,
      endpointOverride: uploadEndpointOverride || undefined,
      fileBase64: receiptFileBase64,
      fileName: receiptFileName,
      fileContentType: receiptFileContentType,
    });

    if (!receiptFileId) {
      return NextResponse.json(
        {
          error:
            uploadWarning ??
            "Datei-Upload zu Campai fehlgeschlagen. Beleg konnte nicht ausgelesen werden.",
        },
        { status: 502 },
      );
    }

    const response = await fetch(
      `https://cloud.campai.com/api/${organizationId}/finance/receipts/scanReceipt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          receiptType,
          refund,
          fileId: receiptFileId,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error:
            errorBody ||
            `Campai-Belegscan fehlgeschlagen (HTTP ${response.status}).`,
        },
        { status: response.status },
      );
    }

    const payload = (await response.json().catch(() => null)) as ScanReceiptResponse;

    return NextResponse.json({
      receiptDate: normalizeDate(payload?.receiptDate),
      receiptNumber:
        typeof payload?.receiptNumber === "string" ? payload.receiptNumber : null,
      totalGrossAmount:
        typeof payload?.totalGrossAmount === "number"
          ? payload.totalGrossAmount
          : null,
      receiptFileId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};