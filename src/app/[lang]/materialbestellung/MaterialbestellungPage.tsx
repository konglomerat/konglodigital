"use client";

import { type FocusEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  faFileArrowUp,
  faFilePdf,
  faArrowRotateLeft,
  faPlus,
  faRightLeft,
  faRotate,
  faTrash,
  faUser,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "../components/Button";
import { AutocompleteInput } from "../components/ui/autocomplete-input";
import { FormField, FormSection, Input, Select } from "../components/ui/form";
import {
  type MaterialOrderDraft,
  type MaterialOrderDueDays,
  type MaterialOrderEditableParticipant,
  type MaterialOrderEditablePosition,
  type MaterialOrderInvoiceSendMode,
  type MaterialOrderSummary,
} from "@/lib/material-orders";
import { type MaterialInvoiceParseResult } from "@/lib/material-invoice";
import {
  euroAmountValidationMessage,
} from "@/lib/euro-input";

type DebtorDetails = {
  account?: number | null;
  name?: string;
  email?: string;
  address?: {
    country?: string;
    state?: string;
    zip?: string;
    city?: string;
    addressLine?: string;
    details1?: string;
    details2?: string;
  } | null;
};

type BankConnectionOption = {
  value: string;
  label: string;
  account?: string;
};

type CostCenter2Option = {
  value: string;
  label: string;
};

type ShippingMode = "equal" | "byValue" | "manual";
type TaxRate = "0" | "7" | "19";

const DEFAULT_COST_CENTER1 = "4";
const HOLZ_COST_CENTER2 = "57";
const DEFAULT_TRANSFER_ACCOUNT = "17100";
const SHIPPING_UNIT = "St";
const AUTO_SAVE_DELAY_MS = 3000;

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const parseNumberInput = (value: string) => {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInputEuro = (value: number) => roundCurrency(value).toFixed(2).replace(".", ",");

const calculateDueDate = (invoiceDate: string, dueDays: MaterialOrderDueDays) => {
  if (!invoiceDate) {
    return "";
  }

  const parsedDate = new Date(`${invoiceDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  parsedDate.setDate(parsedDate.getDate() + Number(dueDays));
  return parsedDate.toISOString().slice(0, 10);
};

const getTodayDateString = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};

const formatStoredDate = (value: string) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
};

const createEmptyPosition = (): MaterialOrderEditablePosition => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  description: "",
  articleDescription: "",
  quantity: "1",
  unit: "Stk",
  unitAmountEuro: "",
});

const createEmptyParticipant = (): MaterialOrderEditableParticipant => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "Neue Person",
  positions: [],
  debtorAccount: null,
  debtorName: "",
  shippingDescription: "Anteilige Lieferkosten",
  debtorEmail: "",
  debtorAddress: null,
  manualShippingShareEuro: "0,00",
  invoiceId: null,
  createError: null,
  creating: false,
});

const buildParticipantsFromParse = (
  parsed: MaterialInvoiceParseResult,
): MaterialOrderEditableParticipant[] =>
  parsed.participants.map((participant, participantIndex) => ({
    id: participant.id || `participant-${participantIndex}`,
    name: participant.name,
    positions: participant.positions.map((position, positionIndex) => ({
      id: position.id || `${participant.id}-${positionIndex}`,
      description: position.description,
      articleDescription: position.articleDescription ?? "",
      quantity: String(position.quantity).replace(".", ","),
      unit: position.unit || "Stk",
      unitAmountEuro: toInputEuro(position.unitAmountEuro),
    })),
    debtorAccount: null,
    debtorName: "",
    debtorEmail: "",
    debtorAddress: null,
    manualShippingShareEuro: "0,00",
    shippingDescription: "Anteilige Lieferkosten",
    invoiceId: null,
    createError: null,
    creating: false,
  }));

const sumParticipantSubtotal = (participant: MaterialOrderEditableParticipant) =>
  roundCurrency(
    participant.positions.reduce(
      (sum, position) =>
        sum + parseNumberInput(position.quantity) * parseNumberInput(position.unitAmountEuro),
      0,
    ),
  );

const calculatePositionTotal = (position: MaterialOrderEditablePosition) =>
  roundCurrency(
    parseNumberInput(position.quantity) * parseNumberInput(position.unitAmountEuro),
  );

const allocateShipping = (
  participants: MaterialOrderEditableParticipant[],
  shippingAmountEuro: number,
  mode: ShippingMode,
) => {
  if (participants.length === 0) {
    return new Map<string, number>();
  }

  if (mode === "manual") {
    return new Map(
      participants.map((participant) => [
        participant.id,
        roundCurrency(parseNumberInput(participant.manualShippingShareEuro)),
      ]),
    );
  }

  const result = new Map<string, number>();
  const subtotalByParticipant = participants.map((participant) => ({
    id: participant.id,
    subtotal: sumParticipantSubtotal(participant),
  }));

  if (mode === "byValue") {
    const totalSubtotal = subtotalByParticipant.reduce(
      (sum, entry) => sum + entry.subtotal,
      0,
    );

    if (totalSubtotal > 0) {
      let assigned = 0;
      subtotalByParticipant.forEach((entry, index) => {
        const share =
          index === subtotalByParticipant.length - 1
            ? roundCurrency(shippingAmountEuro - assigned)
            : roundCurrency((shippingAmountEuro * entry.subtotal) / totalSubtotal);
        assigned = roundCurrency(assigned + share);
        result.set(entry.id, share);
      });
      return result;
    }
  }

  const base = Math.floor((shippingAmountEuro / participants.length) * 100) / 100;
  let assigned = 0;
  participants.forEach((participant, index) => {
    const share =
      index === participants.length - 1
        ? roundCurrency(shippingAmountEuro - assigned)
        : roundCurrency(base);
    assigned = roundCurrency(assigned + share);
    result.set(participant.id, share);
  });
  return result;
};

const buildDraft = (params: {
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  totalAmountEuro: number;
  dueDays: MaterialOrderDueDays;
  invoiceSendMode: MaterialOrderInvoiceSendMode;
  shippingAmountEuro: string;
  shippingMode: ShippingMode;
  globalTaxRate: TaxRate;
  issues: string[];
  participants: MaterialOrderEditableParticipant[];
}): MaterialOrderDraft => ({
  supplierName: params.supplierName,
  supplierInvoiceNumber: params.supplierInvoiceNumber,
  supplierInvoiceDate: params.supplierInvoiceDate,
  totalAmountEuro: params.totalAmountEuro,
  dueDays: params.dueDays,
  invoiceSendMode: params.invoiceSendMode,
  shippingAmountEuro: params.shippingAmountEuro,
  shippingMode: params.shippingMode,
  globalTaxRate: params.globalTaxRate,
  issues: params.issues,
  participants: params.participants.map((participant) => ({
    ...participant,
    createError: null,
    creating: false,
  })),
});

export default function MaterialInvoicesPage({
  initialOrderId,
}: {
  initialOrderId?: string | null;
} = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [participants, setParticipants] = useState<MaterialOrderEditableParticipant[]>([]);
  const [unassignedPositions, setUnassignedPositions] = useState<MaterialOrderEditablePosition[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
  const [totalAmountEuro, setTotalAmountEuro] = useState(0);
  const [dueDays, setDueDays] = useState<MaterialOrderDueDays>("30");
  const [invoiceSendMode, setInvoiceSendMode] = useState<MaterialOrderInvoiceSendMode>("none");
  const [shippingAmountEuro, setShippingAmountEuro] = useState("0,00");
  const [shippingMode, setShippingMode] = useState<ShippingMode>("equal");
  const [globalTaxRate, setGlobalTaxRate] = useState<TaxRate>("19");
  const [issues, setIssues] = useState<string[]>([]);

  const [selectedCashAccountId, setSelectedCashAccountId] = useState("");
  const [bankConnectionsError, setBankConnectionsError] = useState<string | null>(null);
  const [costCenter2Options, setCostCenter2Options] = useState<CostCenter2Option[]>([]);
  const [selectedCostCenter2, setSelectedCostCenter2] = useState(HOLZ_COST_CENTER2);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  const lastSavedDraftRef = useRef<string | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const [bankResponse, cc2Response] = await Promise.all([
          fetchJson<{ bankConnections: BankConnectionOption[] }>("/api/campai/bank-connections"),
          fetchJson<{ costCenters: CostCenter2Option[] }>("/api/campai/cost-centers"),
        ]);

        if (!active) {
          return;
        }

        const items = bankResponse.bankConnections ?? [];
        const preferredAccount = items.find(
          (item) => item.account === DEFAULT_TRANSFER_ACCOUNT,
        );
        setSelectedCashAccountId(preferredAccount?.value ?? items[0]?.value ?? "");
        setBankConnectionsError(
          items.length === 0 ? "Kein Konto fuer Überweisung gefunden." : null,
        );

        const cc2Items = cc2Response.costCenters ?? [];
        setCostCenter2Options(cc2Items);
        const preferredCc2 = cc2Items.find((item) => item.value === HOLZ_COST_CENTER2);
        setSelectedCostCenter2(preferredCc2?.value ?? cc2Items[0]?.value ?? HOLZ_COST_CENTER2);
      } catch (error) {
        if (!active) {
          return;
        }
        setBankConnectionsError(
          error instanceof Error
            ? error.message
            : "Bankkonto konnte nicht geladen werden.",
        );
      }

      if (active && initialOrderId) {
        await openSavedOrder(initialOrderId);
      }
    };

    void loadInitialData();
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shippingAmount = roundCurrency(parseNumberInput(shippingAmountEuro));
  const shippingByParticipant = useMemo(
    () => allocateShipping(participants, shippingAmount, shippingMode),
    [participants, shippingAmount, shippingMode],
  );

  const calculatedTotal = useMemo(
    () =>
      roundCurrency(
        participants.reduce(
          (sum, participant) =>
            sum +
            sumParticipantSubtotal(participant) +
            (shippingByParticipant.get(participant.id) ?? 0),
          0,
        ),
      ),
    [participants, shippingByParticipant],
  );

  const autoSaveDraft = useMemo(
    () =>
      participants.length > 0
        ? buildDraft({
            supplierName,
            supplierInvoiceNumber,
            supplierInvoiceDate,
            totalAmountEuro,
            dueDays,
            invoiceSendMode,
            shippingAmountEuro,
            shippingMode,
            globalTaxRate,
            issues,
            participants,
          })
        : null,
    [
      dueDays,
      globalTaxRate,
      invoiceSendMode,
      issues,
      participants,
      shippingAmountEuro,
      shippingMode,
      supplierInvoiceDate,
      supplierInvoiceNumber,
      supplierName,
      totalAmountEuro,
    ],
  );

  const autoSaveSignature = useMemo(
    () => (autoSaveDraft ? JSON.stringify(autoSaveDraft) : null),
    [autoSaveDraft],
  );

  const hasUnsavedChanges = Boolean(
    autoSaveSignature && autoSaveSignature !== lastSavedDraftRef.current,
  );

  const clearPendingAutoSave = () => {
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  };

  const persistDraft = async (draft: MaterialOrderDraft, signature: string) => {
    try {
      clearPendingAutoSave();
      setSavingDraft(true);
      setSaveError(null);

      const data = await fetchJson<{ id: string }>(
        "/api/materialbestellung/orders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentOrderId ?? undefined,
            draft,
          }),
        },
      );

      lastSavedDraftRef.current = signature;
      setCurrentOrderId(data.id);
      setSaveMessage("Automatisch gespeichert.");
    } catch (error) {
      setSaveMessage(null);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Materialbestellung konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingDraft(false);
    }
  };

  useEffect(() => {
    if (hasUnsavedChanges) {
      setSaveMessage(null);
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!autoSaveDraft || !autoSaveSignature || savingDraft || isParsing) {
      return;
    }

    if (autoSaveSignature === lastSavedDraftRef.current) {
      return;
    }

    clearPendingAutoSave();
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void persistDraft(autoSaveDraft, autoSaveSignature);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      clearPendingAutoSave();
    };
  }, [autoSaveDraft, autoSaveSignature, isParsing, savingDraft]);

  useEffect(
    () => () => {
      clearPendingAutoSave();
    },
    [],
  );

  const flushAutoSave = () => {
    if (!autoSaveDraft || !autoSaveSignature || savingDraft || isParsing) {
      return;
    }

    if (autoSaveSignature === lastSavedDraftRef.current) {
      return;
    }

    void persistDraft(autoSaveDraft, autoSaveSignature);
  };

  const handleEditorBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (target instanceof HTMLInputElement && target.type === "file") {
      return;
    }

    flushAutoSave();
  };

  const resetEditor = () => {
    clearPendingAutoSave();
    lastSavedDraftRef.current = null;
    setCurrentOrderId(null);
    setParticipants([]);
    setUnassignedPositions([]);
    setSupplierName("");
    setSupplierInvoiceNumber("");
    setSupplierInvoiceDate("");
    setTotalAmountEuro(0);
    setDueDays("30");
    setInvoiceSendMode("none");
    setShippingAmountEuro("0,00");
    setShippingMode("equal");
    setGlobalTaxRate("19");
    setIssues([]);
    setParseError(null);
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleParse = async () => {
    if (!file) {
      setParseError("Bitte zuerst eine PDF-Datei auswaehlen.");
      return;
    }

    try {
      clearPendingAutoSave();
      setIsParsing(true);
      setParseError(null);
      setSaveError(null);
      setSaveMessage(null);

      const body = new FormData();
      body.set("file", file);

      const data = await fetchJson<{ parsed: MaterialInvoiceParseResult }>(
        "/api/materialbestellung/parse",
        {
          method: "POST",
          body,
        },
      );

      const parsed = data.parsed;
      lastSavedDraftRef.current = null;
      setCurrentOrderId(null);
      setSupplierName(parsed.supplierName);
      setSupplierInvoiceNumber(parsed.supplierInvoiceNumber);
      setSupplierInvoiceDate(parsed.supplierInvoiceDate);
      setTotalAmountEuro(parsed.totalAmountEuro);
      setShippingAmountEuro(toInputEuro(parsed.shippingAmountEuro));
      setGlobalTaxRate(
        String(parsed.participants[0]?.positions[0]?.taxRate ?? 19) as TaxRate,
      );
      setIssues(parsed.issues ?? []);
      setParticipants([]);
      setUnassignedPositions(
        parsed.participants.flatMap((participant, participantIndex) =>
          participant.positions.map((position, positionIndex) => ({
            id: position.id || `${participant.id}-${positionIndex}`,
            description: position.description,
            articleDescription: position.articleDescription ?? "",
            quantity: String(position.quantity).replace(".", ","),
            unit: position.unit || "Stk",
            unitAmountEuro: toInputEuro(position.unitAmountEuro),
          }))
        )
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "PDF konnte nicht analysiert werden.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const openSavedOrder = async (orderId: string) => {
    try {
      clearPendingAutoSave();
      setSaveError(null);
      setSaveMessage(null);

      const data = await fetchJson<{
        draft: MaterialOrderDraft | null;
        order: MaterialOrderSummary | null;
      }>(`/api/materialbestellung/orders?id=${orderId}`);

      if (!data.draft) {
        throw new Error("Gespeicherte Materialbestellung konnte nicht geladen werden.");
      }

      const normalizedParticipants = data.draft.participants.map((participant) => ({
        ...participant,
        shippingDescription: participant.shippingDescription ?? "Anteilige Lieferkosten",
        createError: null,
        creating: false,
      }));

      lastSavedDraftRef.current = JSON.stringify(
        buildDraft({
          supplierName: data.draft.supplierName,
          supplierInvoiceNumber: data.draft.supplierInvoiceNumber,
          supplierInvoiceDate: data.draft.supplierInvoiceDate,
          totalAmountEuro: data.draft.totalAmountEuro,
          dueDays: data.draft.dueDays,
          invoiceSendMode: data.draft.invoiceSendMode,
          shippingAmountEuro: data.draft.shippingAmountEuro,
          shippingMode: data.draft.shippingMode,
          globalTaxRate: data.draft.globalTaxRate,
          issues: data.draft.issues,
          participants: normalizedParticipants,
        }),
      );

      setCurrentOrderId(orderId);
      setSupplierName(data.draft.supplierName);
      setSupplierInvoiceNumber(data.draft.supplierInvoiceNumber);
      setSupplierInvoiceDate(data.draft.supplierInvoiceDate);
      setTotalAmountEuro(data.draft.totalAmountEuro);
      setDueDays(data.draft.dueDays);
      setInvoiceSendMode(data.draft.invoiceSendMode);
      setShippingAmountEuro(data.draft.shippingAmountEuro);
      setShippingMode(data.draft.shippingMode);
      setGlobalTaxRate(data.draft.globalTaxRate);
      setIssues(data.draft.issues);
      setParticipants(normalizedParticipants);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Materialbestellung konnte nicht geladen werden.",
      );
    }
  };

  const updateParticipant = (
    participantId: string,
    updater: (current: MaterialOrderEditableParticipant) => MaterialOrderEditableParticipant,
  ) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId ? updater(participant) : participant,
      ),
    );
  };

  const assignPositionToParticipant = (positionId: string, participantId: string) => {
    const position = unassignedPositions.find((p) => p.id === positionId);
    if (!position || !participantId) return;
    setUnassignedPositions((current) => current.filter((p) => p.id !== positionId));
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? { ...participant, positions: [...participant.positions, position] }
          : participant,
      ),
    );
  };

  const movePosition = (
    fromParticipantId: string,
    toParticipantId: string,
    positionId: string,
  ) => {
    if (fromParticipantId === toParticipantId) {
      return;
    }

    setParticipants((current) => {
      const source = current.find((participant) => participant.id === fromParticipantId);
      const target = current.find((participant) => participant.id === toParticipantId);
      const position = source?.positions.find((entry) => entry.id === positionId);

      if (!source || !target || !position) {
        return current;
      }

      return current.map((participant) => {
        if (participant.id === fromParticipantId) {
          return {
            ...participant,
            positions: participant.positions.filter((entry) => entry.id !== positionId),
          };
        }

        if (participant.id === toParticipantId) {
          return {
            ...participant,
            positions: [...participant.positions, position],
          };
        }

        return participant;
      });
    });
  };

  const fetchDebtorDetails = async (participantId: string, account: number) => {
    try {
      const data = await fetchJson<{ debtor: DebtorDetails | null }>(
        `/api/campai/debtors?account=${account}`,
      );
      const debtor = data.debtor;
      updateParticipant(participantId, (participant) => ({
        ...participant,
        debtorAccount: debtor?.account ?? account,
        debtorName: debtor?.name ?? participant.debtorName,
        debtorEmail: debtor?.email ?? "",
        debtorAddress: debtor?.address ?? null,
        createError: null,
      }));
    } catch (error) {
      updateParticipant(participantId, (participant) => ({
        ...participant,
        createError:
          error instanceof Error
            ? error.message
            : "Debitor konnte nicht geladen werden.",
      }));
    }
  };

  const createInvoiceForParticipant = async (participantId: string) => {
    const participant = participants.find((entry) => entry.id === participantId);
    if (!participant) {
      return;
    }

    if (!participant.debtorAccount || !participant.debtorName || !participant.debtorAddress) {
      updateParticipant(participantId, (current) => ({
        ...current,
        createError: "Bitte zuerst einen Debitor mit vollstaendiger Adresse zuordnen.",
      }));
      return;
    }

    if (!supplierInvoiceDate) {
      updateParticipant(participantId, (current) => ({
        ...current,
        createError: "Bitte ein Rechnungsdatum eintragen.",
      }));
      return;
    }

    if (!selectedCashAccountId) {
      updateParticipant(participantId, (current) => ({
        ...current,
        createError: "Kein Konto fuer Überweisung verfügbar.",
      }));
      return;
    }

    if (invoiceSendMode === "email" && !participant.debtorEmail.trim()) {
      updateParticipant(participantId, (current) => ({
        ...current,
        createError: "Für Versand per Mail wird eine E-Mail-Adresse benötigt.",
      }));
      return;
    }

    updateParticipant(participantId, (current) => ({
      ...current,
      creating: true,
      createError: null,
      invoiceId: current.invoiceId,
    }));

    try {
      const shippingShare = shippingByParticipant.get(participant.id) ?? 0;
      const invoiceCreationDate = getTodayDateString();
      const dueDate = calculateDueDate(invoiceCreationDate, dueDays);
      const body = {
        invoiceId: participant.invoiceId ?? undefined,
        debtorName: participant.debtorName,
        customerNumber: participant.debtorAccount,
        address: {
          country: participant.debtorAddress.country || "DE",
          state: participant.debtorAddress.state || undefined,
          zip: participant.debtorAddress.zip || "",
          city: participant.debtorAddress.city || "",
          addressLine: participant.debtorAddress.addressLine || "",
          details1: participant.debtorAddress.details1 || undefined,
          details2: participant.debtorAddress.details2 || undefined,
        },
        email: participant.debtorEmail || undefined,
        paymentMethod: "sepaCreditTransfer",
        paymentCashAccountId: selectedCashAccountId,
        costCenter1: DEFAULT_COST_CENTER1,
        positionAccount: 12000,
        invoiceDate: supplierInvoiceDate,
        dueDate: dueDate || undefined,
        deliveryDate: supplierInvoiceDate,
        title: "Rechnung",
        intro: `Materialbestellung aus Sammelrechnung ${supplierInvoiceNumber || ""}`.trim(),
        description: `Aufgeteilt aus Lieferantenrechnung ${supplierName || "Lieferant"} ${supplierInvoiceNumber || ""}`.trim(),
        note: `Besteller: ${participant.name}`,
        isNet: true,
        paid: false,
        sendByMail: invoiceSendMode === "email",
        positions: [
          ...participant.positions.map((position) => ({
            description: position.description,
            details: position.articleDescription || "",
            unit: position.unit,
            quantity: Math.max(parseNumberInput(position.quantity), 0),
            unitAmount: Math.max(
              Math.round(parseNumberInput(position.unitAmountEuro) * 100),
              0,
            ),
            taxCode: globalTaxRate,
            costCenter2: selectedCostCenter2,
          })),
          ...(shippingShare > 0
            ? [
                {
                  description: participant.shippingDescription || "Anteilige Lieferkosten",
                  unit: SHIPPING_UNIT,
                  quantity: 1,
                  unitAmount: Math.round(shippingShare * 100),
                  taxCode: globalTaxRate,
                  costCenter2: selectedCostCenter2,
                },
              ]
            : []),
        ],
      };

      const data = await fetchJson<{ id: string | null }>(
        "/api/campai/receipts/invoice",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      updateParticipant(participantId, (current) => ({
        ...current,
        creating: false,
        invoiceId: data.id ?? current.invoiceId ?? null,
        createError:
          data.id || current.invoiceId
            ? null
            : "Campai hat keine Rechnungs-ID zurueckgegeben.",
      }));
    } catch (error) {
      updateParticipant(participantId, (current) => ({
        ...current,
        creating: false,
        createError:
          error instanceof Error
            ? error.message
            : "Rechnung konnte nicht erstellt werden.",
      }));
    }
  };

  const handleCreateAll = async () => {
    setIsCreatingAll(true);
    try {
      for (const participant of participants) {
        await createInvoiceForParticipant(participant.id);
      }
    } finally {
      setIsCreatingAll(false);
    }
  };

  const taxRatePercent = Number(globalTaxRate);
  const nettoTotal = calculatedTotal;
  const mwstTotal = roundCurrency(nettoTotal * taxRatePercent / 100);
  const bruttoTotal = roundCurrency(nettoTotal + mwstTotal);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-28 md:px-0 md:py-0 md:pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Materialbestellung
        </h1>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-5 dark:border-indigo-800 dark:from-indigo-950/30 dark:to-blue-950/30">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-indigo-900 dark:text-indigo-200">PDF Auslesen</h2>
          <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-400">
            Hier kann die PDF vom Händler hochgeladen und ausgelesen werden. Die Positionen werden automatisch erkannt und müssen dann nur noch zugeordnet werden.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <FormField label="PDF-Rechnung">
              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </FormField>
          </div>
          <Button
            kind="primary"
            size="medium"
            icon={isParsing ? faRotate : faWandMagicSparkles}
            onClick={handleParse}
            disabled={!file || isParsing}
          >
            {isParsing ? "Wird ausgelesen…" : "E-Rechnung auslesen"}
          </Button>
          <button
            type="button"
            title="Zurücksetzen"
            onClick={resetEditor}
            disabled={isParsing}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <FontAwesomeIcon icon={faArrowRotateLeft} />
          </button>
        </div>
        {parseError ? <p className="mt-3 text-sm text-rose-600">{parseError}</p> : null}
        {issues.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {issues.map((issue, index) => (
              <p key={`${issue}-${index}`}>{issue}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-6" onBlurCapture={handleEditorBlurCapture}>

          {participants.length > 0 && (
            <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Lieferant</dt>
                <dd className="mt-0.5 font-medium">{supplierName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Rechnungsnummer</dt>
                <dd className="mt-0.5 font-medium">{supplierInvoiceNumber || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Rechnungsdatum</dt>
                <dd className="mt-0.5 font-medium">{supplierInvoiceDate ? formatStoredDate(`${supplierInvoiceDate}T00:00:00`) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Umsatzsteuer</dt>
                <dd className="mt-0.5 font-medium">
                  {toInputEuro(Math.round((totalAmountEuro - totalAmountEuro / (1 + parseInt(globalTaxRate) / 100)) * 100) / 100)} EUR ({globalTaxRate} %)
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Lieferkosten</dt>
                <dd className="mt-0.5 font-medium">{shippingAmountEuro} EUR</dd>
              </div>
              <div className="xl:text-right">
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">Gesamtbetrag</dt>
                <dd className="mt-0.5 font-medium">{toInputEuro(totalAmountEuro)} EUR</dd>
              </div>
            </dl>
          )}

          <FormSection
            title="Einstellungen Teilrechnungen"
            description="Diese Einstellungen gelten für alle Teilrechnungen dieser Bestellung."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormField label="Fälligkeit (ab Erstellung)">
                <Select
                  value={dueDays}
                  onChange={(event) => setDueDays(event.target.value as MaterialOrderDueDays)}
                >
                  <option value="7">7 Tage</option>
                  <option value="10">10 Tage</option>
                  <option value="14">14 Tage</option>
                  <option value="30">30 Tage</option>
                </Select>
              </FormField>
              <FormField label="Rechnungsversand">
                <Select
                  value={invoiceSendMode}
                  onChange={(event) =>
                    setInvoiceSendMode(event.target.value as MaterialOrderInvoiceSendMode)
                  }
                >
                  <option value="none">Kein Versand</option>
                  <option value="email">Versand per Mail</option>
                </Select>
              </FormField>
              <FormField label="Lieferkosten gesamt in EUR">
                <Input
                  value={shippingAmountEuro}
                  disabled
                />
              </FormField>
              <FormField label="Werkbereich">
                <Select
                  value={selectedCostCenter2}
                  onChange={(event) => setSelectedCostCenter2(event.target.value)}
                  disabled={costCenter2Options.length === 0}
                >
                  {costCenter2Options.length === 0 ? (
                    <option value={HOLZ_COST_CENTER2}>Wird geladen…</option>
                  ) : (
                    costCenter2Options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </Select>
              </FormField>
              <FormField label="Lieferkosten verteilen">
                <Select
                  value={shippingMode}
                  onChange={(event) => setShippingMode(event.target.value as ShippingMode)}
                >
                  <option value="equal">Gleichmäßig pro Person</option>
                  <option value="byValue">Nach Positionswert</option>
                  <option value="manual">Manuell</option>
                </Select>
              </FormField>
              <FormField label="MwSt">
                <Select
                  value={globalTaxRate}
                  onChange={(event) => setGlobalTaxRate(event.target.value as TaxRate)}
                >
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                  <option value="19">19%</option>
                </Select>
              </FormField>
            </div>

            {bankConnectionsError ? (
              <p className="text-sm text-rose-600">{bankConnectionsError}</p>
            ) : null}
          </FormSection>

          {unassignedPositions.length > 0 && (
            <FormSection title={`Nicht Zugeordnet (${unassignedPositions.length})`} description="Weise jede Position einem Mitbesteller zu.">
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Artikelbezeichnung</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Artikelbeschreibung</th>
                      <th className="w-52 px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">Zuweisen an</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {unassignedPositions.map((position) => (
                      <tr key={position.id}>
                        <td className="px-3 py-2 font-medium">{position.description}</td>
                        <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{position.articleDescription || <span className="italic">—</span>}</td>
                        <td className="px-3 py-2">
                          <Select
                            value=""
                            disabled={participants.length === 0}
                            onChange={(event) => {
                              if (event.target.value) assignPositionToParticipant(position.id, event.target.value);
                            }}
                          >
                            <option value="">{participants.length === 0 ? "Erst Mitbesteller anlegen" : "Person auswählen …"}</option>
                            {participants.map((participant) => (
                              <option key={participant.id} value={participant.id}>
                                {participant.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormSection>
          )}

          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {`Mitbesteller${participants.length > 0 ? ` (${participants.length})` : ""}`}
                </h2>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Pro Person werden Positionen und Lieferkostenanteil aufgeteilt.</p>
              </div>
              <Button
                kind="secondary"
                size="small"
                icon={faPlus}
                onClick={() =>
                  setParticipants((current) => [...current, createEmptyParticipant()])
                }
              >
                Person hinzufügen
              </Button>
            </header>
          <div className="space-y-5">

            {participants.map((participant) => {
              const subtotal = sumParticipantSubtotal(participant);
              const shippingShare = shippingByParticipant.get(participant.id) ?? 0;
              const total = roundCurrency(subtotal + shippingShare);

              return (
                <section
                  key={participant.id}
                  className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex w-full flex-wrap items-center gap-3">
                    <div className="max-w-sm flex-none">
                      <AutocompleteInput
                        apiPath="/api/campai/debtors"
                        entityLabelSingular="Debitor"
                        placeholder="Debitor suchen"
                        value={participant.debtorName}
                        onChange={(event) =>
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            debtorName: event.target.value,
                            debtorAccount: null,
                            debtorAddress: null,
                            debtorEmail: "",
                            invoiceId: null,
                          }))
                        }
                        onSelect={(suggestion) => {
                          updateParticipant(participant.id, (current) => ({
                            ...current,
                            name: suggestion.name,
                            debtorName: suggestion.name,
                            debtorAccount: suggestion.account,
                          }));
                          void fetchDebtorDetails(participant.id, suggestion.account);
                        }}
                      />
                    </div>
                    {participant.debtorAccount ? (
                      <div className="min-w-0 text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">#{participant.debtorAccount}</span>
                        {participant.debtorAddress ? (
                          <span className="ml-2">{participant.debtorAddress.addressLine || ""}, {participant.debtorAddress.zip || ""} {participant.debtorAddress.city || ""}</span>
                        ) : null}
                        {participant.debtorEmail ? (
                          <span className="ml-2">{participant.debtorEmail}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">Kein Debitor zugeordnet</span>
                    )}
                    {participant.invoiceId ? (
                      <p className="ml-auto whitespace-nowrap text-sm text-emerald-700 dark:text-emerald-300">
                        In Campai erstellt ✓
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                        <thead className="bg-zinc-50 dark:bg-zinc-900/70">
                          <tr>
                            <th className="px-3 py-2 text-left">Posten</th>
                            <th className="w-16 px-3 py-2 text-left">Menge</th>
                            <th className="w-20 px-3 py-2 text-left">Einheit</th>
                            <th className="w-28 px-3 py-2 text-left">Einzelpreis</th>
                            <th className="w-28 px-3 py-2 text-left">Gesamtpreis</th>
                            <th className="w-20 px-3 py-2 text-right">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {participant.positions.map((position) => (
                            <Fragment key={position.id}>
                            <tr className="align-top position-row">
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1">
                                <Input
                                  value={position.description}
                                  className="min-w-0 whitespace-nowrap"
                                  onChange={(event) =>
                                    updateParticipant(participant.id, (current) => ({
                                      ...current,
                                      positions: current.positions.map((entry) =>
                                        entry.id === position.id
                                          ? { ...entry, description: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                />
                                <Input
                                  placeholder="Details"
                                  className="min-w-0 whitespace-nowrap text-xs text-zinc-500 placeholder:text-zinc-400 dark:text-zinc-400"
                                  value={position.articleDescription}
                                  onChange={(event) =>
                                    updateParticipant(participant.id, (current) => ({
                                      ...current,
                                      positions: current.positions.map((entry) =>
                                        entry.id === position.id
                                          ? { ...entry, articleDescription: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                />
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  value={position.quantity}
                                  onChange={(event) =>
                                    updateParticipant(participant.id, (current) => ({
                                      ...current,
                                      positions: current.positions.map((entry) =>
                                        entry.id === position.id
                                          ? { ...entry, quantity: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  value={position.unit}
                                  onChange={(event) =>
                                    updateParticipant(participant.id, (current) => ({
                                      ...current,
                                      positions: current.positions.map((entry) =>
                                        entry.id === position.id
                                          ? { ...entry, unit: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  value={position.unitAmountEuro}
                                  inputMode="decimal"
                                  title={euroAmountValidationMessage}
                                  onChange={(event) =>
                                    updateParticipant(participant.id, (current) => ({
                                      ...current,
                                      positions: current.positions.map((entry) =>
                                        entry.id === position.id
                                          ? { ...entry, unitAmountEuro: event.target.value }
                                          : entry,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input value={toInputEuro(calculatePositionTotal(position))} disabled />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="row-actions inline-flex gap-1">
                                  <div className="relative inline-flex">
                                    <button
                                      type="button"
                                      title="Position neu zuweisen"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={participants.length <= 1}
                                    >
                                      <FontAwesomeIcon icon={faRightLeft} />
                                    </button>
                                    {participants.length > 1 && (
                                      <select
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                        value={participant.id}
                                        onChange={(event) =>
                                          movePosition(participant.id, event.target.value, position.id)
                                        }
                                      >
                                        {participants.map((option) => (
                                          <option key={option.id} value={option.id}>
                                            {option.name}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    title="Position entfernen"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-xs text-rose-700 transition hover:bg-rose-50"
                                    onClick={() =>
                                      updateParticipant(participant.id, (current) => ({
                                        ...current,
                                        positions: current.positions.filter(
                                          (entry) => entry.id !== position.id,
                                        ),
                                      }))
                                    }
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            </Fragment>
                          ))}
                          <tr className="position-row align-top">
                            <td className="px-3 py-2">
                              <Input
                                value={participant.shippingDescription}
                                onChange={(event) =>
                                  updateParticipant(participant.id, (current) => ({
                                    ...current,
                                    shippingDescription: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input value="1" disabled />
                            </td>
                            <td className="px-3 py-2">
                              <Input value={SHIPPING_UNIT} disabled />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={
                                  shippingMode === "manual"
                                    ? participant.manualShippingShareEuro
                                    : toInputEuro(shippingShare)
                                }
                                disabled
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={
                                  shippingMode === "manual"
                                    ? participant.manualShippingShareEuro
                                    : toInputEuro(shippingShare)
                                }
                                disabled
                              />
                            </td>
                            <td className="px-3 py-2" />
                          </tr>
                        </tbody>
                      </table>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <Button
                          kind="secondary"
                          size="small"
                          icon={faPlus}
                          onClick={() =>
                            updateParticipant(participant.id, (current) => ({
                              ...current,
                              positions: [...current.positions, createEmptyPosition()],
                            }))
                          }
                        >
                          Neue Position
                        </Button>
                        <div className="text-sm">
                          <div className="flex justify-between gap-8 py-0.5 text-zinc-500 dark:text-zinc-400">
                            <span>Summe netto</span>
                            <span>{euroFormatter.format(total)}</span>
                          </div>
                          <div className="flex justify-between gap-8 py-0.5 text-zinc-500 dark:text-zinc-400">
                            <span>MwSt ({globalTaxRate}%)</span>
                            <span>{euroFormatter.format(roundCurrency(total * taxRatePercent / 100))}</span>
                          </div>
                          <div className="mt-0.5 flex justify-between gap-8 border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
                            <span>Summe brutto</span>
                            <span>{euroFormatter.format(roundCurrency(total + roundCurrency(total * taxRatePercent / 100)))}</span>
                          </div>
                        </div>
                      </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button
                      kind="danger-secondary"
                      size="small"
                      icon={faTrash}
                      onClick={() =>
                        setParticipants((current) =>
                          current.filter((entry) => entry.id !== participant.id),
                        )
                      }
                    >
                      Person entfernen
                    </Button>
                    <div className="flex items-center gap-3">
                      {participant.createError ? (
                        <p className="text-sm text-rose-600">{participant.createError}</p>
                      ) : null}
                      {participant.invoiceId ? (
                        <Button
                          kind="secondary"
                          size="small"
                          icon={faFilePdf}
                          className="h-8 w-8 px-0"
                          title="PDF anzeigen"
                          aria-label="PDF anzeigen"
                          onClick={() => {
                            window.open(
                              `/api/campai/invoices/${participant.invoiceId}/download`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          <span className="sr-only">PDF anzeigen</span>
                        </Button>
                      ) : null}
                      <Button
                        kind="secondary"
                        size="small"
                        icon={faFileArrowUp}
                        onClick={() => void createInvoiceForParticipant(participant.id)}
                        disabled={participant.creating}
                      >
                        {participant.creating
                          ? participant.invoiceId
                            ? "Aktualisiere..."
                            : "Erstelle..."
                          : participant.invoiceId
                            ? "Teilrechnung aktualisieren"
                            : "Teilrechnung erzeugen"}
                      </Button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          </section>
      </div>

      <div className="sticky bottom-4 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Netto: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{euroFormatter.format(nettoTotal)}</span>
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            MwSt. ({globalTaxRate}%): <span className="font-semibold text-zinc-900 dark:text-zinc-100">{euroFormatter.format(mwstTotal)}</span>
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Brutto gesamt: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{euroFormatter.format(bruttoTotal)}</span>
          </p>
          {participants.length > 0 ? (
            <p
              className={`ml-auto text-sm ${
                saveError
                  ? "text-rose-600"
                  : savingDraft
                    ? "text-amber-700 dark:text-amber-400"
                    : hasUnsavedChanges
                      ? "text-zinc-600 dark:text-zinc-300"
                    : "text-emerald-700"
              }`}
              aria-live="polite"
            >
              {saveError
                ? saveError
                : savingDraft
                  ? "Speichert Änderungen…"
                  : hasUnsavedChanges
                    ? "Noch nicht gespeichert"
                    : saveMessage ?? "Alle Änderungen gespeichert"}
            </p>
          ) : null}
          {participants.length > 0 ? (
            <Button
              kind="primary"
              size="small"
              icon={faUser}
              onClick={() => void handleCreateAll()}
              disabled={isCreatingAll}
            >
              {isCreatingAll ? "Erzeuge alle Rechnungen…" : "Alle Teilrechnungen erzeugen"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
