import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
  extractInvoices,
  normalizeInvoice,
  type InvoicePayload,
} from "@/lib/campai-invoices";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { userCanAccessModule } from "@/lib/roles";

const parseDebtorAccount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

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
  const endpoint = `${baseUrl}/finance/receipts/list`;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);
  const linkedDebtorAccount = memberProfile?.campaiDebtorAccount ?? null;
  const canAccessInvoices = await userCanAccessModule(supabase, data.user, "invoices");
  const requestedAccount = parseDebtorAccount(body.account);

  if (!canAccessInvoices) {
    if (linkedDebtorAccount === null || requestedAccount === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requestedAccount !== linkedDebtorAccount) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const debug = body.debug === true;
  const payload = {
    sort: body.sort ?? { receiptDate: "desc" },
    limit: body.limit ?? 50,
    offset: body.offset ?? 0,
    returnCount: body.returnCount ?? true,
    searchTerm: body.searchTerm ?? undefined,
    view: body.view ?? undefined,
    invoiceType:
      typeof body.invoiceType === "string" && body.invoiceType.trim()
        ? body.invoiceType.trim()
        : undefined,
    account: body.account ?? undefined,
    tags: body.tags ?? undefined,
    range: body.range ?? undefined,
    fromDate: body.fromDate ?? undefined,
    toDate: body.toDate ?? undefined,
    userFilter: body.userFilter ?? undefined,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

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
