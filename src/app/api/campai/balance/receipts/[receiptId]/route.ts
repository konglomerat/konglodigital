import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractReceiptCostCenters } from "@/lib/access/campai-receipt-cost-centers";
import {
  costCenterForbiddenResponse,
  getBuchhaltungRouteAccess,
} from "@/lib/access/server";
import {
  canEditReceiptCostCenters,
  canViewReceiptCostCenters,
} from "@/lib/buchhaltung-werkbereiche";
import { uploadCampaiReceiptFile } from "@/lib/campai-receipt-files";
import {
  addCampaiReceiptNote,
  getReceiptCreatorName,
} from "@/lib/campai-receipt-notes";
import { fetchCampaiTaxes } from "@/lib/campai-taxes";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import {
  buildReceiptUpdatePayload,
  formatAuthoredNote,
  isCashLinkedReceipt,
  isEditableReceiptType,
  isReceiptFullyEditable,
  type ReceiptPatchBody,
} from "@/lib/receipt-edit";

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
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.view");
  if (!routeAccess.ok) {
    return routeAccess.response;
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
    if (
      !canViewReceiptCostCenters(
        extractReceiptCostCenters(result.receipt),
        routeAccess.allowedCostCenters,
      )
    ) {
      return costCenterForbiddenResponse();
    }
    const memberProfile = await getMemberProfileByUserId(
      routeAccess.supabase,
      routeAccess.user.id,
    ).catch(() => null);
    return NextResponse.json({
      receipt: result.receipt,
      viewerName: getReceiptCreatorName(routeAccess.user, memberProfile),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Beleg konnte nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const PATCH = async (
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

  const body = (await request.json().catch(() => ({}))) as ReceiptPatchBody & {
    receiptFile?: {
      base64?: string;
      name?: string;
      contentType?: string;
    } | null;
  };
  const newFileBase64 =
    typeof body.receiptFile?.base64 === "string" ? body.receiptFile.base64 : "";

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

    if (!isEditableReceiptType(type)) {
      return NextResponse.json(
        { error: `Belegtyp "${String(type)}" kann nicht bearbeitet werden.` },
        { status: 400 },
      );
    }

    // Rechnungen erzeugt Campai selbst als PDF — dort gibt es keine Datei,
    // die sich austauschen ließe.
    if (newFileBase64 && type === "invoice") {
      return NextResponse.json(
        { error: "Bei Rechnungen kann die Belegdatei nicht ersetzt werden." },
        { status: 400 },
      );
    }

    if (typeof receipt.canceledAt === "string" && receipt.canceledAt) {
      return NextResponse.json(
        { error: "Stornierte Belege können nicht bearbeitet werden." },
        { status: 400 },
      );
    }

    if (isCashLinkedReceipt(receipt)) {
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

    const fullyEditable = isReceiptFullyEditable(receipt);
    // Die Bruttosumme von Ausgaben und Einnahmen rechnen wir selbst nach —
    // dafür braucht es die Steuersätze.
    const rateByCode = new Map<string, number>();
    if (fullyEditable && type !== "invoice") {
      for (const tax of await fetchCampaiTaxes()) {
        rateByCode.set(tax.code, tax.rate);
      }
    }

    const built = buildReceiptUpdatePayload({
      receipt,
      body,
      fullyEditable,
      rateByCode,
    });
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    const payload = built.payload;
    const nextPositions = built.positions;

    // Vorher und nachher müssen alle Positionen in den eigenen Bereichen
    // liegen — sonst ließe sich ein Beleg in einen fremden Bereich schieben.
    if (
      !canEditReceiptCostCenters(
        extractReceiptCostCenters(receipt),
        routeAccess.allowedCostCenters,
      ) ||
      !canEditReceiptCostCenters(
        extractReceiptCostCenters({ positions: nextPositions }),
        routeAccess.allowedCostCenters,
      )
    ) {
      return costCenterForbiddenResponse();
    }

    if (newFileBase64) {
      const fileName = body.receiptFile?.name?.trim() || "beleg.pdf";
      const { receiptFileId } = await uploadCampaiReceiptFile({
        apiKey,
        baseUrl,
        endpointOverride:
          process.env.CAMPAI_RECEIPT_FILE_UPLOAD_ENDPOINT?.trim() || undefined,
        fileBase64: newFileBase64,
        fileName,
        fileContentType:
          body.receiptFile?.contentType?.trim() || "application/octet-stream",
      });
      if (!receiptFileId) {
        return NextResponse.json(
          { error: "Datei-Upload zu Campai fehlgeschlagen. Beleg wurde nicht geändert." },
          { status: 502 },
        );
      }
      payload.receiptFileId = receiptFileId;
      payload.receiptFileName = fileName;
    }

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
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.edit");
  if (!routeAccess.ok) {
    return routeAccess.response;
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
    const current = await fetchReceiptDetail(receiptId);
    if (!current.ok) {
      return NextResponse.json(
        { error: current.error },
        { status: current.status },
      );
    }
    if (
      !canViewReceiptCostCenters(
        extractReceiptCostCenters(current.receipt),
        routeAccess.allowedCostCenters,
      )
    ) {
      return costCenterForbiddenResponse();
    }

    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

    const memberProfile = await getMemberProfileByUserId(
      routeAccess.supabase,
      routeAccess.user.id,
    ).catch(() => null);
    const noteResult = await addCampaiReceiptNote({
      apiKey,
      organizationId,
      mandateId,
      receiptId,
      content: formatAuthoredNote(
        getReceiptCreatorName(routeAccess.user, memberProfile),
        content,
      ),
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
