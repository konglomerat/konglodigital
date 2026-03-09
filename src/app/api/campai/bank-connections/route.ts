import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

type BankConnectionOption = {
  value: string;
  label: string;
};

type CashAccountListResponse = {
  cashAccounts?: Array<{
    _id?: string;
    name?: string;
    account?: number;
    ownerName?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
    archivedAt?: string | null;
    source?: string;
    finApiConnection?: {
      hasSepaCreditTransfer?: boolean;
    } | null;
  }>;
};

type CashAccountResponse = {
  _id?: string;
  name?: string;
  account?: number;
  ownerName?: string;
  iban?: string;
  bankName?: string;
  archivedAt?: string | null;
  source?: string;
  finApiConnection?: {
    hasSepaCreditTransfer?: boolean;
  } | null;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toOption = (
  item: CashAccountResponse,
): BankConnectionOption | null => {
  if (typeof item?._id !== "string" || !item._id.trim()) {
    return null;
  }

  if (item.archivedAt) {
    return null;
  }

  const isTransferCapable = item.finApiConnection?.hasSepaCreditTransfer === true;
  if (!isTransferCapable && item.source !== "bank") {
    return null;
  }

  const name = normalizeText(item.name);
  const label = name || `Konto ${item._id}`;

  return {
    value: item._id.trim(),
    label,
  };
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiKey = requiredEnv("CAMPAI_API_KEY");
    const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
    const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

    const response = await fetch(
      `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/cash/accounts/list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          limit: 100,
          offset: 0,
          returnCount: false,
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error:
            errorBody || "Campai-Konten konnten nicht geladen werden.",
        },
        { status: response.status },
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | CashAccountListResponse
      | null;

    const bankConnections = Array.isArray(payload?.cashAccounts)
      ? payload.cashAccounts
          .map((item) => toOption(item))
          .filter((item): item is BankConnectionOption => Boolean(item))
      : [];

    const deduped = Array.from(
      new Map(bankConnections.map((item) => [item.value, item])).values(),
    ).sort((left, right) => left.label.localeCompare(right.label, "de"));

    return NextResponse.json({ bankConnections: deduped });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};