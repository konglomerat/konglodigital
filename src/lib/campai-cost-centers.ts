export type CampaiCostCenterOption = {
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
): CampaiCostCenterOption | null => {
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

  const label = normalizeDisplayName(name) ?? normalizedValue;
  return { value: normalizedValue, label };
};

export const fetchCampaiCostCenters = async () => {
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
    .map((item) => normalizeCostCenter(item))
    .filter((item): item is CampaiCostCenterOption => Boolean(item));

  const deduped = Array.from(
    new Map(list.map((entry) => [entry.value, entry])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "de"));

  if (deduped.length === 0) {
    throw new Error("No bookable cost centers found in mandate response.");
  }

  return deduped;
};

export const createCampaiCostCenterLabelMap = (
  costCenters: CampaiCostCenterOption[],
) => new Map(costCenters.map((entry) => [entry.value, entry.label]));