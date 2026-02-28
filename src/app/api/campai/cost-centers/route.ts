import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

type CostCenterOption = {
  value: string;
  label: string;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeNumericLike = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const digitsOnly = value.replace(/\D+/g, "").trim();
  return digitsOnly.length > 0 ? digitsOnly : null;
};

const unwrapPayload = (raw: unknown): unknown => {
  if (Array.isArray(raw)) {
    const first = asRecord(raw[0]);
    const result = asRecord(first?.result);
    const data = asRecord(result?.data);
    return data?.json ?? data ?? result ?? first ?? raw;
  }
  return raw;
};

const extractCostCenterArray = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  const candidates = [
    record.costCenters,
    record.costcenters,
    record.items,
    record.data,
    record.rows,
    record.docs,
    asRecord(record.result)?.items,
    asRecord(record.result)?.data,
    asRecord(record.data)?.items,
    asRecord(record.data)?.costCenters,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }
  }

  return [];
};

const normalizeCostCenter = (
  item: Record<string, unknown>,
): CostCenterOption | null => {
  const bookableValue = item.bookable ?? item.isBookable;
  const isBookable =
    bookableValue === true ||
    bookableValue === 1 ||
    bookableValue === "1" ||
    (typeof bookableValue === "string" &&
      bookableValue.toLowerCase() === "true");

  if (!isBookable) {
    return null;
  }

  const value =
    normalizeString(item.number) ??
    normalizeString(item.code) ??
    normalizeString(item.costCenter) ??
    normalizeString(item._id) ??
    normalizeString(item.id);

  if (!value) {
    return null;
  }

  const number = normalizeString(item.number) ?? normalizeString(item.code);
  const name =
    normalizeString(item.name) ??
    normalizeString(item.title) ??
    normalizeString(item.description) ??
    normalizeString(item.label);

  const normalizedNumber = normalizeNumericLike(number);
  const normalizedValue =
    normalizedNumber ?? normalizeNumericLike(value) ?? value;

  const label = [number, name].filter(Boolean).join(" · ") || value;
  return { value: normalizedValue, label };
};

const fetchCostCenters = async (params: {
  apiKey: string;
  baseUrl: string;
  organizationId: string;
  mandateId: string;
}) => {
  const { apiKey, baseUrl, organizationId, mandateId } = params;
  const endpointOverride = process.env.CAMPAI_COST_CENTERS_ENDPOINT;
  const endpoints = endpointOverride
    ? [endpointOverride]
    : [
        `https://cloud.campai.com/api/organizations/${organizationId}/mandates/${mandateId}`,
        `${baseUrl}/finance/cost-centers/list`,
        `${baseUrl}/finance/costCenters/list`,
        `${baseUrl}/finance/accounting/cost-centers/list`,
        `${baseUrl}/finance/accounting/costCenters/list`,
        `${baseUrl}/cost-centers/list`,
      ];

  const tried: string[] = [];

  for (const endpoint of endpoints) {
    for (const method of ["GET", "POST"] as const) {
      tried.push(`${method} ${endpoint}`);
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body:
          method === "POST"
            ? JSON.stringify({
                limit: 500,
                offset: 0,
                returnCount: false,
              })
            : undefined,
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const raw = (await response.json().catch(() => null)) as unknown;
      const unwrapped = unwrapPayload(raw);
      const list = extractCostCenterArray(unwrapped)
        .map((item) => normalizeCostCenter(item))
        .filter((item): item is CostCenterOption => Boolean(item));

      const deduped = Array.from(
        new Map(list.map((entry) => [entry.value, entry])).values(),
      );

      if (deduped.length > 0) {
        return deduped;
      }
    }
  }

  throw new Error(
    `Could not load cost centers from Campai. Tried: ${tried.join(", ")}`,
  );
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
    const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;

    const costCenters = await fetchCostCenters({
      apiKey,
      baseUrl,
      organizationId,
      mandateId,
    });

    return NextResponse.json({ costCenters });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Campai cost centers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
