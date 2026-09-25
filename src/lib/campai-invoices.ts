export type RawInvoice = Record<string, unknown>;

export type InvoicePayload = {
  id: string;
  receiptNumber?: string;
  title?: string;
  /** Belegart, wie Campai sie führt: invoice, donation, offer, expense … */
  type?: string;
  status?: string;
  paymentStatus?: string;
  /** Gesetzt, sobald der Beleg storniert wurde. */
  canceledAt?: string;
  paidAt?: string;
  receiptDate?: string;
  dueDate?: string;
  totalNet?: number | null;
  totalGross?: number | null;
  totalGrossAmount?: number | null;
  /**
   * Bruttobetrag in Cent, genau wie Campai ihn liefert — ohne die Heuristik
   * von `normalizeAmount`, die kleine Beträge für Euro hält.
   */
  amountCents?: number | null;
  /** Was von diesem Beleg noch offen ist, in Cent. Storniert = 0. */
  amountLeftToPayCents?: number | null;
  currency?: string;
  accountName?: string;
  customerName?: string;
  customerNumber?: string;
};

/** Belegarten von Campai in der Sprache der Oberfläche. */
export const RECEIPT_TYPE_LABELS: Record<string, string> = {
  invoice: "Rechnung",
  expense: "Ausgabe",
  revenue: "Einnahme",
  deposit: "Einzahlung",
  donation: "Spende",
  offer: "Angebot",
  confirmation: "Bestätigung",
  refund: "Rückerstattung",
};

export const receiptTypeLabel = (invoice: InvoicePayload) =>
  (invoice.type ? RECEIPT_TYPE_LABELS[invoice.type] : undefined) ??
  invoice.type ??
  "Beleg";

export type ReceiptPaymentState =
  | "storniert"
  | "bezahlt"
  | "teilweise"
  | "unbezahlt"
  /** Angebote und Bestätigungen kennen keinen Zahlungsstatus. */
  | "unbekannt";

export const RECEIPT_PAYMENT_LABELS: Record<ReceiptPaymentState, string> = {
  storniert: "Storniert",
  bezahlt: "Bezahlt",
  teilweise: "Teilweise bezahlt",
  unbezahlt: "Unbezahlt",
  unbekannt: "—",
};

/**
 * Bezahlt oder nicht? Ein stornierter Beleg ist keins von beiden — er steht
 * deshalb vor dem Zahlungsstatus, den Campai auf `unpaid` stehen lässt.
 */
export const receiptPaymentState = (
  invoice: InvoicePayload,
): ReceiptPaymentState => {
  if (invoice.canceledAt) {
    return "storniert";
  }

  const raw = (invoice.paymentStatus ?? invoice.status ?? "").toLowerCase();

  if (/(^paid$|bezahlt|beglichen|settled)/.test(raw)) return "bezahlt";
  if (/(partial|teil)/.test(raw)) return "teilweise";
  if (/(unpaid|unbezahlt|offen|open|due|f[aä]llig|overdue)/.test(raw)) {
    return "unbezahlt";
  }

  return invoice.paidAt ? "bezahlt" : "unbekannt";
};

/**
 * Was Campai selbst als noch offen führt — inklusive Teilzahlungen und ohne
 * stornierte Belege, die dort auf 0 stehen.
 */
export const receiptOpenCents = (invoice: InvoicePayload) =>
  typeof invoice.amountLeftToPayCents === "number" &&
  invoice.amountLeftToPayCents > 0
    ? invoice.amountLeftToPayCents
    : 0;

export const isReceiptOpen = (invoice: InvoicePayload) =>
  receiptOpenCents(invoice) > 0;

/** Bruttobetrag des Belegs in Cent. */
export const receiptTotalCents = (invoice: InvoicePayload) =>
  invoice.amountCents ??
  invoice.totalGrossAmount ??
  invoice.totalGross ??
  invoice.totalNet ??
  null;

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
      record.priceGross ??
      record.sum;
    if (nested !== undefined) {
      return toNumber(nested);
    }
  }
  return null;
};

// Campai rechnet in Cent. `normalizeAmount` unten rät bei kleinen Zahlen auf
// Euro — für die Felder, die sicher Cent sind, wird deshalb nicht geraten.
const normalizeCents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;

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

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const normalizeCustomerName = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const company = normalizeString(record.company ?? record.companyName);
  if (company) {
    return company;
  }
  const first = normalizeString(record.firstName ?? record.firstname);
  const last = normalizeString(record.lastName ?? record.lastname);
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || undefined;
};

export const normalizeInvoice = (item: RawInvoice): InvoicePayload | null => {
  const id = normalizeString(item._id ?? item.id ?? item.receiptId);
  const receiptNumber = normalizeString(
    item.receiptNumber ?? item.number ?? item.invoiceNumber,
  );
  const title = normalizeString(
    item.title ?? item.subject ?? item.name ?? item.description,
  );
  const status = normalizeString(
    item.receiptStatus ?? item.status ?? item.state ?? item.invoiceStatus,
  );
  const paymentStatus = normalizeString(item.paymentStatus ?? item.paidStatus);
  const type = normalizeString(item.type ?? item.receiptType);
  const canceledAt = normalizeString(item.canceledAt);
  const paidAt = normalizeString(item.paidAt);
  const amountCents = normalizeCents(item.totalGrossAmount);
  const amountLeftToPayCents = normalizeCents(item.totalAmountLeftToPay);
  const receiptDate = normalizeString(item.receiptDate ?? item.date);
  const dueDate = normalizeString(item.dueDate);
  const totalGrossAmount = normalizeAmount(
    item.totalGrossAmount ??
      item.totalGross ??
      item.grossAmount ??
      item.totalAmount ??
      item.amountGross ??
      item.amount,
  );
  const totalGross = normalizeAmount(
    item.totalGross ??
      item.grossAmount ??
      item.totalAmount ??
      item.amountGross ??
      item.amount,
  );
  const totalNet = normalizeAmount(
    item.totalNet ?? item.netAmount ?? item.amountNet ?? item.sumNet,
  );
  const currency = normalizeString(item.currency ?? item.currencyCode);
  const customerNumber = normalizeString(
    item.customerNumber ??
      item.customerNo ??
      item.debtorNumber ??
      item.account ??
      item.accountNumber,
  );
  const customerName = normalizeCustomerName(item.address ?? item.customer);
  const accountName = normalizeString(
    item.accountName ??
      (item.account as Record<string, unknown> | undefined)?.name,
  );

  if (!id) {
    return null;
  }

  return {
    id,
    receiptNumber,
    title,
    type,
    status,
    paymentStatus,
    canceledAt,
    paidAt,
    receiptDate,
    dueDate,
    totalNet,
    totalGross,
    totalGrossAmount,
    amountCents,
    amountLeftToPayCents,
    currency,
    accountName,
    customerName,
    customerNumber,
  } satisfies InvoicePayload;
};

export const extractInvoices = (payload: unknown): RawInvoice[] => {
  if (Array.isArray(payload)) {
    return payload as RawInvoice[];
  }
  if (payload && typeof payload === "object") {
    const typed = payload as Record<string, unknown>;
    const direct =
      (typed.receipts as RawInvoice[] | undefined) ??
      (typed.invoices as RawInvoice[] | undefined) ??
      (typed.items as RawInvoice[] | undefined) ??
      (typed.data as RawInvoice[] | undefined) ??
      (typed.result as RawInvoice[] | undefined) ??
      (typed.rows as RawInvoice[] | undefined) ??
      (typed.docs as RawInvoice[] | undefined);
    if (Array.isArray(direct)) {
      return direct;
    }
    const nested =
      (typed.receipts as { items?: RawInvoice[] } | undefined)?.items ??
      (typed.invoices as { items?: RawInvoice[] } | undefined)?.items ??
      (typed.items as { items?: RawInvoice[] } | undefined)?.items ??
      (typed.data as { items?: RawInvoice[] } | undefined)?.items ??
      (typed.data as { receipts?: RawInvoice[] } | undefined)?.receipts ??
      (typed.result as { items?: RawInvoice[] } | undefined)?.items ??
      (typed.result as { data?: RawInvoice[] } | undefined)?.data ??
      (typed.result as { receipts?: RawInvoice[] } | undefined)?.receipts;
    if (Array.isArray(nested)) {
      return nested;
    }
  }
  return [];
};
