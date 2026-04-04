export type MaterialInvoiceParticipantPosition = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitAmountEuro: number;
  taxRate: 0 | 7 | 19;
  lineTotalEuro: number;
  sourceText?: string;
};

export type MaterialInvoiceParticipant = {
  id: string;
  name: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
  positions: MaterialInvoiceParticipantPosition[];
};

export type MaterialInvoiceParseResult = {
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  currency: string;
  shippingAmountEuro: number;
  totalAmountEuro: number;
  participants: MaterialInvoiceParticipant[];
  issues: string[];
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const normalizeTaxRate = (value: unknown): 0 | 7 | 19 => {
  if (value === 7 || value === "7") {
    return 7;
  }
  if (value === 19 || value === "19") {
    return 19;
  }
  return 0;
};

export const normalizeEuro = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundCurrency(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return roundCurrency(parsed);
    }
  }

  return 0;
};

export const normalizeInvoiceDateString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const germanDateMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDateMatch) {
    const day = germanDateMatch[1].padStart(2, "0");
    const month = germanDateMatch[2].padStart(2, "0");
    const year = germanDateMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

export const buildMaterialPosition = (
  value: Partial<MaterialInvoiceParticipantPosition>,
  index: number,
): MaterialInvoiceParticipantPosition => {
  const quantity =
    typeof value.quantity === "number" && Number.isFinite(value.quantity)
      ? Math.max(value.quantity, 0)
      : 0;
  const unitAmountEuro = normalizeEuro(value.unitAmountEuro);
  const lineTotalEuroCandidate = normalizeEuro(value.lineTotalEuro);
  const lineTotalEuro =
    lineTotalEuroCandidate > 0
      ? lineTotalEuroCandidate
      : roundCurrency(quantity * unitAmountEuro);

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : `pos-${index}`,
    description:
      typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : "Position",
    quantity,
    unit:
      typeof value.unit === "string" && value.unit.trim() ? value.unit.trim() : "Stk",
    unitAmountEuro,
    taxRate: normalizeTaxRate(value.taxRate),
    lineTotalEuro,
    sourceText:
      typeof value.sourceText === "string" && value.sourceText.trim()
        ? value.sourceText.trim()
        : undefined,
  };
};

export const normalizeMaterialInvoiceParseResult = (
  value: unknown,
): MaterialInvoiceParseResult => {
  const typed =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const participantsRaw = Array.isArray(typed.participants)
    ? typed.participants
    : [];

  const participants: MaterialInvoiceParticipant[] = [];

  participantsRaw.forEach((entry, participantIndex) => {
      const participant =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : null;
      if (!participant) {
        return;
      }

      const positionsRaw = Array.isArray(participant.positions)
        ? participant.positions
        : [];
      const positions = positionsRaw.map((position, positionIndex) =>
        buildMaterialPosition(
          position && typeof position === "object"
            ? (position as Partial<MaterialInvoiceParticipantPosition>)
            : {},
          positionIndex,
        ),
      );

      const normalizedParticipant: MaterialInvoiceParticipant = {
        id:
          typeof participant.id === "string" && participant.id.trim()
            ? participant.id.trim()
            : `participant-${participantIndex}`,
        name:
          typeof participant.name === "string" && participant.name.trim()
            ? participant.name.trim()
            : `Person ${participantIndex + 1}`,
        confidence:
          participant.confidence === "high" ||
          participant.confidence === "medium" ||
          participant.confidence === "low"
            ? participant.confidence
            : "low",
        notes:
          typeof participant.notes === "string" && participant.notes.trim()
            ? participant.notes.trim()
            : undefined,
        positions,
      };

      if (normalizedParticipant.positions.length > 0) {
        participants.push(normalizedParticipant);
      }
    });

  return {
    supplierName:
      typeof typed.supplierName === "string" && typed.supplierName.trim()
        ? typed.supplierName.trim()
        : "",
    supplierInvoiceNumber:
      typeof typed.supplierInvoiceNumber === "string" &&
      typed.supplierInvoiceNumber.trim()
        ? typed.supplierInvoiceNumber.trim()
        : "",
    supplierInvoiceDate:
      normalizeInvoiceDateString(typed.supplierInvoiceDate),
    currency:
      typeof typed.currency === "string" && typed.currency.trim()
        ? typed.currency.trim().toUpperCase()
        : "EUR",
    shippingAmountEuro: normalizeEuro(typed.shippingAmountEuro),
    totalAmountEuro: normalizeEuro(typed.totalAmountEuro),
    participants,
    issues: Array.isArray(typed.issues)
      ? typed.issues.filter((issue): issue is string => typeof issue === "string")
      : [],
  };
};
