import {
  createCampaiCostCenterLabelMap,
  fetchCampaiCostCenters,
} from "@/lib/campai-cost-centers";

const CAMPAI_RECEIPTS_PAGE_SIZE = 100;
const CAMPAI_RECEIPTS_MAX_PAGES = 10;

export type CampaiUserReceipt = {
  id: string;
  date: string | null;
  receiptNumber: string | null;
  description: string | null;
  type: string | null;
  workArea: string | null;
  status: string | null;
  amountInCents: number | null;
  currency: string | null;
  accountName: string | null;
};

export type CampaiReceiptsDebugEntry = {
  endpoint: string;
  requestBody: Record<string, unknown>;
  rawResponse: unknown;
  extractedCount: number;
};

type RawReceiptPosition = {
  costCenter2?: number | null;
};

type RawReceipt = {
  _id?: string;
  receiptDate?: string | null;
  receiptNumber?: string | null;
  description?: string | null;
  type?: string | null;
  paymentStatus?: string | null;
  totalGrossAmount?: number | null;
  currency?: string | null;
  accountName?: string | null;
  positions?: RawReceiptPosition[];
};

type CampaiReceiptsResponse = {
  count?: number;
  receipts?: RawReceipt[];
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAmountInCents = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
};

const normalizeDate = (value: unknown): string | null => {
  const stringValue = normalizeString(value);
  if (!stringValue) {
    return null;
  }

  const parsed = new Date(stringValue);
  if (Number.isNaN(parsed.getTime())) {
    return stringValue;
  }

  return parsed.toISOString();
};

const extractWorkArea = (
  item: RawReceipt,
  costCenterLabels: Map<string, string>,
) => {
  const firstPosition = Array.isArray(item.positions) ? item.positions[0] : null;

  const numericValue =
    typeof firstPosition?.costCenter2 === "number" &&
    Number.isFinite(firstPosition.costCenter2)
      ? String(firstPosition.costCenter2)
      : null;

  if (!numericValue) {
    return null;
  }

  return costCenterLabels.get(numericValue) ?? numericValue;
};

const extractReceiptType = (item: RawReceipt) => {
  if (item.type === "expense") {
    return "Ausgabe";
  }
  if (item.type === "revenue") {
    return "Einnahme";
  }
  if (item.type === "invoice") {
    return "Rechnung";
  }
  if (item.type === "deposit") {
    return "Einzahlung";
  }
  if (item.type === "donation") {
    return "Spende";
  }
  if (item.type === "offer") {
    return "Angebot";
  }
  if (item.type === "confirmation") {
    return "Bestätigung";
  }
  if (item.type === "refund") {
    return "Rückerstattung";
  }

  return normalizeString(item.type);
};

const extractStatus = (item: RawReceipt) => {
  const paymentStatus = normalizeString(item.paymentStatus);

  if (paymentStatus === "paid") {
    return "Bezahlt";
  }
  if (paymentStatus === "unpaid") {
    return "Unbezahlt";
  }

  return paymentStatus;
};

const normalizeReceipt = (
  item: RawReceipt,
  costCenterLabels: Map<string, string>,
): CampaiUserReceipt | null => {
  const id = normalizeString(item._id);
  if (!id) {
    return null;
  }

  return {
    id,
    date: normalizeDate(item.receiptDate),
    receiptNumber: normalizeString(item.receiptNumber),
    description: normalizeString(item.description),
    type: extractReceiptType(item),
    workArea: extractWorkArea(item, costCenterLabels),
    status: extractStatus(item),
    amountInCents: normalizeAmountInCents(item.totalGrossAmount),
    currency: normalizeString(item.currency),
    accountName: normalizeString(item.accountName),
  } satisfies CampaiUserReceipt;
};

const fetchCampaiReceiptsPage = async (params: {
  currentUserDisplayName: string;
  offset: number;
  limit: number;
  debug?: boolean;
}) => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/list`;
  const requestBody = {
    sort: { receiptDate: "desc" },
    limit: params.limit,
    offset: params.offset,
    returnCount: true,
    tags: [params.currentUserDisplayName],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Campai receipts could not be loaded.");
  }

  const payload = (await response.json()) as CampaiReceiptsResponse;
  const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
  const count =
    typeof payload.count === "number" && Number.isFinite(payload.count)
      ? Math.max(0, Math.trunc(payload.count))
      : receipts.length;

  return {
    receipts,
    count,
    debug: params.debug
      ? {
          endpoint,
          requestBody,
          rawResponse: payload,
          extractedCount: receipts.length,
        }
      : undefined,
  };
};

export const listCampaiReceipts = async (params: {
  currentUserDisplayName: string;
  debug?: boolean;
}) => {
  const normalizedDisplayName = params.currentUserDisplayName.trim();

  if (!normalizedDisplayName) {
    return {
      receipts: [] as CampaiUserReceipt[],
      debugEntries: [] as CampaiReceiptsDebugEntry[],
    };
  }

  const receipts: CampaiUserReceipt[] = [];
  const debugEntries: CampaiReceiptsDebugEntry[] = [];
  const costCenterLabels = createCampaiCostCenterLabelMap(
    await fetchCampaiCostCenters(),
  );
  let offset = 0;
  let totalCount: number | null = null;

  for (let pageIndex = 0; pageIndex < CAMPAI_RECEIPTS_MAX_PAGES; pageIndex += 1) {
    const { receipts: page, count, debug } = await fetchCampaiReceiptsPage({
      currentUserDisplayName: normalizedDisplayName,
      offset,
      limit: CAMPAI_RECEIPTS_PAGE_SIZE,
      debug: params.debug,
    });

    if (debug) {
      debugEntries.push(debug);
    }

    const normalizedPage = page
      .map((item) => normalizeReceipt(item, costCenterLabels))
      .filter((item): item is CampaiUserReceipt => Boolean(item));

    receipts.push(...normalizedPage);

    totalCount = totalCount ?? count;

    if (page.length < CAMPAI_RECEIPTS_PAGE_SIZE) {
      break;
    }

    offset += CAMPAI_RECEIPTS_PAGE_SIZE;

    if (totalCount !== null && offset >= totalCount) {
      break;
    }
  }

  return {
    receipts: receipts.sort((left, right) => {
      const leftTime = left.date ? Date.parse(left.date) : 0;
      const rightTime = right.date ? Date.parse(right.date) : 0;
      return rightTime - leftTime;
    }),
    debugEntries,
  };
};