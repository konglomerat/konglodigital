export type RawProduct = Record<string, unknown>;

export type ProductPayload = {
  id: string;
  title: string;
  details?: string;
  unitAmount: number;
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

  if (!id || !title || unitAmount === null) {
    return null;
  }

  return { id, title, details, unitAmount };
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
