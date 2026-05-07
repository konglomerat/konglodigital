"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faFileImport,
  faFolderOpen,
  faPlus,
  faTable,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import ReceiptsPageHeader from "../create/header";
import {
  AutocompleteInput,
  type Suggestion,
} from "../../components/ui/autocomplete-input";
import DebtorCreatePanel from "../../components/ui/debtor-create-panel";
import { FormField, FormSection, Input, Select } from "../../components/ui/form";

import type {
  PretixDocument,
  PretixEvent,
  PretixRow,
} from "./types";

const STATUS_LABELS: Record<string, string> = {
  p: "Bezahlt",
  n: "Ausstehend",
  c: "Storniert",
  e: "Abgelaufen",
};

const POSITION_DESCRIPTION_TITLE = "Rechnung";
const DEFAULT_COST_CENTER_2 = "54";
const DEFAULT_TRANSFER_ACCOUNT = "17100";
const ADDRESS_REQUIRED_THRESHOLD_CENTS = 25_000;

type BankConnectionOption = {
  value: string;
  label: string;
  account?: string;
};

type CostCenter2Option = {
  value: string;
  label: string;
};

const parseTaxRate = (raw: unknown): 0 | 7 | 19 => {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : NaN;
  const rounded = Math.round(value);
  if (rounded === 7) return 7;
  if (rounded === 19) return 19;
  return 0;
};

const toCents = (raw: unknown): number => {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : NaN;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
};

const formatTotal = (raw: unknown): string => {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : NaN;
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
};

const buildRows = (event: PretixEvent | undefined): PretixRow[] => {
  if (!event) return [];
  const itemsById = new Map<number, string>();
  for (const item of event.items ?? []) {
    itemsById.set(item.id, item.name);
  }

  const rows: PretixRow[] = [];
  for (const order of event.orders ?? []) {
    for (const position of order.positions ?? []) {
      rows.push({
        key: `${order.code}#${position.id}`,
        orderCode: order.code,
        user: order.user ?? "",
        email: order.email ?? "",
        totalAmountCents: toCents(order.total),
        totalDisplay: formatTotal(order.total),
        status: order.status,
        statusLabel: STATUS_LABELS[order.status] ?? order.status,
        attendeeName: position.attendee_name ?? "",
        itemName: itemsById.get(position.item) ?? `Item ${position.item}`,
        unitAmountCents: toCents(position.price),
        taxRate: parseTaxRate(position.tax_rate),
        eventName: event.name ?? "",
        eventSlug: event.slug ?? "",
      });
    }
  }
  return rows;
};

type DebtorSelection = { account: number; name: string };

type CreatePanelState = {
  key: string;
  name: string;
  email: string;
};

type RowResult = {
  key: string;
  ok: boolean;
  message: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const parseIntegerSetting = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
};

export default function PretixImportPage() {
  const [event, setEvent] = useState<PretixEvent | undefined>();
  const [rows, setRows] = useState<PretixRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [debtorByKey, setDebtorByKey] = useState<Map<string, DebtorSelection>>(
    new Map(),
  );
  const [createPanel, setCreatePanel] = useState<CreatePanelState | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string>("");
  const [selectedCostCenter2, setSelectedCostCenter2] =
    useState<string>(DEFAULT_COST_CENTER_2);
  const [invoiceDate, setInvoiceDate] = useState<string>(todayISO());
  const [serviceDate, setServiceDate] = useState<string>(todayISO());
  const [bankConnectionOptions, setBankConnectionOptions] = useState<
    BankConnectionOption[]
  >([]);
  const [costCenter2Options, setCostCenter2Options] = useState<CostCenter2Option[]>(
    [],
  );
  const [invoiceSettingsError, setInvoiceSettingsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/campai/bank-connections"),
      fetch("/api/campai/cost-centers"),
    ])
      .then(async ([bankResponse, costCenterResponse]) => {
        const bankPayload = (await bankResponse.json().catch(() => ({}))) as {
          bankConnections?: BankConnectionOption[];
          error?: string;
        };
        const costCenterPayload =
          (await costCenterResponse.json().catch(() => ({}))) as {
            costCenters?: CostCenter2Option[];
            error?: string;
          };
        if (!active) return;

        if (!bankResponse.ok) {
          setInvoiceSettingsError(
            bankPayload.error ?? "Bankkonten konnten nicht geladen werden.",
          );
          return;
        }

        if (!costCenterResponse.ok) {
          setInvoiceSettingsError(
            costCenterPayload.error ??
              "Kostenstellen konnten nicht geladen werden.",
          );
          return;
        }

        const bankConnections = bankPayload.bankConnections ?? [];
        setBankConnectionOptions(bankConnections);
        const preferredAccount = bankConnections.find(
          (item) => item.account === DEFAULT_TRANSFER_ACCOUNT,
        );
        setSelectedCashAccountId(
          preferredAccount?.value ?? bankConnections[0]?.value ?? "",
        );

        const costCenters = costCenterPayload.costCenters ?? [];
        setCostCenter2Options(costCenters);
        const preferredCostCenter = costCenters.find(
          (item) => item.value === DEFAULT_COST_CENTER_2,
        );
        setSelectedCostCenter2(
          preferredCostCenter?.value ?? costCenters[0]?.value ?? DEFAULT_COST_CENTER_2,
        );

        if (bankConnections.length === 0) {
          setInvoiceSettingsError(
            "Kein Konto für Überweisungen verfügbar. Rechnungen können nicht erstellt werden.",
          );
          return;
        }

        setInvoiceSettingsError(null);
      })
      .catch((error) => {
        if (!active) return;
        setInvoiceSettingsError(
          error instanceof Error
            ? error.message
            : "Rechnungseinstellungen konnten nicht geladen werden.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const handleFileChange = useCallback(
    async (file: File | null) => {
      setParseError(null);
      setEvent(undefined);
      setRows([]);
      setSelectedKeys(new Set());
      setDebtorByKey(new Map());
      setCreatePanel(null);
      setResults([]);
      if (!file) {
        setFileName("");
        return;
      }
      setFileName(file.name);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as PretixDocument;
        if (!parsed?.event || !Array.isArray(parsed.event.orders)) {
          throw new Error("Keine pretix-Buchungen in der Datei gefunden.");
        }
        const built = buildRows(parsed.event);
        setEvent(parsed.event);
        setRows(built);
      } catch (error) {
        setParseError(
          error instanceof Error
            ? error.message
            : "JSON konnte nicht gelesen werden.",
        );
      }
    },
    [],
  );

  const allSelected = rows.length > 0 && selectedKeys.size === rows.length;

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((row) => row.key));
    });
  }, [rows]);

  const toggleRow = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleDebtorSelect = useCallback(
    (key: string) => (suggestion: Suggestion) => {
      setDebtorByKey((prev) => {
        const next = new Map(prev);
        next.set(key, { account: suggestion.account, name: suggestion.name });
        return next;
      });
      setCreatePanel((current) =>
        current && current.key === key ? null : current,
      );
    },
    [],
  );

  const handleDebtorCreateNew = useCallback(
    (key: string, row: PretixRow) => (name: string) => {
      setCreatePanel({
        key,
        name,
        email: row.email,
      });
    },
    [],
  );

  const clearDebtor = useCallback((key: string) => {
    setDebtorByKey((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const selectedRowsMissingDebtor = useMemo(
    () =>
      Array.from(selectedKeys).some((key) => !debtorByKey.has(key)),
    [selectedKeys, debtorByKey],
  );

  const parsedCostCenter2 = useMemo(
    () => parseIntegerSetting(selectedCostCenter2),
    [selectedCostCenter2],
  );

  const invoiceSettingsValidationMessage = useMemo(() => {
    if (!selectedCashAccountId) {
      return "Bitte ein Zahlungskonto auswählen.";
    }
    if (!invoiceDate) {
      return "Bitte ein Rechnungsdatum eintragen.";
    }
    if (!serviceDate) {
      return "Bitte ein Servicedatum eintragen.";
    }
    if (parsedCostCenter2 == null) {
      return "Werkbereich muss eine gültige Kostenstelle sein.";
    }
    return null;
  }, [
    invoiceDate,
    parsedCostCenter2,
    selectedCashAccountId,
    serviceDate,
  ]);

  const submit = useCallback(async () => {
    if (!selectedCashAccountId || !invoiceDate || !serviceDate) return;
    if (parsedCostCenter2 == null) {
      return;
    }
    if (selectedKeys.size === 0) return;
    setSubmitting(true);
    setResults([]);
    const queue = rows.filter((row) => selectedKeys.has(row.key));
    const newResults: RowResult[] = [];
    for (const row of queue) {
      const debtor = debtorByKey.get(row.key);
      if (!debtor) {
        newResults.push({
          key: row.key,
          ok: false,
          message: "Kein Debitor ausgewählt.",
        });
        setResults([...newResults]);
        continue;
      }
      try {
        const debtorResponse = await fetch(
          `/api/campai/debtors?account=${encodeURIComponent(String(debtor.account))}`,
        );
        const debtorPayload = (await debtorResponse
          .json()
          .catch(() => ({}))) as {
          debtor?: {
            address?: {
              country?: string;
              zip?: string;
              city?: string;
              addressLine?: string;
              details1?: string | null;
              details2?: string | null;
              state?: string | null;
            } | null;
            email?: string;
          } | null;
          error?: string;
        };
        const address = debtorPayload.debtor?.address;
        const invoiceAddress = {
          country: address?.country || "DE",
          zip: address?.zip ?? "",
          city: address?.city ?? "",
          addressLine: address?.addressLine ?? "",
          details1: address?.details1 ?? undefined,
          details2: address?.details2 ?? undefined,
          state: address?.state ?? undefined,
        };
        const requiresDebtorAddress =
          row.unitAmountCents > ADDRESS_REQUIRED_THRESHOLD_CENTS;
        if (
          requiresDebtorAddress &&
          (!address?.zip || !address.city || !address.addressLine)
        ) {
          newResults.push({
            key: row.key,
            ok: false,
            message:
              "Debitor hat keine vollständige Adresse in Campai. Bitte dort ergänzen.",
          });
          setResults([...newResults]);
          continue;
        }

        const invoiceResponse = await fetch(
          "/api/campai/receipts/invoice",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              debtorName: debtor.name,
              customerNumber: debtor.account,
              address: invoiceAddress,
              email: row.email || debtorPayload.debtor?.email || "",
              doNotSendReceipt: true,
              sendByMail: false,
              title: POSITION_DESCRIPTION_TITLE,
              description: "",
              isNet: false,
              paid: false,
              paymentMethod: "sepaCreditTransfer",
              paymentCashAccountId: selectedCashAccountId,
              invoiceDate,
              deliveryDate: serviceDate,
              positions: [
                {
                  description: `${row.eventName} - ${row.itemName}`,
                  details: `${row.eventSlug.toUpperCase()}-${row.orderCode}`,
                  quantity: 1,
                  unit: "1",
                  unitAmount: row.unitAmountCents,
                  discount: 0,
                  taxCode: row.taxRate,
                  costCenter2: parsedCostCenter2,
                },
              ],
            }),
          },
        );
        const invoicePayload = (await invoiceResponse
          .json()
          .catch(() => ({}))) as {
          id?: string | null;
          error?: string;
          noteWarning?: string;
        };
        if (!invoiceResponse.ok) {
          newResults.push({
            key: row.key,
            ok: false,
            message:
              invoicePayload.error ??
              `Fehler beim Erstellen (HTTP ${invoiceResponse.status}).`,
          });
        } else {
          const idPart = invoicePayload.id ? ` (#${invoicePayload.id})` : "";
          const warningPart = invoicePayload.noteWarning
            ? ` — ${invoicePayload.noteWarning}`
            : "";
          newResults.push({
            key: row.key,
            ok: true,
            message: `Rechnung erstellt${idPart}${warningPart}`,
          });
        }
      } catch (error) {
        newResults.push({
          key: row.key,
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Unbekannter Fehler beim Erstellen.",
        });
      }
      setResults([...newResults]);
    }
    setSubmitting(false);
  }, [
    debtorByKey,
    invoiceDate,
    parsedCostCenter2,
    rows,
    selectedCashAccountId,
    selectedKeys,
    serviceDate,
  ]);

  const submitDisabled =
    submitting ||
    selectedKeys.size === 0 ||
    selectedRowsMissingDebtor ||
    !!invoiceSettingsError ||
    !!invoiceSettingsValidationMessage;

  const resultByKey = useMemo(() => {
    const map = new Map<string, RowResult>();
    for (const result of results) map.set(result.key, result);
    return map;
  }, [results]);

  const createPanelRow = useMemo(
    () => rows.find((row) => row.key === createPanel?.key),
    [createPanel?.key, rows],
  );

  return (
    <BookingPageShell>
      <ReceiptsPageHeader
        title="pretix Bulk Import"
        description="Lade einen Pretix-Export (JSON) hoch, wähle Buchungen aus und erstelle daraus Rechnungen in Campai."
      />

      <FormSection title="Pretix-Export hochladen" icon={faFolderOpen}>
        <FormField label="JSON-Datei">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) =>
              void handleFileChange(e.target.files?.item(0) ?? null)
            }
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
          {fileName ? (
            <p className="mt-1 text-xs text-zinc-500">{fileName}</p>
          ) : null}
          {parseError ? (
            <p className="mt-1 text-xs text-rose-600">{parseError}</p>
          ) : null}
        </FormField>
      </FormSection>

      {rows.length > 0 ? (
        <>
          <FormSection
            title="Allgemeine Rechnungseinstellungen"
            description="Diese Einstellungen gelten für alle Rechnungen aus diesem Pretix-Import."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <FormField label="Rechnungsdatum" required>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </FormField>
              <FormField label="Servicedatum" required>
                <Input
                  type="date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                />
              </FormField>
              <FormField label="Zahlungskonto" required>
                <Select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  disabled={bankConnectionOptions.length === 0}
                >
                  {bankConnectionOptions.length === 0 ? (
                    <option value="">Wird geladen…</option>
                  ) : (
                    bankConnectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </Select>
              </FormField>
              <FormField label="Werkbereich" required>
                <Select
                  value={selectedCostCenter2}
                  onChange={(e) => setSelectedCostCenter2(e.target.value)}
                  disabled={costCenter2Options.length === 0}
                >
                  {costCenter2Options.length === 0 ? (
                    <option value={DEFAULT_COST_CENTER_2}>Wird geladen…</option>
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

            {invoiceSettingsError ? (
              <p className="text-sm text-rose-600">{invoiceSettingsError}</p>
            ) : null}
            {!invoiceSettingsError && invoiceSettingsValidationMessage ? (
              <p className="text-sm text-rose-600">
                {invoiceSettingsValidationMessage}
              </p>
            ) : null}
          </FormSection>

          <FormSection
            title={`Buchungen (${rows.length})`}
            icon={faTable}
            description={
              event?.name
                ? `Event: ${event.name}${event.slug ? ` (${event.slug})` : ""}`
                : undefined
            }
          >
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Alle auswählen"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Code
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    E-Mail
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Total
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Debitor
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    Ergebnis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {rows.map((row) => {
                  const debtor = debtorByKey.get(row.key);
                  const result = resultByKey.get(row.key);
                  return (
                    <tr key={row.key}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(row.key)}
                          onChange={() => toggleRow(row.key)}
                          aria-label={`${row.orderCode} auswählen`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-zinc-800">
                        {row.orderCode}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-zinc-800">
                        {row.email || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-zinc-800">
                        {row.totalDisplay}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-zinc-800">
                        {row.statusLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">
                        {debtor ? (
                          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                            <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                            #{debtor.account} {debtor.name}
                            <button
                              type="button"
                              className="ml-1 rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
                              onClick={() => clearDebtor(row.key)}
                              aria-label="Debitor entfernen"
                            >
                              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                            </button>
                          </span>
                        ) : (
                          <div className="min-w-[16rem]">
                            <AutocompleteInput
                              apiPath="/api/campai/debtors"
                              entityLabelSingular="Debitor"
                              placeholder={
                                row.attendeeName ||
                                row.user ||
                                "Name oder Kontonummer…"
                              }
                              showCreateOption
                              onSelect={handleDebtorSelect(row.key)}
                              onCreateNew={handleDebtorCreateNew(row.key, row)}
                            />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {result ? (
                          <span
                            className={
                              result.ok
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }
                          >
                            {result.message}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {createPanel ? (
            <DebtorCreatePanel
              className="mt-4"
              initialName={createPanel.name}
              email={createPanel.email}
              addressRequirementHint={
                (createPanelRow?.unitAmountCents ?? 0) >
                  ADDRESS_REQUIRED_THRESHOLD_CENTS
                  ? "Ab Beträgen über 250 € ist die vollständige Adresse Pflicht."
                  : undefined
              }
              onCancel={() => setCreatePanel(null)}
              onCreated={(result) => {
                setDebtorByKey((prev) => {
                  const next = new Map(prev);
                  next.set(createPanel.key, {
                    account: result.account,
                    name: result.name,
                  });
                  return next;
                });
                setCreatePanel(null);
              }}
            />
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {selectedKeys.size} ausgewählt
              {selectedRowsMissingDebtor
                ? " — nicht alle ausgewählten Buchungen haben einen Debitor."
                : ""}
              {!selectedRowsMissingDebtor && invoiceSettingsValidationMessage
                ? ` — ${invoiceSettingsValidationMessage}`
                : ""}
            </p>
            <Button
              type="button"
              kind="primary"
              icon={faFileImport}
              disabled={submitDisabled}
              onClick={() => void submit()}
            >
              {submitting
                ? "Erstelle Rechnungen…"
                : `Rechnungen erstellen (${selectedKeys.size})`}
            </Button>
          </div>
          </FormSection>
        </>
      ) : null}
    </BookingPageShell>
  );
}
