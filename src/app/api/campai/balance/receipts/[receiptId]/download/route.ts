import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ALL_SCOPES } from "@/lib/access/access";
import { fetchCampaiReceiptCostCenters } from "@/lib/access/campai-receipt-cost-centers";
import {
  costCenterForbiddenResponse,
  getBuchhaltungRouteAccess,
} from "@/lib/access/server";
import { canViewReceiptCostCenters } from "@/lib/buchhaltung-werkbereiche";
import { withSupabaseCookies } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const sanitizeFileName = (value: string) => {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "beleg";
};

const withRouteCookies = (response: NextResponse, source: NextResponse) => {
  return withSupabaseCookies(response, source);
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ receiptId: string }> },
) => {
  const routeAccess = await getBuchhaltungRouteAccess(request, "receipts.view");
  if (!routeAccess.ok) {
    return routeAccess.response;
  }
  const routeResponse = routeAccess.response;

  const { receiptId } = await context.params;

  // Mit Bereichs-Buchhaltung erst nachsehen, wohin der Beleg gebucht ist.
  if (routeAccess.allowedCostCenters !== ALL_SCOPES) {
    const costCenters = await fetchCampaiReceiptCostCenters(receiptId);
    if (
      !costCenters ||
      !canViewReceiptCostCenters(costCenters, routeAccess.allowedCostCenters)
    ) {
      return withRouteCookies(costCenterForbiddenResponse(), routeResponse);
    }
  }
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${receiptId}/download`;

  const downloadUrlResponse = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!downloadUrlResponse.ok) {
    const errorBody = await downloadUrlResponse.text();
    return withRouteCookies(
      NextResponse.json(
        { error: errorBody || "Campai request failed." },
        { status: downloadUrlResponse.status },
      ),
      routeResponse,
    );
  }

  const payload = (await downloadUrlResponse.json()) as {
    url?: string;
    fileName?: string;
  };

  if (!payload.url) {
    return withRouteCookies(
      NextResponse.json({ error: "Download URL missing." }, { status: 502 }),
      routeResponse,
    );
  }

  const fileResponse = await fetch(payload.url, {
    method: "GET",
    cache: "no-store",
  });

  if (!fileResponse.ok) {
    const errorBody = await fileResponse.text();
    return withRouteCookies(
      NextResponse.json(
        { error: errorBody || "Receipt file could not be loaded." },
        { status: 502 },
      ),
      routeResponse,
    );
  }

  const contentType =
    fileResponse.headers.get("content-type") || "application/pdf";
  const fileNameBase = sanitizeFileName(payload.fileName || `beleg-${receiptId}`);

  const downloadResponse = new NextResponse(await fileResponse.arrayBuffer(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileNameBase}.pdf"`,
      "Content-Type": contentType,
    },
  });

  return withRouteCookies(downloadResponse, routeResponse);
};