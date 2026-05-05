export type CampaiAccountingAccountOption = {
  value: string;
  label: string;
  bookable: boolean;
};

type RawAccountingAccount = {
  number?: number | string | null;
  label?: string | null;
  bookable?: boolean | number | string | null;
};

type RawAccountingPlanResponse = {
  accounts?: RawAccountingAccount[];
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

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
};

const normalizeAccountingAccount = (
  item: RawAccountingAccount,
): CampaiAccountingAccountOption | null => {
  const value = normalizeNumericLike(item.number);
  const label = normalizeString(item.label);

  if (!value || !label) {
    return null;
  }

  return {
    value,
    label,
    bookable: normalizeBoolean(item.bookable),
  } satisfies CampaiAccountingAccountOption;
};

export const fetchCampaiAccountingAccounts = async () => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${body}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | RawAccountingPlanResponse
    | null;

  return Array.from(
    new Map(
      (Array.isArray(payload?.accounts) ? payload.accounts : [])
        .map((item) => normalizeAccountingAccount(item))
        .filter((item): item is CampaiAccountingAccountOption => Boolean(item))
        .map((entry) => [entry.value, entry]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "de"));
};

export const createCampaiAccountingAccountLabelMap = (
  accounts: CampaiAccountingAccountOption[],
) => new Map(accounts.map((entry) => [entry.value, entry.label]));