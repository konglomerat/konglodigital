export type CampaiCostCenterOption = {
  value: string;
  label: string;
};

type CampaiCostCenterEntry = CampaiCostCenterOption & {
  number: number;
  bookable: boolean;
};

type CampaiCostCenterRegion = {
  digit: number;
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
  if (digitsOnly.length === 0) {
    return null;
  }

  const normalized = String(Number.parseInt(digitsOnly, 10));
  return normalized === "NaN" ? digitsOnly : normalized;
};

const normalizeDisplayName = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/^_+/, "").trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeBookableFlag = (value: unknown): boolean =>
  value === true ||
  value === 1 ||
  value === "1" ||
  (typeof value === "string" && value.toLowerCase() === "true");

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

const extractAccountingPlanRegions = (
  payload: unknown,
): CampaiCostCenterRegion[] => {
  const record = asRecord(payload);
  const regions = Array.isArray(record?.regions) ? record.regions : [];

  return regions
    .map((entry) => {
      const region = asRecord(entry);
      const digitValue = region?.digit;
      const digit =
        typeof digitValue === "number" && Number.isFinite(digitValue)
          ? Math.trunc(digitValue)
          : typeof digitValue === "string"
            ? Number.parseInt(digitValue.trim(), 10)
            : Number.NaN;
      const label = normalizeDisplayName(normalizeString(region?.label));

      if (!Number.isFinite(digit) || digit <= 0 || !label) {
        return null;
      }

      return {
        digit,
        label,
      } satisfies CampaiCostCenterRegion;
    })
    .filter((entry): entry is CampaiCostCenterRegion => Boolean(entry));
};

const normalizeCostCenterEntry = (
  item: Record<string, unknown>,
): CampaiCostCenterEntry | null => {
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
  const parsedNumber = Number.parseInt(normalizedValue, 10);

  if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
    return null;
  }

  const label = normalizeDisplayName(name) ?? normalizedValue;
  return {
    number: parsedNumber,
    value: String(parsedNumber),
    label,
    bookable: normalizeBookableFlag(item.bookable ?? item.isBookable),
  };
};

const fetchCampaiCostCenterEntries = async (): Promise<CampaiCostCenterEntry[]> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint = `https://cloud.campai.com/api/organizations/${organizationId}/mandates/${mandateId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Campai API error: ${response.status} ${await response.text().catch(() => "")}`,
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  const record = asRecord(raw);
  const list = extractCostCenterArray(record)
    .map((item) => normalizeCostCenterEntry(item))
    .filter((item): item is CampaiCostCenterEntry => Boolean(item));

  const deduped = Array.from(
    new Map(list.map((entry) => [entry.value, entry])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "de"));

  if (deduped.length === 0) {
    throw new Error("No cost centers found in mandate response.");
  }

  return deduped;
};

export const fetchCampaiCostCenters = async (params?: {
  includeNonBookable?: boolean;
}) => {
  const entries = await fetchCampaiCostCenterEntries();
  const deduped = entries
    .filter((entry) => params?.includeNonBookable || entry.bookable)
    .map(({ value, label }) => ({ value, label }));

  if (deduped.length === 0) {
    throw new Error(
      params?.includeNonBookable
        ? "No cost centers found in mandate response."
        : "No bookable cost centers found in mandate response.",
    );
  }

  return deduped;
};

export const addCampaiCostCenter = async (params: {
  number: number;
  label: string;
  bookable?: boolean;
}) => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const number = Math.trunc(params.number);
  const label = normalizeDisplayName(params.label.trim());

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error("Werkbereich-Nummer muss eine positive Zahl sein.");
  }

  if (!label) {
    throw new Error("Werkbereich-Name ist erforderlich.");
  }

  const existingEntries = await fetchCampaiCostCenterEntries();
  if (existingEntries.some((entry) => entry.number === number)) {
    throw new Error("Ein Werkbereich mit dieser Nummer existiert bereits.");
  }

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/costCenters`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        costCenters: [
          ...existingEntries.map((entry) => ({
            number: entry.number,
            label: entry.label,
            bookable: entry.bookable,
          })),
          {
            number,
            label,
            bookable: params.bookable ?? true,
          },
        ],
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Campai API error: ${response.status} ${await response.text().catch(() => "")}`,
    );
  }

  const costCenters = await fetchCampaiCostCenters({ includeNonBookable: true });
  const createdCostCenter = costCenters.find((entry) => entry.value === String(number));

  if (!createdCostCenter) {
    throw new Error("Neuer Werkbereich wurde angelegt, konnte aber nicht geladen werden.");
  }

  return {
    costCenter: createdCostCenter,
    costCenters,
  };
};

export const fetchCampaiCostCenter1Labels = async () => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const endpoint = `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Campai API error: ${response.status} ${await response.text().catch(() => "")}`,
    );
  }

  const raw = (await response.json().catch(() => null)) as unknown;
  const regions = extractAccountingPlanRegions(raw);
  const deduped = Array.from(
    new Map(
      regions.map((entry) => [String(entry.digit), {
        value: String(entry.digit),
        label: entry.label,
      }] as const),
    ).values(),
  ).sort((left, right) => Number(left.value) - Number(right.value));

  if (deduped.length === 0) {
    throw new Error("No accounting plan regions found in accounting plan response.");
  }

  return deduped;
};

export const createCampaiCostCenterLabelMap = (
  costCenters: CampaiCostCenterOption[],
) => new Map(costCenters.map((entry) => [entry.value, entry.label]));