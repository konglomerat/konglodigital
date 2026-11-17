import {
  isCashLinkedReceipt,
  isEditableReceiptType,
  isReceiptFullyEditable,
  parseReceiptNote,
} from "@/lib/receipt-edit";

export type CostCenterOption = {
  value: string;
  label: string;
};

export type ReceiptPositionDetail = {
  account: number | null;
  costCenter1: number | null;
  costCenter2: number | null;
  amount: number | null;
  taxCode: string | null;
  description: string;
  details: string | null;
  quantity: number | null;
  unit: string | null;
  unitAmount: number | null;
  discount: number | null;
};

export type ReceiptNoteDetail = {
  id: string;
  writtenAt: string | null;
  /** Systemereignis (angelegt, Status …) oder Kommentar eines Menschen. */
  system: boolean;
  author: string | null;
  text: string;
};

export type ReceiptDetail = {
  id: string;
  type: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  account: number | null;
  accountName: string | null;
  description: string;
  paymentStatus: string | null;
  totalGrossAmount: number | null;
  totalAmountLeftToPay: number | null;
  isNet: boolean;
  tags: string[];
  notes: ReceiptNoteDetail[];
  positions: ReceiptPositionDetail[];
  isCashLinked: boolean;
  hasPayments: boolean;
  canceledAt: string | null;
  canceledReason: string | null;
  receiptFileName: string | null;
  /** Typ, Kassenbezug und Storno lassen überhaupt Änderungen zu. */
  editable: boolean;
  /** Unbezahlt und ohne Zahlung — alle Felder änderbar. */
  fullyEditable: boolean;
};

export const TYPE_LABELS: Record<string, string> = {
  expense: "Ausgabe",
  revenue: "Einnahme",
  invoice: "Rechnung",
  deposit: "Einzahlung",
  donation: "Spende",
  confirmation: "Bestätigung",
  refund: "Rückerstattung",
  offer: "Angebot",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "unbezahlt",
  partial: "teilweise bezahlt",
  paid: "bezahlt",
};

export const formatCents = (cents: number | null): string => {
  if (cents === null) {
    return "—";
  }
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${euros.toLocaleString("de-DE")},${String(rest).padStart(2, "0")} €`;
};

/** Wie formatCents, aber ohne „€“ — für Summenzeilen. */
export const formatCentsPlain = (cents: number): string =>
  formatCents(cents).replace(" €", "");

export const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
};

export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
};

/** Campai-Datum → Wert für <input type="date">. */
export const toDateInput = (value: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  // Campai speichert Mitternacht UTC — der Kalendertag steht in den ersten zehn Zeichen.
  return parsed.toISOString().slice(0, 10);
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

export const normalizeReceipt = (raw: Record<string, unknown>): ReceiptDetail => {
  const positionsRaw = Array.isArray(raw.positions) ? raw.positions : [];
  const notesRaw = Array.isArray(raw.notes) ? raw.notes : [];
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const paymentsRaw = Array.isArray(raw.payments) ? raw.payments : [];
  const isCashLinked = isCashLinkedReceipt(raw);
  const canceledAt = toStringOrNull(raw.canceledAt);
  const type = toStringOrNull(raw.type);

  return {
    id: typeof raw._id === "string" ? raw._id : "",
    type,
    receiptNumber: toStringOrNull(raw.receiptNumber),
    receiptDate: toStringOrNull(raw.receiptDate),
    dueDate: toStringOrNull(raw.dueDate),
    paidAt: toStringOrNull(raw.paidAt),
    createdAt: toStringOrNull(raw.createdAt),
    account: toNumberOrNull(raw.account),
    accountName: toStringOrNull(raw.accountName),
    description: typeof raw.description === "string" ? raw.description : "",
    paymentStatus: toStringOrNull(raw.paymentStatus)?.toLowerCase() ?? null,
    totalGrossAmount: toNumberOrNull(raw.totalGrossAmount),
    totalAmountLeftToPay: toNumberOrNull(raw.totalAmountLeftToPay),
    isNet: Boolean(raw.isNet),
    tags: tagsRaw.filter((tag): tag is string => typeof tag === "string"),
    notes: notesRaw
      .filter(
        (note): note is Record<string, unknown> =>
          typeof note === "object" && note !== null,
      )
      .map((note) => {
        const parsed = parseReceiptNote(
          typeof note.content === "string" ? note.content : "",
        );
        return {
          id: typeof note.id === "string" ? note.id : "",
          writtenAt: toStringOrNull(note.writtenAt),
          system: parsed.kind === "system",
          author: parsed.kind === "comment" ? parsed.author : null,
          text: parsed.text,
        };
      }),
    positions: positionsRaw
      .filter(
        (p): p is Record<string, unknown> =>
          typeof p === "object" && p !== null,
      )
      .map((position) => ({
        account: toNumberOrNull(position.account),
        costCenter1: toNumberOrNull(position.costCenter1),
        costCenter2: toNumberOrNull(position.costCenter2),
        amount: toNumberOrNull(position.amount),
        taxCode: toStringOrNull(position.taxCode),
        description:
          typeof position.description === "string" ? position.description : "",
        details: toStringOrNull(position.details),
        quantity: toNumberOrNull(position.quantity),
        unit: toStringOrNull(position.unit),
        unitAmount: toNumberOrNull(position.unitAmount),
        discount: toNumberOrNull(position.discount),
      })),
    isCashLinked,
    hasPayments: paymentsRaw.length > 0,
    canceledAt,
    canceledReason: toStringOrNull(raw.canceledReason),
    receiptFileName: toStringOrNull(raw.receiptFileName),
    editable: isEditableReceiptType(type) && !isCashLinked && !canceledAt,
    fullyEditable: isReceiptFullyEditable(raw),
  };
};

// Nur diese Gesichter sind nach doodle-figures.ts portiert.
const AVAILABLE_FACES = [2, 3, 4, 5, 6, 8, 11, 17, 19, 21, 22];

/** Gleiches Gesicht für denselben Namen, quer durch alle Belege. */
export const faceNumberForName = (name: string | null): number => {
  if (!name) return 19;
  let hash = 0;
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVAILABLE_FACES[hash % AVAILABLE_FACES.length];
};

export const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] ?? name;
