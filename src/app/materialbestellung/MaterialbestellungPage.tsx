"use client";

import { useEffect, useMemo, useState } from "react";
import {
  faFileArrowUp,
  faFloppyDisk,
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
import { normalizeInvoiceDateString, type MaterialInvoiceParseResult } from "@/lib/material-invoice";

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

const HOLZ_COST_CENTER2 = "50";
const DEFAULT_TRANSFER_ACCOUNT = "17100";

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
  quantity: "1",
  unit: "Stk",
  unitAmountEuro: "",
});

const createEmptyParticipant = (): MaterialOrderEditableParticipant => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "Neue Person",
  confidence: "low",
  positions: [createEmptyPosition()],
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
    confidence: participant.confidence,
    positions: participant.positions.map((position, positionIndex) => ({
      id: position.id || `${participant.id}-${positionIndex}`,
      description: position.description,
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
  const [supplierName, setSupplierName] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
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

  const resetEditor = () => {
    setCurrentOrderId(null);
    setParticipants([]);
    setSupplierName("");
    setSupplierInvoiceNumber("");
    setSupplierInvoiceDate("");
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
      setCurrentOrderId(null);
      setSupplierName(parsed.supplierName);
      setSupplierInvoiceNumber(parsed.supplierInvoiceNumber);
      setSupplierInvoiceDate(normalizeInvoiceDateString(parsed.supplierInvoiceDate));
      setShippingAmountEuro(toInputEuro(parsed.shippingAmountEuro));
      setGlobalTaxRate(
        String(parsed.participants[0]?.positions[0]?.taxRate ?? 19) as TaxRate,
      );
      setIssues(parsed.issues ?? []);
      setParticipants(buildParticipantsFromParse(parsed));
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "PDF konnte nicht analysiert werden.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const saveDraft = async () => {
    if (participants.length === 0) {
      setSaveError("Es gibt noch keine aufgeteilte Materialbestellung zum Speichern.");
      return;
    }

    try {
      setSavingDraft(true);
      setSaveError(null);
      setSaveMessage(null);

      const draft = buildDraft({
        supplierName,
        supplierInvoiceNumber,
        supplierInvoiceDate,
        dueDays,
        invoiceSendMode,
        shippingAmountEuro,
        shippingMode,
        globalTaxRate,
        issues,
        participants,
      });

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

      setCurrentOrderId(data.id);
      setSaveMessage("Materialbestellung gespeichert.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Materialbestellung konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const openSavedOrder = async (orderId: string) => {
    try {
      setSaveError(null);
      setSaveMessage(null);

      const data = await fetchJson<{
        draft: MaterialOrderDraft | null;
        order: MaterialOrderSummary | null;
      }>(`/api/materialbestellung/orders?id=${orderId}`);

      if (!data.draft) {
        throw new Error("Gespeicherte Materialbestellung konnte nicht geladen werden.");
      }

      setCurrentOrderId(orderId);
      setSupplierName(data.draft.supplierName);
      setSupplierInvoiceNumber(data.draft.supplierInvoiceNumber);
      setSupplierInvoiceDate(data.draft.supplierInvoiceDate);
      setDueDays(data.draft.dueDays);
      setInvoiceSendMode(data.draft.invoiceSendMode);
      setShippingAmountEuro(data.draft.shippingAmountEuro);
      setShippingMode(data.draft.shippingMode);
      setGlobalTaxRate(data.draft.globalTaxRate);
      setIssues(data.draft.issues);
      setParticipants(
        data.draft.participants.map((participant) => ({
          ...participant,
          shippingDescription: participant.shippingDescription ?? "Anteilige Lieferkosten",
          createError: null,
          creating: false,
        })),
      );
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
      invoiceId: null,
    }));

    try {
      const shippingShare = shippingByParticipant.get(participant.id) ?? 0;
      const dueDate = calculateDueDate(supplierInvoiceDate, dueDays);
      const body = {
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
                  unit: "Pauschale",
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
        "/api/campai/invoices/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      updateParticipant(participantId, (current) => ({
        ...current,
        creating: false,
        invoiceId: data.id ?? null,
        createError: data.id ? null : "Campai hat keine Rechnungs-ID zurueckgegeben.",
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
          <h2 className="text-base font-semibold text-indigo-900 dark:text-indigo-200">PDF-Analyse (KI)</h2>
          <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-400">
            Rechnung vom Händler als PDF uploaden und automatisch auswerten und aufteilen lassen. Kann danach noch manuell angepasst werden.
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
            {isParsing ? "Wird analysiert…" : "PDF analysieren"}
          </Button>
          <Button
            kind="secondary"
            size="medium"
            icon={faRotate}
            onClick={resetEditor}
            disabled={isParsing}
          >
            Erneut analysieren
          </Button>
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

      <div className="space-y-6">
          <FormSection
            title="Rechnungsdaten"
            description="Globale Rechnungsdaten für diese Materialbestellung."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormField label="Lieferant">
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
              </FormField>
              <FormField label="Lieferanten-Rechnungsnummer">
                <Input
                  value={supplierInvoiceNumber}
                  onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
                />
              </FormField>
              <FormField label="Rechnungsdatum">
                <Input
                  type="date"
                  value={supplierInvoiceDate}
                  onChange={(event) => setSupplierInvoiceDate(event.target.value)}
                />
              </FormField>
              <FormField label="Faelligkeit">
                <Select
                  value={dueDays}
                  onChange={(event) => setDueDays(event.target.value as MaterialOrderDueDays)}
                >
                  <option value="7">7 Tage ab Rechnungsdatum</option>
                  <option value="10">10 Tage ab Rechnungsdatum</option>
                  <option value="14">14 Tage ab Rechnungsdatum</option>
                  <option value="30">30 Tage ab Rechnungsdatum</option>
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
                  onChange={(event) => setShippingAmountEuro(event.target.value)}
                />
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
              <FormField label="bezahlt von Werkbereich">
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
            </div>

            {saveError ? <p className="text-sm text-rose-600">{saveError}</p> : null}
            {saveMessage ? <p className="text-sm text-emerald-700">{saveMessage}</p> : null}
            {bankConnectionsError ? (
              <p className="text-sm text-rose-600">{bankConnectionsError}</p>
            ) : null}
          </FormSection>

          <FormSection title={`Mitbesteller${participants.length > 0 ? ` (${participants.length})` : ""}`} description="Pro Person werden Positionen und Lieferkostenanteil aufgeteilt.">
          <div className="space-y-5">
            {participants.length > 0 ? (
              <div className="flex justify-end">
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
              </div>
            ) : null}

            {participants.map((participant) => {
              const subtotal = sumParticipantSubtotal(participant);
              const shippingShare = shippingByParticipant.get(participant.id) ?? 0;
              const total = roundCurrency(subtotal + shippingShare);

              return (
                <section
                  key={participant.id}
                  className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={participant.name}
                      onChange={(event) =>
                        updateParticipant(participant.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="max-w-sm"
                    />
                    <span className="whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      KI-Zuordnung: {participant.confidence}
                    </span>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
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
                            <tr key={position.id}>
                              <td className="px-3 py-2">
                                <Input
                                  value={position.description}
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
                                <Input value={toInputEuro(calculatePositionTotal(position))} readOnly />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="inline-flex gap-1">
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
                          ))}
                          <tr className="bg-amber-50/60 dark:bg-amber-900/10">
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
                              <Input value="1" readOnly />
                            </td>
                            <td className="px-3 py-2">
                              <Input value="Pauschale" readOnly />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={
                                  shippingMode === "manual"
                                    ? participant.manualShippingShareEuro
                                    : toInputEuro(shippingShare)
                                }
                                readOnly
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={
                                  shippingMode === "manual"
                                    ? participant.manualShippingShareEuro
                                    : toInputEuro(shippingShare)
                                }
                                readOnly
                              />
                            </td>
                            <td className="px-3 py-2" />
                          </tr>
                        </tbody>
                      </table>
                      </div>
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
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/70">
                        <div className="flex justify-between py-0.5">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Summe netto</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{euroFormatter.format(total)}</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">MwSt ({globalTaxRate}%)</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{euroFormatter.format(roundCurrency(total * taxRatePercent / 100))}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-700">
                          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Summe brutto</span>
                          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{euroFormatter.format(roundCurrency(total + roundCurrency(total * taxRatePercent / 100)))}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                      <FormField label="Debitor zuordnen">
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
                              debtorName: suggestion.name,
                              debtorAccount: suggestion.account,
                            }));
                            void fetchDebtorDetails(participant.id, suggestion.account);
                          }}
                        />
                      </FormField>

                      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                        <div className="font-medium">
                          {participant.debtorAccount
                            ? `Debitor #${participant.debtorAccount}`
                            : "Noch kein Debitor zugeordnet"}
                        </div>
                        {participant.debtorEmail ? <div>{participant.debtorEmail}</div> : null}
                        <div>
                          {participant.debtorAddress
                            ? `${participant.debtorAddress.addressLine || ""}, ${participant.debtorAddress.zip || ""} ${participant.debtorAddress.city || ""}`
                            : "Adresse wird nach Debitor-Auswahl geladen"}
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
                      {participant.invoiceId ? (
                        <p className="text-sm text-emerald-700">
                          In Campai erstellt: {participant.invoiceId}
                        </p>
                      ) : null}
                      {participant.createError ? (
                        <p className="text-sm text-rose-600">{participant.createError}</p>
                      ) : null}
                      <Button
                        kind="outline"
                        size="small"
                        icon={faFileArrowUp}
                        onClick={() => void createInvoiceForParticipant(participant.id)}
                        disabled={participant.creating}
                      >
                        {participant.creating ? "Erstelle..." : "Teilrechnung erzeugen"}
                      </Button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          </FormSection>
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
          <Button
            kind="secondary"
            size="small"
            icon={faFloppyDisk}
            onClick={() => void saveDraft()}
            disabled={savingDraft || participants.length === 0}
            className="ml-auto"
          >
            {savingDraft ? "Speichert…" : "Speichern"}
          </Button>
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
