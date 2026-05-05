export type CampaiCashAccountOption = {
  value: string;
  label: string;
  sourceId: string;
  sourceType: "cashAccount" | "cashRegister";
};

type RawCashEntry = {
  _id?: string;
  name?: string;
  title?: string;
  account?: number | string | null;
  archivedAt?: string | null;
};

type CashAccountListResponse = {
  cashAccounts?: RawCashEntry[];
};

type CashRegisterListResponse = {
  cashRegisters?: RawCashEntry[];
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
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

const normalizeNumericLike = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const digitsOnly = normalized.replace(/\D+/g, "").trim();
  if (digitsOnly.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? String(parsed) : digitsOnly;
};

const normalizeCashEntry = (
  item: RawCashEntry,
  sourceType: "cashAccount" | "cashRegister",
): CampaiCashAccountOption | null => {
  const sourceId = normalizeString(item._id);
  if (!sourceId || item.archivedAt) {
    return null;
  }

  const value = normalizeNumericLike(item.account);
  if (!value) {
    return null;
  }

  const label = normalizeString(item.name) ?? normalizeString(item.title) ?? value;

  return {
    value,
    label,
    sourceId,
    sourceType,
  } satisfies CampaiCashAccountOption;
};

export const fetchCampaiCashAccounts = async () => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  const requestInit = {
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
    cache: "no-store" as const,
  };

  const [accountsResult, registersResult] = await Promise.allSettled([
    fetch(
      `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/cash/accounts/list`,
      requestInit,
    ),
    fetch(
      `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/cash/registers/list`,
      requestInit,
    ),
  ]);

  const normalizeResponseError = async (response: Response) => {
    const body = await response.text().catch(() => "");
    return `Campai API error: ${response.status} ${body}`;
  };

  const extractCashAccounts = async () => {
    if (accountsResult.status !== "fulfilled") {
      throw accountsResult.reason;
    }

    if (!accountsResult.value.ok) {
      throw new Error(await normalizeResponseError(accountsResult.value));
    }

    const payload = (await accountsResult.value.json().catch(() => null)) as
      | CashAccountListResponse
      | null;

    return Array.isArray(payload?.cashAccounts)
      ? payload.cashAccounts
          .map((item) => normalizeCashEntry(item, "cashAccount"))
          .filter((item): item is CampaiCashAccountOption => Boolean(item))
      : [];
  };

  const extractCashRegisters = async () => {
    if (registersResult.status !== "fulfilled") {
      return [];
    }

    if (!registersResult.value.ok) {
      return [];
    }

    const payload = (await registersResult.value.json().catch(() => null)) as
      | CashRegisterListResponse
      | null;

    return Array.isArray(payload?.cashRegisters)
      ? payload.cashRegisters
          .map((item) => normalizeCashEntry(item, "cashRegister"))
          .filter((item): item is CampaiCashAccountOption => Boolean(item))
      : [];
  };

  const accounts = await extractCashAccounts();
  const registers = await extractCashRegisters();

  return Array.from(
    new Map([...accounts, ...registers].map((entry) => [entry.value, entry])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "de"));
};

export const createCampaiCashAccountLabelMap = (
  accounts: CampaiCashAccountOption[],
) => new Map(accounts.map((entry) => [entry.value, entry.label]));