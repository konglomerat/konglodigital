import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  extractInvoices,
  normalizeInvoice,
  type InvoicePayload,
} from "@/lib/campai-invoices";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;
  const endpoint =
    process.env.CAMPAI_INVOICES_ENDPOINT ??
    `${baseUrl}/finance/accounting/receipts/list`;
  const trpcBearer = process.env.CAMPAI_TRPC_BEARER;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const debug = body.debug === true;
  const payload = {
    sort: body.sort ?? { receiptDate: "desc" },
    limit: body.limit ?? 50,
    offset: body.offset ?? 0,
    returnCount: body.returnCount ?? false,
    //searchTerm: body.searchTerm ?? "",
    range: body.range ?? undefined,
    fromDate: body.fromDate ?? undefined,
    toDate: body.toDate ?? undefined,
    accountFilter: body.accountFilter ?? undefined,
    reversed: body.reversed ?? undefined,
    canceled: body.canceled ?? undefined,
    costCenters: body.costCenters ?? undefined,
  };

  const response = await fetch(
    trpcBearer
      ? "https://cloud.campai.com/trpc/finance.receipts.listReceipts?batch=1"
      : endpoint,
    {
      method: "POST",
      headers: trpcBearer
        ? {
            "Content-Type": "application/json",
            authorization: `Bearer ${trpcBearer}`,
          }
        : {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
      body: trpcBearer
        ? JSON.stringify({
            0: {
              organizationId,
              mandateId,
              account: body.account,
              sort: payload.sort,
              offset: payload.offset,
              limit: payload.limit,
              returnCount: true,
            },
          })
        : JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: errorBody || "Campai request failed." },
      { status: response.status },
    );
  }

  const rawResponse = (await response.json()) as unknown;
  const dataResponse = ((): Record<string, unknown> => {
    if (Array.isArray(rawResponse)) {
      const first = rawResponse[0] as Record<string, unknown> | undefined;
      const result = first?.result as Record<string, unknown> | undefined;
      const data = result?.data as Record<string, unknown> | undefined;
      const json = data?.json as Record<string, unknown> | undefined;
      return (json ?? data ?? result ?? first ?? {}) as Record<string, unknown>;
    }
    return (rawResponse ?? {}) as Record<string, unknown>;
  })();

  const invoices = extractInvoices(dataResponse)
    .map((item) => normalizeInvoice(item))
    .filter((item): item is InvoicePayload => Boolean(item));
  const count =
    typeof dataResponse.count === "number" ? dataResponse.count : undefined;

  if (debug || invoices.length === 0) {
    return NextResponse.json({
      invoices,
      count: count ?? invoices.length,
      debug: {
        endpoint,
        payload,
        raw: dataResponse,
        parsedCount: invoices.length,
      },
    });
  }

  return NextResponse.json({
    invoices,
    count: count ?? invoices.length,
  });
};
