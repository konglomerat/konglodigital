export type MaterialOrderEditablePosition = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitAmountEuro: string;
};

export type MaterialOrderEditableParticipant = {
  id: string;
  name: string;
  confidence: "high" | "medium" | "low";
  positions: MaterialOrderEditablePosition[];
  debtorAccount: number | null;
  debtorName: string;
  debtorEmail: string;
  debtorAddress: {
    country?: string;
    state?: string;
    zip?: string;
    city?: string;
    addressLine?: string;
    details1?: string;
    details2?: string;
  } | null;
  manualShippingShareEuro: string;
  shippingDescription: string;
  invoiceId: string | null;
  createError: string | null;
  creating: boolean;
};

export type MaterialOrderDueDays = "7" | "10" | "14" | "30";

export type MaterialOrderInvoiceSendMode = "none" | "email";

export type MaterialOrderDraft = {
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  dueDays: MaterialOrderDueDays;
  invoiceSendMode: MaterialOrderInvoiceSendMode;
  shippingAmountEuro: string;
  shippingMode: "equal" | "byValue" | "manual";
  globalTaxRate: "0" | "7" | "19";
  issues: string[];
  participants: MaterialOrderEditableParticipant[];
};

export type MaterialOrderSummary = {
  id: string;
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  participantCount: number;
  totalAmountEuro: number;
  shippingAmountEuro: number;
  updatedAt: string;
  createdAt: string;
};

export const normalizeMaterialOrderSummary = (
  value: unknown,
): MaterialOrderSummary | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as Record<string, unknown>;
  if (typeof typed.id !== "string" || !typed.id.trim()) {
    return null;
  }

  const toNumber = (input: unknown) => {
    if (typeof input === "number" && Number.isFinite(input)) {
      return input;
    }
    if (typeof input === "string" && input.trim()) {
      const parsed = Number.parseFloat(input.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  return {
    id: typed.id.trim(),
    supplierName:
      typeof typed.supplierName === "string" ? typed.supplierName.trim() : "",
    supplierInvoiceNumber:
      typeof typed.supplierInvoiceNumber === "string"
        ? typed.supplierInvoiceNumber.trim()
        : "",
    supplierInvoiceDate:
      typeof typed.supplierInvoiceDate === "string"
        ? typed.supplierInvoiceDate.trim()
        : "",
    participantCount:
      typeof typed.participantCount === "number" && Number.isFinite(typed.participantCount)
        ? typed.participantCount
        : 0,
    totalAmountEuro: toNumber(typed.totalAmountEuro),
    shippingAmountEuro: toNumber(typed.shippingAmountEuro),
    updatedAt: typeof typed.updatedAt === "string" ? typed.updatedAt : "",
    createdAt: typeof typed.createdAt === "string" ? typed.createdAt : "",
  };
};

export const normalizeMaterialOrderDraft = (value: unknown): MaterialOrderDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as Record<string, unknown>;
  const participants: MaterialOrderEditableParticipant[] = [];

  if (Array.isArray(typed.participants)) {
    typed.participants.forEach((participant) => {
      if (!participant || typeof participant !== "object") {
        return;
      }
      const participantTyped = participant as Record<string, unknown>;
      const positions: MaterialOrderEditablePosition[] = [];

      if (Array.isArray(participantTyped.positions)) {
        participantTyped.positions.forEach((position) => {
          if (!position || typeof position !== "object") {
            return;
          }
          const positionTyped = position as Record<string, unknown>;
          positions.push({
            id:
              typeof positionTyped.id === "string"
                ? positionTyped.id
                : `position-${Math.random().toString(36).slice(2, 8)}`,
            description:
              typeof positionTyped.description === "string"
                ? positionTyped.description
                : "",
            quantity:
              typeof positionTyped.quantity === "string"
                ? positionTyped.quantity
                : "1",
            unit: typeof positionTyped.unit === "string" ? positionTyped.unit : "Stk",
            unitAmountEuro:
              typeof positionTyped.unitAmountEuro === "string"
                ? positionTyped.unitAmountEuro
                : "",
          });
        });
      }

      participants.push({
        id:
          typeof participantTyped.id === "string"
            ? participantTyped.id
            : `participant-${Math.random().toString(36).slice(2, 8)}`,
        name: typeof participantTyped.name === "string" ? participantTyped.name : "",
        confidence:
          participantTyped.confidence === "high" ||
          participantTyped.confidence === "medium" ||
          participantTyped.confidence === "low"
            ? participantTyped.confidence
            : "low",
        positions,
        debtorAccount:
          typeof participantTyped.debtorAccount === "number"
            ? participantTyped.debtorAccount
            : null,
        debtorName:
          typeof participantTyped.debtorName === "string"
            ? participantTyped.debtorName
            : "",
        debtorEmail:
          typeof participantTyped.debtorEmail === "string"
            ? participantTyped.debtorEmail
            : "",
        debtorAddress:
          participantTyped.debtorAddress && typeof participantTyped.debtorAddress === "object"
            ? (participantTyped.debtorAddress as MaterialOrderEditableParticipant["debtorAddress"])
            : null,
        manualShippingShareEuro:
          typeof participantTyped.manualShippingShareEuro === "string"
            ? participantTyped.manualShippingShareEuro
            : "0,00",
        shippingDescription:
          typeof participantTyped.shippingDescription === "string"
            ? participantTyped.shippingDescription
            : "Anteilige Lieferkosten",
        invoiceId:
          typeof participantTyped.invoiceId === "string"
            ? participantTyped.invoiceId
            : null,
        createError: null,
        creating: false,
      });
    });
  }

  return {
    supplierName:
      typeof typed.supplierName === "string" ? typed.supplierName.trim() : "",
    supplierInvoiceNumber:
      typeof typed.supplierInvoiceNumber === "string"
        ? typed.supplierInvoiceNumber.trim()
        : "",
    supplierInvoiceDate:
      typeof typed.supplierInvoiceDate === "string"
        ? typed.supplierInvoiceDate.trim()
        : "",
    dueDays:
      typed.dueDays === "7" ||
      typed.dueDays === "10" ||
      typed.dueDays === "14" ||
      typed.dueDays === "30"
        ? typed.dueDays
        : "30",
    invoiceSendMode:
      typed.invoiceSendMode === "email" || typed.invoiceSendMode === "none"
        ? typed.invoiceSendMode
        : "none",
    shippingAmountEuro:
      typeof typed.shippingAmountEuro === "string" ? typed.shippingAmountEuro : "0,00",
    shippingMode:
      typed.shippingMode === "equal" ||
      typed.shippingMode === "byValue" ||
      typed.shippingMode === "manual"
        ? typed.shippingMode
        : "equal",
    globalTaxRate:
      typed.globalTaxRate === "0" ||
      typed.globalTaxRate === "7" ||
      typed.globalTaxRate === "19"
        ? typed.globalTaxRate
        : "19",
    issues: Array.isArray(typed.issues)
      ? typed.issues.filter((issue): issue is string => typeof issue === "string")
      : [],
    participants,
  };
};
