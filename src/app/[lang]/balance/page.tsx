"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSort,
  faSortDown,
  faSortUp,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

import ReactSelect from "@/app/[lang]/components/ui/react-select";
import type {
  CampaiBalanceReceipt,
  CampaiReceiptPosition,
} from "@/lib/campai-balance-receipts";

type CostCenterOption = {
  value: string;
  label: string;
};

type PaymentStatusTone = "paid" | "partial" | "unpaid" | "default";
type SortKey = "paidAt" | "receiptDate" | "createdAt" | "income" | "expense";
type SortDirection = "asc" | "desc";

const ALL_COST_CENTERS_OPTION: CostCenterOption = {
  value: "__ALL__",
  label: "Alle",
};

const INCOME_TYPES = new Set(["revenue", "invoice", "donation", "deposit"]);
const EXPENSE_TYPES = new Set(["expense"]);
const EXCLUDED_TYPES = new Set(["offer"]);

const TYPE_LABELS: Record<string, string> = {
  expense: "Ausgabe",
  revenue: "Einnahme",
  invoice: "Rechnung",
  deposit: "Einzahlung",
  donation: "Spende",
  confirmation: "Bestätigung",
  refund: "Rückerstattung",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unbezahlt",
  partial: "Teilweise bezahlt",
  paid: "Bezahlt",
};

const COST_CENTER1_SHORT_LABELS: Record<string, string> = {
  "Ideeller Bereich": "Ideell",
  Vermögensverwaltung: "Vermögen",
  Zweckbetrieb: "Zweckbetrieb",
  "Wirtschaftlicher Geschäftsbetrieb": "Wirtsch. Geschäftsbetrieb",
  Sammelposten: "Sammelposten",
};

const formatCents = (cents: number): string => {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${euros.toLocaleString("de-DE")},${String(rest).padStart(2, "0")} €`;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${day}.${month}.${year}`;
};

const formatDateTime = (value: string | null): string => {
  return formatDate(value);
};

const formatFirstPositionField = (
  positions: CampaiReceiptPosition[],
  field: keyof CampaiReceiptPosition,
  labelMap: Map<string, string>,
): string => {
  const firstPosition = positions[0];
  if (!firstPosition) {
    return "—";
  }

  const value = firstPosition[field];
  if (value === null) {
    return "—";
  }

  const key = String(value);
  return labelMap.get(key) ?? key;
};

const getFirstPositionValue = (
  positions: CampaiReceiptPosition[],
  field: keyof CampaiReceiptPosition,
): string => {
  const firstPosition = positions[0];
  if (!firstPosition) {
    return "—";
  }

  const value = firstPosition[field];
  if (value === null) {
    return "—";
  }

  return String(value);
};

const formatAccountsWithAmounts = (
  positions: CampaiReceiptPosition[],
): string => {
  if (positions.length === 0) {
    return "—";
  }

  return positions
    .map((position) => {
      const label =
        position.accountLabel ??
        (position.account !== null ? `Konto ${position.account}` : "—");

      if (position.amount === null) {
        return label;
      }

      return `${label} (${formatCents(position.amount)})`;
    })
    .join(", ");
};

const getReceiptDescription = (receipt: CampaiBalanceReceipt): string => {
  if (receipt.description) {
    return receipt.description;
  }

  const firstPositionDescription = receipt.positions[0]?.description;
  return firstPositionDescription ?? "—";
};

const normalizePaymentStatusTone = (status: string | null): PaymentStatusTone => {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return "default";
  }

  if (normalized === "paid") {
    return "paid";
  }

  if (normalized === "partial") {
    return "partial";
  }

  if (normalized === "unpaid") {
    return "unpaid";
  }

  return "default";
};

const getPaymentStatusLabel = (status: string | null): string | null => {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return PAYMENT_STATUS_LABELS[normalized] ?? status;
};

const getTypeChipClassName = (type: string | null): string => {
  if (type && INCOME_TYPES.has(type)) {
    return "border-l-4 border-l-emerald-500 border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:border-l-emerald-400 dark:bg-zinc-900 dark:text-zinc-100";
  }
  if (type && EXPENSE_TYPES.has(type)) {
    return "border-l-4 border-l-rose-500 border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:border-l-rose-400 dark:bg-zinc-900 dark:text-zinc-100";
  }
  if (type === "refund") {
    return "border-l-4 border-l-amber-500 border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:border-l-amber-400 dark:bg-zinc-900 dark:text-zinc-100";
  }
  return "border-l-4 border-l-sky-500 border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:border-l-sky-400 dark:bg-zinc-900 dark:text-zinc-100";
};

const getPaymentStatusChipClassName = (status: string | null): string => {
  const tone = normalizePaymentStatusTone(status);

  if (tone === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (tone === "unpaid") {
    return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300";
  }
  if (tone === "partial") {
    return "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/50 dark:text-orange-300";
  }
  return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
};

const TABLE_HEADER_LABELS: Record<string, string> = {
  receiptDate: "BELEG DATUM",
  createdAt: "BUCHUNG DATUM",
  paidAt: "ZAHLUNGSDATUM",
  receiptNumber: "BELEG",
  pdf: "PDF",
  description: "BESCHREIBUNG",
  accountName: "SENDER/EMPFÄNGER",
  paymentAccounts: "ZAHLKONTO",
  type: "TYP",
  paymentStatus: "STATUS",
  tags: "TAGS",
  Sphäre: "SPHÄRE",
  "positions.account": "AUFTEILUNG",
};

const HEADER_WIDTH_CLASS_NAMES: Record<string, string> = {
  description: "w-[300px]",
  "positions.account": "w-[200px]",
};

const CELL_TEXT_CLASS_NAME =
  "block overflow-hidden text-ellipsis whitespace-nowrap";

const SORTABLE_HEADERS: Partial<Record<string, SortKey>> = {
  paidAt: "paidAt",
  receiptDate: "receiptDate",
  createdAt: "createdAt",
  Einnahmen: "income",
  Ausgaben: "expense",
};

const getComparableDateValue = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getComparableAmountValue = (
  receipt: CampaiBalanceReceipt,
  amountType: SortKey,
): number | null => {
  const amount = receipt.totalGrossAmount;
  if (amount === null) {
    return null;
  }

  if (amountType === "income") {
    return receipt.type && INCOME_TYPES.has(receipt.type) ? amount : null;
  }

  if (amountType === "expense") {
    return receipt.type && EXPENSE_TYPES.has(receipt.type) ? amount : null;
  }

  return null;
};

const compareNullableValues = (
  left: number | null,
  right: number | null,
  direction: SortDirection,
): number => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
};

export default function BalancePage() {
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [allCostCenters, setAllCostCenters] = useState<CostCenterOption[]>([]);
  const [costCenter1Labels, setCostCenter1Labels] = useState<CostCenterOption[]>([]);
  const [loadingCostCenters, setLoadingCostCenters] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CostCenterOption[]>([]);

  const [receipts, setReceipts] = useState<CampaiBalanceReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>({ key: "receiptDate", direction: "desc" });

  useEffect(() => {
    const load = async () => {
      try {
        const [bookableResponse, allResponse, costCenter1Response] = await Promise.all([
          fetch("/api/campai/cost-centers"),
          fetch("/api/campai/cost-centers?includeNonBookable=1"),
          fetch("/api/campai/cost-center1-labels"),
        ]);
        if (!bookableResponse.ok || !allResponse.ok || !costCenter1Response.ok) {
          throw new Error("Werkbereiche konnten nicht geladen werden.");
        }
        const bookableData = (await bookableResponse.json()) as {
          costCenters?: CostCenterOption[];
        };
        const allData = (await allResponse.json()) as {
          costCenters?: CostCenterOption[];
        };
        const costCenter1Data = (await costCenter1Response.json()) as {
          costCenter1Labels?: CostCenterOption[];
        };
        setCostCenters(bookableData.costCenters ?? []);
        setAllCostCenters(allData.costCenters ?? []);
        setCostCenter1Labels(costCenter1Data.costCenter1Labels ?? []);
      } catch (error) {
        setCostCentersError(
          error instanceof Error
            ? error.message
            : "Werkbereiche konnten nicht geladen werden.",
        );
      } finally {
        setLoadingCostCenters(false);
      }
    };
    load();
  }, []);

  const costCenterLabelMap = useMemo(
    () =>
      new Map(
        [...costCenter1Labels, ...allCostCenters].map((entry) => [
          entry.value,
          COST_CENTER1_SHORT_LABELS[entry.label] ?? entry.label,
        ]),
      ),
    [allCostCenters, costCenter1Labels],
  );

  const costCenterOptions = useMemo(
    () => [ALL_COST_CENTERS_OPTION, ...costCenters],
    [costCenters],
  );

  const selectedCostCenterValues = useMemo(() => {
    if (selected.some((option) => option.value === ALL_COST_CENTERS_OPTION.value)) {
      return allCostCenters.map((option) => option.value);
    }

    return selected.map((option) => option.value);
  }, [allCostCenters, selected]);

  const handleSelectedChange = useCallback((value: readonly CostCenterOption[] | null) => {
    const nextSelected = value ? [...value] : [];

    if (nextSelected.some((option) => option.value === ALL_COST_CENTERS_OPTION.value)) {
      setSelected([ALL_COST_CENTERS_OPTION]);
      return;
    }

    setSelected(nextSelected);
  }, []);

  const loadReceipts = useCallback(async (values: string[]) => {
    if (values.length === 0) {
      setReceipts([]);
      setReceiptsError(null);
      return;
    }
    setLoadingReceipts(true);
    setReceiptsError(null);
    try {
      const response = await fetch("/api/campai/balance/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCenter2: values }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorBody.error ?? `Fehler ${response.status}`);
      }
      const data = (await response.json()) as {
        receipts?: CampaiBalanceReceipt[];
      };
      setReceipts(data.receipts ?? []);
    } catch (error) {
      setReceipts([]);
      setReceiptsError(
        error instanceof Error
          ? error.message
          : "Belege konnten nicht geladen werden.",
      );
    } finally {
      setLoadingReceipts(false);
    }
  }, []);

  useEffect(() => {
    loadReceipts(selectedCostCenterValues);
  }, [selectedCostCenterValues, loadReceipts]);

  const visibleReceipts = useMemo(
    () => receipts.filter((receipt) => !(receipt.type && EXCLUDED_TYPES.has(receipt.type))),
    [receipts],
  );

  const sortedReceipts = useMemo(() => {
    if (!sortConfig) {
      return visibleReceipts;
    }

    return [...visibleReceipts].sort((left, right) => {
      if (sortConfig.key === "paidAt") {
        return compareNullableValues(
          getComparableDateValue(left.paidAt),
          getComparableDateValue(right.paidAt),
          sortConfig.direction,
        );
      }

      if (sortConfig.key === "receiptDate") {
        return compareNullableValues(
          getComparableDateValue(left.receiptDate),
          getComparableDateValue(right.receiptDate),
          sortConfig.direction,
        );
      }

      if (sortConfig.key === "createdAt") {
        return compareNullableValues(
          getComparableDateValue(left.createdAt),
          getComparableDateValue(right.createdAt),
          sortConfig.direction,
        );
      }

      return compareNullableValues(
        getComparableAmountValue(left, sortConfig.key),
        getComparableAmountValue(right, sortConfig.key),
        sortConfig.direction,
      );
    });
  }, [sortConfig, visibleReceipts]);

  const { totalIncome, totalExpense, saldo } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const receipt of visibleReceipts) {
      const amount = receipt.totalGrossAmount ?? 0;
      if (receipt.type && INCOME_TYPES.has(receipt.type)) {
        income += amount;
      } else if (receipt.type && EXPENSE_TYPES.has(receipt.type)) {
        expense += amount;
      }
    }
    return {
      totalIncome: income,
      totalExpense: expense,
      saldo: income - expense,
    };
  }, [visibleReceipts]);

  const hasSelection = selected.length > 0;

  const toggleSort = useCallback((key: SortKey) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: "desc" };
      }

      return {
        key,
        direction: current.direction === "desc" ? "asc" : "desc",
      };
    });
  }, []);

  const tableHeaders = [
    "receiptNumber",
    "paymentStatus",
    "paidAt",
    "Sphäre",
    "description",
    "accountName",
    "Einnahmen",
    "Ausgaben",
    "paymentAccounts",
    "positions.account",
    "type",
    "receiptDate",
    "createdAt",
    "tags",
    "pdf",
  ];
  const colSpan = tableHeaders.length;

  return (
    <div className="mx-auto w-full px-2 py-4 md:px-0 md:py-0">
      <div className="space-y-2 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Übersicht
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Wähle einen oder mehrere Werkbereiche/Projekte, um alle
          zugehörigen Belege zu sehen.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <label
          htmlFor="cost-center-2-filter"
          className="mb-1.5 block text-sm font-medium text-foreground/80"
        >
          Werkbereiche/Projekte
        </label>
        {loadingCostCenters ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />
            Werkbereiche werden geladen…
          </div>
        ) : (
          <ReactSelect<CostCenterOption, true>
            inputId="cost-center-2-filter"
            isMulti
            isClearable
            options={costCenterOptions}
            value={selected}
            onChange={handleSelectedChange}
            placeholder="Werkbereich(e) auswählen…"
            noOptionsMessage={() => "Keine Werkbereiche gefunden."}
          />
        )}
        {costCentersError ? (
          <p className="mt-2 text-sm text-destructive">{costCentersError}</p>
        ) : null}
      </div>

      {hasSelection ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Einnahmen
            </p>
            <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCents(totalIncome)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ausgaben
            </p>
            <p className="mt-1 text-xl font-semibold text-rose-600 dark:text-rose-400">
              {formatCents(totalExpense)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Saldo
            </p>
            <p
              className={`mt-1 text-xl font-semibold ${
                saldo < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
              }`}
            >
              {formatCents(saldo)}
            </p>
          </div>
        </div>
      ) : null}

      {receiptsError ? (
        <div className="mb-6 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {receiptsError}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full table-fixed divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              {tableHeaders.map((header) => {
                const isAmount = header === "Einnahmen" || header === "Ausgaben";
                const sortableKey = SORTABLE_HEADERS[header];
                const isActiveSort = sortableKey ? sortConfig?.key === sortableKey : false;
                const sortIcon = !sortableKey
                  ? null
                  : isActiveSort
                    ? sortConfig?.direction === "asc"
                      ? faSortUp
                      : faSortDown
                    : faSort;
                return (
                  <th
                    key={header}
                    className={`whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 ${HEADER_WIDTH_CLASS_NAMES[header] ?? ""} ${
                      header === "pdf"
                        ? "text-center"
                        : isAmount
                          ? "text-right"
                          : "text-left"
                    }`}
                    title={TABLE_HEADER_LABELS[header] ?? header}
                    aria-sort={
                      sortableKey && isActiveSort
                        ? sortConfig?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {sortableKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(sortableKey)}
                        className={`group inline-flex w-full items-center gap-1 rounded-sm px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900 ${
                          header === "pdf"
                            ? "justify-center"
                            : isAmount
                              ? "justify-end"
                              : "justify-start"
                        } ${
                          isActiveSort
                            ? "font-bold text-zinc-900 dark:text-zinc-50"
                            : ""
                        }`}
                        aria-label={`${TABLE_HEADER_LABELS[header] ?? header} sortieren${
                          isActiveSort
                            ? sortConfig?.direction === "asc"
                              ? ", aktuell aufsteigend"
                              : ", aktuell absteigend"
                            : ""
                        }`}
                      >
                        {sortIcon ? (
                          <FontAwesomeIcon
                            icon={sortIcon}
                            aria-hidden="true"
                            className={`text-[11px] leading-none ${
                              isActiveSort
                                ? "opacity-100 text-zinc-700 dark:text-zinc-200"
                                : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            }`}
                          />
                        ) : null}
                        <span>{TABLE_HEADER_LABELS[header] ?? header}</span>
                      </button>
                    ) : (
                      TABLE_HEADER_LABELS[header] ?? header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {!hasSelection ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-2 py-6 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Bitte einen oder mehrere Werkbereiche auswählen, um Belege
                  anzuzeigen.
                </td>
              </tr>
            ) : loadingReceipts ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-2 py-6 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={faSpinner}
                      spin
                      className="h-4 w-4"
                    />
                    Belege werden geladen…
                  </span>
                </td>
              </tr>
            ) : sortedReceipts.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-2 py-6 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Keine Belege gefunden.
                </td>
              </tr>
            ) : (
              sortedReceipts.map((receipt) => {
                const isIncome = receipt.type
                  ? INCOME_TYPES.has(receipt.type)
                  : false;
                const isExpense = receipt.type
                  ? EXPENSE_TYPES.has(receipt.type)
                  : false;
                const amount = receipt.totalGrossAmount;
                const incomeCell =
                  isIncome && amount !== null ? formatCents(amount) : "";
                const expenseCell =
                  isExpense && amount !== null ? formatCents(amount) : "";
                const receiptDescription = getReceiptDescription(receipt);

                return (
                  <tr key={receipt.id}>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={receipt.receiptNumber ?? "—"}>
                        {receipt.receiptNumber ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm">
                      {receipt.paymentStatus ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusChipClassName(receipt.paymentStatus)}`}
                          title={getPaymentStatusLabel(receipt.paymentStatus) ?? receipt.paymentStatus}
                        >
                          {getPaymentStatusLabel(receipt.paymentStatus) ??
                            receipt.paymentStatus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={formatDate(receipt.paidAt)}>
                        {formatDate(receipt.paidAt)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span
                        className={CELL_TEXT_CLASS_NAME}
                        title={formatFirstPositionField(
                          receipt.positions,
                          "costCenter1",
                          costCenterLabelMap,
                        )}
                      >
                        {getFirstPositionValue(receipt.positions, "costCenter1")}
                      </span>
                    </td>
                    <td className="w-[260px] max-w-[260px] whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={`${CELL_TEXT_CLASS_NAME} max-w-[300px]`} title={receiptDescription}>
                        {receiptDescription}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={receipt.accountName ?? "—"}>
                        {receipt.accountName ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <span className={CELL_TEXT_CLASS_NAME} title={incomeCell || "—"}>
                        {incomeCell || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-medium text-rose-700 dark:text-rose-400">
                      <span className={CELL_TEXT_CLASS_NAME} title={expenseCell || "—"}>
                        {expenseCell || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span
                        className={CELL_TEXT_CLASS_NAME}
                        title={
                          receipt.paymentAccountNames.length > 0
                            ? receipt.paymentAccountNames.join(", ")
                            : receipt.paymentAccounts.length > 0
                              ? receipt.paymentAccounts
                                  .map((account) => `Konto ${account}`)
                                  .join(", ")
                              : "—"
                        }
                      >
                        {receipt.paymentAccountNames.length > 0
                          ? receipt.paymentAccountNames.join(", ")
                          : receipt.paymentAccounts.length > 0
                            ? receipt.paymentAccounts
                                .map((account) => `Konto ${account}`)
                                .join(", ")
                            : "—"}
                      </span>
                    </td>
                    <td className="w-[180px] max-w-[180px] whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span
                        className={`${CELL_TEXT_CLASS_NAME} max-w-[180px]`}
                        title={formatAccountsWithAmounts(receipt.positions)}
                      >
                        {formatAccountsWithAmounts(receipt.positions)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm">
                      {receipt.type ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getTypeChipClassName(receipt.type)}`}
                          title={TYPE_LABELS[receipt.type] ?? receipt.type}
                        >
                          {TYPE_LABELS[receipt.type] ?? receipt.type}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={formatDate(receipt.receiptDate)}>
                        {formatDate(receipt.receiptDate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={formatDateTime(receipt.createdAt)}>
                        {formatDateTime(receipt.createdAt)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-sm">
                      {receipt.tags.length > 0 ? (
                        <div
                          className="inline-flex max-w-full flex-nowrap gap-0.5 overflow-hidden align-middle"
                          title={receipt.tags.join(", ")}
                        >
                          {receipt.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <a
                        href={`/api/campai/balance/receipts/${receipt.id}/download`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900"
                        aria-label={`PDF für ${receipt.receiptNumber || "diesen Beleg"} herunterladen`}
                        title="PDF herunterladen"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M12 3v12" />
                          <path d="m7 10 5 5 5-5" />
                          <path d="M5 21h14" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
