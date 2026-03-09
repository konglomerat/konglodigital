export type RawProduct = Record<string, unknown>;

export type ProductPayload = {
  id: string;
  title: string;
  number?: string;
  unit?: string;
  stock?: number;
  details?: string;
  unitAmount: number;
  taxCode?: "0" | "7" | "19" | null;
  costCenter1?: string;
  costCenter2?: string;
  imageUrl?: string | null;
};

const normalizeCostCenter = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === "string") {
    return value || undefined;
  }

  return undefined;
};

const normalizeTaxCode = (
  value: unknown,
): ProductPayload["taxCode"] => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0 || value === 7 || value === 19) {
      return String(value) as "0" | "7" | "19";
    }
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace("%", "");
    if (normalized === "0" || normalized === "7" || normalized === "19") {
      return normalized;
    }

    const prefixedMatch = normalized
      .toUpperCase()
      .match(/^(?:[A-Z]{1,8})?(0|7|19)$/);

    if (prefixedMatch) {
      return prefixedMatch[1] as "0" | "7" | "19";
    }

    const parsed = Number.parseFloat(normalized.replace(",", "."));
    if (parsed === 0 || parsed === 7 || parsed === 19) {
      return String(parsed) as "0" | "7" | "19";
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      normalizeTaxCode(record.taxCode) ??
      normalizeTaxCode(record.code) ??
      normalizeTaxCode(record.taxRate) ??
      normalizeTaxCode(record.vatRate) ??
      normalizeTaxCode(record.rate) ??
      normalizeTaxCode(record.value) ??
      normalizeTaxCode(record.percent) ??
      normalizeTaxCode(record.percentage)
    );
  }

  return null;
};

const extractImageUrl = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const resource = record.resource ?? record.url ?? record.href;
    if (typeof resource === "string") {
      return resource;
    }
  }
  return null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested =
      record.amount ??
      record.value ??
      record.total ??
      record.price ??
      record.priceNet ??
      record.priceGross;
    if (nested !== undefined) {
      return toNumber(nested);
    }
  }
  return null;
};

const normalizeAmount = (value: unknown) => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  if (!Number.isInteger(numeric) || numeric < 20) {
    return Math.round(numeric * 100);
  }
  return Math.round(numeric);
};

export const normalizeProduct = (item: RawProduct): ProductPayload | null => {
  const id =
    (item._id as string | undefined) ??
    (item.id as string | undefined) ??
    (item.productId as string | undefined) ??
    (item.productNumber as string | undefined) ??
    (item.number as string | undefined);
  const title =
    (item.title as string | undefined) ??
    (item.name as string | undefined) ??
    (item.productName as string | undefined) ??
    (item.description as string | undefined);
  const details =
    (item.details as string | undefined) ??
    (item.description as string | undefined);
  const number =
    (item.number as string | undefined) ??
    (item.productNumber as string | undefined) ??
    (item.code as string | undefined) ??
    (item.sku as string | undefined);
  const unit =
    (item.unit as string | undefined) ??
    (item.unitName as string | undefined) ??
    (item.unitLabel as string | undefined);
  const stockValue =
    (item.stock as number | undefined) ??
    (item.quantity as number | undefined) ??
    (item.qty as number | undefined);
  const stock =
    typeof stockValue === "number" && Number.isFinite(stockValue)
      ? Math.max(0, Math.round(stockValue))
      : undefined;
  const rawAmount =
    (item.unitAmount as number | undefined) ??
    (item.unit_amount as number | undefined) ??
    (item.price as number | undefined) ??
    (item.amount as number | undefined) ??
    (item.unitPrice as number | undefined) ??
    (item.unitPriceNet as number | undefined) ??
    (item.unitPriceGross as number | undefined) ??
    (item.priceNet as number | undefined) ??
    (item.priceGross as number | undefined) ??
    (item.netAmount as number | undefined) ??
    (item.grossAmount as number | undefined) ??
    (item.totalNet as number | undefined) ??
    (item.totalGross as number | undefined) ??
    (item.price as { price?: number } | undefined)?.price ??
    (item.price as { priceNet?: number } | undefined)?.priceNet ??
    (item.price as { priceGross?: number } | undefined)?.priceGross ??
    (item.unitPriceNet as { amount?: number } | undefined) ??
    (item.unitPriceGross as { amount?: number } | undefined) ??
    (item.priceNet as { amount?: number } | undefined) ??
    (item.priceGross as { amount?: number } | undefined) ??
    (item.amount as { amount?: number } | undefined);
  const unitAmount = normalizeAmount(rawAmount);
  const taxCode =
    normalizeTaxCode(item.taxCode) ??
    normalizeTaxCode(item.taxRate) ??
    normalizeTaxCode(item.vatRate) ??
    normalizeTaxCode(item.tax) ??
    normalizeTaxCode(item.price) ??
    normalizeTaxCode(item.vat) ??
    null;
  const rawCostCenter1 =
    item.costCenter1 ??
    item.costCenter ??
    item.defaultCostCenter ??
    item.defaultCostCenter1 ??
    (item.price as { costCenter1?: unknown } | undefined)?.costCenter1 ??
    (item.price as { costCenter?: unknown } | undefined)?.costCenter ??
    (item.costCenterInfo as { code?: unknown } | undefined)?.code;
  const costCenter1 = normalizeCostCenter(rawCostCenter1);
  const rawCostCenter2 =
    item.costCenter2 ??
    item.defaultCostCenter2 ??
    (item.price as { costCenter2?: unknown } | undefined)?.costCenter2 ??
    (item.costCenterInfo2 as { code?: unknown } | undefined)?.code;
  const costCenter2 = normalizeCostCenter(rawCostCenter2);
  const imageUrl =
    extractImageUrl(item.image) ??
    extractImageUrl(item.imageUrl) ??
    extractImageUrl((item.info as { image?: unknown } | undefined)?.image) ??
    extractImageUrl(
      (item.info as { imageUrl?: unknown } | undefined)?.imageUrl,
    ) ??
    null;

  if (!id || !title || unitAmount === null) {
    return null;
  }

  return {
    id,
    title,
    number,
    unit,
    stock,
    details,
    unitAmount,
    taxCode,
    costCenter1,
    costCenter2,
    imageUrl,
  };
};

export const extractProducts = (payload: unknown): RawProduct[] => {
  if (Array.isArray(payload)) {
    return payload as RawProduct[];
  }
  if (payload && typeof payload === "object") {
    const typed = payload as Record<string, unknown>;
    const direct =
      (typed.products as RawProduct[] | undefined) ??
      (typed.items as RawProduct[] | undefined) ??
      (typed.data as RawProduct[] | undefined) ??
      (typed.result as RawProduct[] | undefined) ??
      (typed.rows as RawProduct[] | undefined) ??
      (typed.docs as RawProduct[] | undefined);
    if (Array.isArray(direct)) {
      return direct;
    }
    const nested =
      (typed.products as { items?: RawProduct[] } | undefined)?.items ??
      (typed.items as { items?: RawProduct[] } | undefined)?.items ??
      (typed.data as { items?: RawProduct[] } | undefined)?.items ??
      (typed.data as { products?: RawProduct[] } | undefined)?.products ??
      (typed.result as { items?: RawProduct[] } | undefined)?.items ??
      (typed.result as { data?: RawProduct[] } | undefined)?.data ??
      (typed.result as { products?: RawProduct[] } | undefined)?.products;
    if (Array.isArray(nested)) {
      return nested;
    }
  }
  return [];
};
