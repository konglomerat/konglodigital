// Regeln für das Bearbeiten von Campai-Belegen in der Beleg-Sidebar.
// Reine Funktionen ohne Netz — sie laufen im PATCH-Handler und im Browser
// (Summen) und sind dadurch testbar.

export type EditableReceiptType = "expense" | "revenue" | "invoice";

export const isEditableReceiptType = (
  type: unknown,
): type is EditableReceiptType =>
  type === "expense" || type === "revenue" || type === "invoice";

/** Sphäre (costCenter1): Campai nimmt nur Nummern, die mit 1–4 oder 9 beginnen. */
export const isValidCampaiCostCenter1 = (value: number): boolean => {
  const firstDigit = String(value).trim().charAt(0);
  return ["1", "2", "3", "4", "9"].includes(firstDigit);
};

type RawReceipt = Record<string, unknown>;

export const isCashLinkedReceipt = (receipt: RawReceipt): boolean =>
  Array.isArray(receipt.payments) &&
  (receipt.payments as Array<Record<string, unknown>>).some(
    (payment) =>
      typeof payment?.cashTransaction === "string" &&
      payment.cashTransaction.length > 0,
  );

/**
 * Voll bearbeitbar heißt: Campai hat noch nichts mit dem Beleg verrechnet.
 * Dieselbe Regel wie beim Storno — sobald eine Zahlung hängt, wären Beträge
 * und Konten Sache der Buchhaltung.
 */
export const isReceiptFullyEditable = (receipt: RawReceipt): boolean =>
  isEditableReceiptType(receipt.type) &&
  !(typeof receipt.canceledAt === "string" && receipt.canceledAt) &&
  !isCashLinkedReceipt(receipt) &&
  receipt.paymentStatus === "unpaid" &&
  !(Array.isArray(receipt.payments) && receipt.payments.length > 0);

// ── Summen ────────────────────────────────────────────────────────────────

export type TotalsPosition = {
  amount?: number | null;
  quantity?: number | null;
  unitAmount?: number | null;
  discount?: number | null;
  taxCode?: string | null;
};

/** Positionsbetrag in Cent. Rechnungen rechnen Menge × Preis − Rabatt. */
export const positionAmount = (
  type: string | null,
  position: TotalsPosition,
): number => {
  if (type === "invoice") {
    const quantity = Math.max(0, position.quantity ?? 0);
    const line = Math.round((position.unitAmount ?? 0) * quantity);
    const discount = Math.min(100, Math.max(0, position.discount ?? 0));
    return Math.max(0, Math.round(line * (1 - discount / 100)));
  }
  return position.amount ?? 0;
};

export type ReceiptTotals = { net: number; tax: number; gross: number };

/**
 * Netto, Steuer und Brutto, je Steuerschlüssel gerundet — so rechnet Campai
 * bei Ausgaben und Einnahmen (an 271 Live-Belegen nachgeprüft).
 */
export const computeReceiptTotals = (params: {
  type: string | null;
  isNet: boolean;
  positions: TotalsPosition[];
  rateByCode: ReadonlyMap<string, number>;
}): ReceiptTotals => {
  const byCode = new Map<string, number>();
  for (const position of params.positions) {
    const code = position.taxCode ?? "";
    byCode.set(
      code,
      (byCode.get(code) ?? 0) + positionAmount(params.type, position),
    );
  }

  let net = 0;
  let tax = 0;
  let gross = 0;
  for (const [code, sum] of byCode) {
    const rate = params.rateByCode.get(code) ?? 0;
    if (params.isNet) {
      const groupTax = Math.round((sum * rate) / 100);
      net += sum;
      tax += groupTax;
      gross += sum + groupTax;
    } else {
      const groupNet = Math.round(sum / (1 + rate / 100));
      net += groupNet;
      tax += sum - groupNet;
      gross += sum;
    }
  }
  return { net, tax, gross };
};

// ── PATCH ─────────────────────────────────────────────────────────────────

export type ReceiptFieldsPatch = {
  receiptNumber?: string;
  account?: number;
  accountName?: string;
  description?: string;
  receiptDate?: string;
  dueDate?: string;
  isNet?: boolean;
};

export type PositionPatch = {
  description?: string | null;
  costCenter1?: number | null;
  costCenter2?: number | null;
  account?: number | null;
  taxCode?: string | null;
  amount?: number | null;
  quantity?: number | null;
  unit?: string | null;
  unitAmount?: number | null;
  discount?: number | null;
  details?: string | null;
};

export type ReceiptPatchBody = {
  /** Älteres Format: nur die Beschreibung. */
  description?: string | null;
  receipt?: ReceiptFieldsPatch;
  positions?: PositionPatch[];
};

export const UPDATE_FIELD_WHITELIST: Record<EditableReceiptType, string[]> = {
  expense: [
    "account",
    "receiptNumber",
    "isNet",
    "totalGrossAmount",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "accountName",
    "description",
    "refund",
    "positions",
    "paymentSepaCreditTransferId",
    "receiptFileId",
    "receiptFileName",
  ],
  revenue: [
    "account",
    "receiptNumber",
    "isNet",
    "totalGrossAmount",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "accountName",
    "description",
    "refund",
    "deliveryDate",
    "positions",
    "paymentSepaCreditTransferId",
    "receiptFileId",
    "receiptFileName",
  ],
  invoice: [
    "draft",
    "address",
    "deliveryDateType",
    "title",
    "intro",
    "account",
    "isNet",
    "receiptDate",
    "dueDate",
    "refundReceiptNumber",
    "offerReceipt",
    "offerReceiptNumber",
    "confirmationReceipt",
    "confirmationReceiptNumber",
    "email",
    "sendMethod",
    "accountName",
    "receiptNumber",
    "customerType",
    "customerNumber",
    "deliveryDate",
    "deliveryDateStart",
    "deliveryDateEnd",
    "description",
    "refund",
    "note",
    "discount",
    "discountType",
    "invoiceType",
    "paymentMethod",
    "paymentTerms",
    "positions",
    "paymentSepaCreditTransferId",
    "useDepositReceipts",
    "supplierNumber",
    "doNotSendReceipt",
  ],
};

export const POSITION_FIELD_WHITELIST: Record<EditableReceiptType, string[]> = {
  expense: ["account", "amount", "description", "costCenter1", "costCenter2", "taxCode"],
  revenue: ["account", "amount", "description", "costCenter1", "costCenter2", "taxCode"],
  invoice: [
    "unitAmount",
    "discount",
    "description",
    "account",
    "details",
    "quantity",
    "unit",
    "costCenter1",
    "costCenter2",
    "taxCode",
  ],
};

export const pickFields = (
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
};

const PAID_ERROR = "Beleg ist bereits (teil)bezahlt — nur Beschreibungen und Werkbereiche sind änderbar.";

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const isCents = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 9_999_999_999;

const normalizeCostCenter2 = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return undefined;
};

type BuildResult =
  | { ok: true; payload: Record<string, unknown>; positions: Array<Record<string, unknown>> }
  | { ok: false; error: string };

/**
 * Baut den Campai-Update-Payload aus dem aktuellen Beleg und den Änderungen.
 *
 * Bezahlte Belege (nicht `fullyEditable`): nur Beschreibung des Belegs sowie
 * Beschreibung und Werkbereich jeder Position, in unveränderter Reihenfolge
 * und Anzahl. Alles andere wird mit 400 abgelehnt.
 *
 * Unbezahlte Belege: `positions` ist die vollständige neue Liste. Konto und
 * Steuerschlüssel sind in der Sidebar nicht editierbar und müssen deshalb
 * aus dem bisherigen Beleg stammen.
 */
export const buildReceiptUpdatePayload = (params: {
  receipt: RawReceipt;
  body: ReceiptPatchBody;
  fullyEditable: boolean;
  rateByCode: ReadonlyMap<string, number>;
}): BuildResult => {
  const { receipt, body, fullyEditable } = params;
  const type = receipt.type;
  if (!isEditableReceiptType(type)) {
    return { ok: false, error: `Belegtyp "${String(type)}" kann nicht bearbeitet werden.` };
  }

  const payload = pickFields(receipt, UPDATE_FIELD_WHITELIST[type]);
  const positionWhitelist = POSITION_FIELD_WHITELIST[type];
  const sourcePositions = (Array.isArray(receipt.positions) ? receipt.positions : []) as Array<
    Record<string, unknown>
  >;

  // Beschreibung: in beiden Modi frei.
  const descriptionPatch =
    typeof body.receipt?.description === "string"
      ? body.receipt.description
      : typeof body.description === "string"
        ? body.description
        : undefined;
  if (descriptionPatch !== undefined) {
    payload.description = descriptionPatch.slice(0, 140);
  }

  const fields = body.receipt ?? {};
  const changesLockedFields = (
    ["receiptNumber", "account", "accountName", "receiptDate", "dueDate", "isNet"] as const
  ).some((key) => fields[key] !== undefined);

  if (!fullyEditable) {
    if (changesLockedFields) return { ok: false, error: PAID_ERROR };
    const patches = Array.isArray(body.positions) ? body.positions : [];
    if (patches.length > 0 && patches.length !== sourcePositions.length) {
      return { ok: false, error: PAID_ERROR };
    }
    const positions: Array<Record<string, unknown>> = [];
    for (const [index, position] of sourcePositions.entries()) {
      const sanitized = pickFields(position, positionWhitelist);
      const patch = patches[index];
      if (patch) {
        for (const key of Object.keys(patch) as Array<keyof PositionPatch>) {
          if (key === "description" || key === "costCenter2") continue;
          // Unveränderte Werte mitzuschicken ist erlaubt.
          if ((patch[key] ?? null) !== ((position[key] as unknown) ?? null)) {
            return { ok: false, error: PAID_ERROR };
          }
        }
        if (typeof patch.description === "string") {
          sanitized.description = patch.description.slice(0, 200);
        }
        const costCenter2 = normalizeCostCenter2(patch.costCenter2);
        if (costCenter2 !== undefined) sanitized.costCenter2 = costCenter2;
      }
      positions.push(sanitized);
    }
    payload.positions = positions;
    return { ok: true, payload, positions };
  }

  // ── voll bearbeitbar ──
  if (fields.receiptNumber !== undefined) {
    const receiptNumber = String(fields.receiptNumber).trim();
    if (!receiptNumber) return { ok: false, error: "Belegnummer darf nicht leer sein." };
    payload.receiptNumber = receiptNumber.slice(0, 64);
  }
  if (fields.account !== undefined) {
    if (!Number.isInteger(fields.account) || (fields.account as number) <= 0) {
      return { ok: false, error: "Ungültiges Personenkonto." };
    }
    payload.account = fields.account;
  }
  if (fields.accountName !== undefined) {
    payload.accountName = String(fields.accountName).trim().slice(0, 200);
  }
  for (const key of ["receiptDate", "dueDate"] as const) {
    if (fields[key] !== undefined) {
      if (!isIsoDate(fields[key])) {
        return { ok: false, error: "Datum bitte als JJJJ-MM-TT angeben." };
      }
      payload[key] = fields[key];
    }
  }
  if (fields.isNet !== undefined) {
    payload.isNet = Boolean(fields.isNet);
  }

  let positions = sourcePositions.map((position) => pickFields(position, positionWhitelist));
  if (Array.isArray(body.positions)) {
    if (body.positions.length === 0) {
      return { ok: false, error: "Ein Beleg braucht mindestens eine Position." };
    }
    const knownAccounts = new Set(sourcePositions.map((p) => p.account));
    const knownTaxCodes = new Set(sourcePositions.map((p) => p.taxCode ?? null));
    const next: Array<Record<string, unknown>> = [];
    for (const [index, patch] of body.positions.entries()) {
      const label = `Position ${index + 1}`;
      if (!knownAccounts.has(patch.account)) {
        return { ok: false, error: `${label}: Konto kann hier nicht geändert werden.` };
      }
      if (!knownTaxCodes.has(patch.taxCode ?? null)) {
        return { ok: false, error: `${label}: Steuerschlüssel kann hier nicht geändert werden.` };
      }
      const position: Record<string, unknown> = {
        account: patch.account,
        taxCode: patch.taxCode ?? null,
        description: typeof patch.description === "string" ? patch.description.slice(0, 200) : "",
      };
      const costCenter2 = normalizeCostCenter2(patch.costCenter2);
      position.costCenter2 = costCenter2 ?? null;
      if (patch.costCenter1 === null || patch.costCenter1 === undefined) {
        position.costCenter1 = null;
      } else if (
        Number.isInteger(patch.costCenter1) &&
        patch.costCenter1 > 0 &&
        isValidCampaiCostCenter1(patch.costCenter1)
      ) {
        position.costCenter1 = patch.costCenter1;
      } else {
        return { ok: false, error: `${label}: Sphäre muss mit 1, 2, 3, 4 oder 9 beginnen.` };
      }

      if (type === "invoice") {
        if (typeof patch.quantity !== "number" || !Number.isFinite(patch.quantity) || patch.quantity <= 0) {
          return { ok: false, error: `${label}: Menge muss größer als 0 sein.` };
        }
        if (!isCents(patch.unitAmount)) {
          return { ok: false, error: `${label}: Ungültiger Preis.` };
        }
        position.quantity = patch.quantity;
        position.unitAmount = patch.unitAmount;
        position.unit = typeof patch.unit === "string" ? patch.unit.trim().slice(0, 20) : "";
        position.discount =
          typeof patch.discount === "number" && patch.discount >= 0 && patch.discount <= 100
            ? patch.discount
            : 0;
        position.details = typeof patch.details === "string" ? patch.details : "";
      } else {
        if (!isCents(patch.amount)) {
          return { ok: false, error: `${label}: Ungültiger Betrag.` };
        }
        position.amount = patch.amount;
      }
      next.push(pickFields(position, positionWhitelist));
    }
    positions = next;
  }
  payload.positions = positions;

  // Ausgaben und Einnahmen tragen die Bruttosumme selbst; Rechnungen
  // rechnet Campai aus Menge und Preis.
  if (type !== "invoice") {
    payload.totalGrossAmount = computeReceiptTotals({
      type,
      isNet: Boolean(payload.isNet),
      positions: positions as TotalsPosition[],
      rateByCode: params.rateByCode,
    }).gross;
  }

  return { ok: true, payload, positions };
};

// ── Notizen ───────────────────────────────────────────────────────────────

// Campai schreibt jede Notiz, die über den API-Schlüssel kommt, als
// System-Notiz ohne Verfasser. Damit Kommentare aus der App ihren Verfasser
// behalten, steht der Name als „[Name] “ vorn im Text.

export const formatAuthoredNote = (author: string, text: string): string => {
  const cleanAuthor = author.replace(/[[\]\n]/g, "").trim().slice(0, 80);
  return cleanAuthor ? `[${cleanAuthor}] ${text}` : text;
};

export type ParsedReceiptNote =
  | { kind: "system"; text: string }
  | { kind: "comment"; author: string | null; text: string };

const SYSTEM_NOTE_PATTERNS = [
  /^Erstellt von .+ via KongloDigital$/,
  /^Status: \S[^\n]*$/,
];

export const parseReceiptNote = (content: string): ParsedReceiptNote => {
  const trimmed = content.trim();
  if (SYSTEM_NOTE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { kind: "system", text: trimmed };
  }
  const match = /^\[([^\]\n]{1,80})\] ([\s\S]*)$/.exec(trimmed);
  if (match) {
    return { kind: "comment", author: match[1], text: match[2] };
  }
  return { kind: "comment", author: null, text: trimmed };
};
