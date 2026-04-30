const CAMPAI_RECEIPTS_PAGE_SIZE = 100;
const CAMPAI_RECEIPTS_MAX_PAGES = 50;

export type CampaiReceiptPosition = {
  costCenter1: number | null;
  costCenter2: number | null;
};

export type CampaiBalanceReceipt = {
  id: string;
  receiptDate: string | null;
  createdAt: string | null;
  receiptNumber: string | null;
  account: number | null;
  accountName: string | null;
  description: string | null;
  totalGrossAmount: number | null;
  type: string | null;
  paymentStatus: string | null;
  tags: string[];
  positions: CampaiReceiptPosition[];
};

type RawPosition = {
  costCenter1?: number | null;
  costCenter2?: number | null;
};

type RawReceipt = {
  _id?: string;
  receiptDate?: string | null;
  createdAt?: string | null;
  receiptNumber?: string | null;
  account?: number | null;
  accountName?: string | null;
  description?: string | null;
  totalGrossAmount?: number | null;
  type?: string | null;
  paymentStatus?: string | null;
  tags?: string[] | null;
  positions?: RawPosition[] | null;
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

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePositions = (raw: RawReceipt["positions"]): CampaiReceiptPosition[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((position) => ({
    costCenter1: toNumberOrNull(position?.costCenter1),
    costCenter2: toNumberOrNull(position?.costCenter2),
  }));
};

const normalizeReceipt = (raw: RawReceipt): CampaiBalanceReceipt | null => {
  const id = toStringOrNull(raw._id);
  if (!id) {
    return null;
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id,
    receiptDate: toStringOrNull(raw.receiptDate),
    createdAt: toStringOrNull(raw.createdAt),
    receiptNumber: toStringOrNull(raw.receiptNumber),
    account: toNumberOrNull(raw.account),
    accountName: toStringOrNull(raw.accountName),
    description: toStringOrNull(raw.description),
    totalGrossAmount: toNumberOrNull(raw.totalGrossAmount),
    type: toStringOrNull(raw.type),
    paymentStatus: toStringOrNull(raw.paymentStatus),
    tags,
    positions: normalizePositions(raw.positions),
  };
};

const fetchReceiptsPage = async (params: {
  apiKey: string;
  baseUrl: string;
  costCenter2Values: number[];
  offset: number;
  limit: number;
}) => {
  const { apiKey, baseUrl, costCenter2Values, offset, limit } = params;

  const requestBody: Record<string, unknown> = {
    sort: { receiptDate: "desc" },
    limit,
    offset,
    returnCount: true,
  };

  if (costCenter2Values.length > 0) {
    requestBody.userFilter = {
      operator: "or",
      groups: costCenter2Values.map((value) => ({
        operator: "and",
        fields: [
          {
            path: "positions.costCenter2",
            comparator: "equals",
            value,
          },
        ],
      })),
    };
  }

  const response = await fetch(`${baseUrl}/finance/receipts/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Campai receipts could not be loaded.",
    );
  }

  const payload = (await response.json()) as CampaiReceiptsResponse;
  const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
  const count =
    typeof payload.count === "number" && Number.isFinite(payload.count)
      ? Math.max(0, Math.trunc(payload.count))
      : receipts.length;

  return { receipts, count };
};

export const listCampaiReceiptsByCostCenter2 = async (
  costCenter2Values: number[],
): Promise<CampaiBalanceReceipt[]> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;

  const uniqueValues = Array.from(new Set(costCenter2Values));
  if (uniqueValues.length === 0) {
    return [];
  }

  const collected: CampaiBalanceReceipt[] = [];
  let offset = 0;
  let totalCount: number | null = null;

  for (let pageIndex = 0; pageIndex < CAMPAI_RECEIPTS_MAX_PAGES; pageIndex += 1) {
    const { receipts: page, count } = await fetchReceiptsPage({
      apiKey,
      baseUrl,
      costCenter2Values: uniqueValues,
      offset,
      limit: CAMPAI_RECEIPTS_PAGE_SIZE,
    });

    for (const raw of page) {
      const normalized = normalizeReceipt(raw);
      if (normalized) {
        collected.push(normalized);
      }
    }

    totalCount = totalCount ?? count;
    if (page.length < CAMPAI_RECEIPTS_PAGE_SIZE) {
      break;
    }

    offset += CAMPAI_RECEIPTS_PAGE_SIZE;
    if (totalCount !== null && offset >= totalCount) {
      break;
    }
  }

  // Defensive: ensure every returned receipt actually matches one of the
  // requested costCenter2 values, in case userFilter behaves unexpectedly.
  const valueSet = new Set(uniqueValues);
  return collected.filter((receipt) =>
    receipt.positions.some(
      (position) =>
        position.costCenter2 !== null && valueSet.has(position.costCenter2),
    ),
  );
};
