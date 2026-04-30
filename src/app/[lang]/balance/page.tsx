"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

import ReactSelect from "@/app/[lang]/components/ui/react-select";
import type {
  CampaiBalanceReceipt,
  CampaiReceiptPosition,
} from "@/lib/campai-balance-receipts";

type CostCenterOption = {
  value: string;
  label: string;
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
  paid: "Bezahlt",
  unpaid: "Unbezahlt",
  partial: "Teilweise bezahlt",
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
  return parsed.toLocaleDateString("de-DE");
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatPositionsField = (
  positions: CampaiReceiptPosition[],
  field: keyof CampaiReceiptPosition,
  labelMap: Map<string, string>,
): string => {
  if (positions.length === 0) {
    return "—";
  }
  const values = positions.map((position) => {
    const value = position[field];
    if (value === null) {
      return "—";
    }
    const key = String(value);
    return labelMap.get(key) ?? key;
  });
  return values.join(", ");
};

const getTypeChipClassName = (type: string | null): string => {
  if (type && INCOME_TYPES.has(type)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (type && EXPENSE_TYPES.has(type)) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300";
  }
  if (type === "refund") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
};

const getPaymentStatusChipClassName = (status: string | null): string => {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "unpaid") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300";
  }
  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
};

export default function BalancePage() {
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [allCostCenters, setAllCostCenters] = useState<CostCenterOption[]>([]);
  const [loadingCostCenters, setLoadingCostCenters] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CostCenterOption[]>([]);

  const [receipts, setReceipts] = useState<CampaiBalanceReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [bookableResponse, allResponse] = await Promise.all([
          fetch("/api/campai/cost-centers"),
          fetch("/api/campai/cost-centers?includeNonBookable=1"),
        ]);
        if (!bookableResponse.ok || !allResponse.ok) {
          throw new Error("Werkbereiche konnten nicht geladen werden.");
        }
        const bookableData = (await bookableResponse.json()) as {
          costCenters?: CostCenterOption[];
        };
        const allData = (await allResponse.json()) as {
          costCenters?: CostCenterOption[];
        };
        setCostCenters(bookableData.costCenters ?? []);
        setAllCostCenters(allData.costCenters ?? []);
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
    () => new Map(allCostCenters.map((entry) => [entry.value, entry.label])),
    [allCostCenters],
  );

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
    loadReceipts(selected.map((option) => option.value));
  }, [selected, loadReceipts]);

  const visibleReceipts = useMemo(
    () => receipts.filter((receipt) => !(receipt.type && EXCLUDED_TYPES.has(receipt.type))),
    [receipts],
  );

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

  const tableHeaders = [
    "receiptDate",
    "createdAt",
    "receiptNumber",
    "description",
    "Einnahmen",
    "Ausgaben",
    "accountName",
    "type",
    "paymentStatus",
    "tags",
    "positions.costCenter1",
    "positions.costCenter2",
  ];
  const colSpan = tableHeaders.length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-0 md:py-0">
      <div className="space-y-2 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Balance
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Wähle einen oder mehrere Werkbereiche (costCenter2), um alle
          zugehörigen Belege aus Campai zu sehen.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <label
          htmlFor="cost-center-2-filter"
          className="mb-1.5 block text-sm font-medium text-foreground/80"
        >
          Werkbereich(e)
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
            options={costCenters}
            value={selected}
            onChange={(value) => setSelected(value ? [...value] : [])}
            placeholder="Werkbereich(e) auswählen…"
            noOptionsMessage={() => "Keine Werkbereiche gefunden."}
          />
        )}
        {costCentersError ? (
          <p className="mt-2 text-sm text-destructive">{costCentersError}</p>
        ) : null}
      </div>

      {hasSelection ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Einnahmen
            </p>
            <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCents(totalIncome)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ausgaben
            </p>
            <p className="mt-1 text-xl font-semibold text-rose-600 dark:text-rose-400">
              {formatCents(totalExpense)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              {tableHeaders.map((header) => {
                const isAmount = header === "Einnahmen" || header === "Ausgaben";
                return (
                  <th
                    key={header}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 ${
                      isAmount ? "text-right" : "text-left"
                    }`}
                  >
                    {header}
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
                  className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Bitte einen oder mehrere Werkbereiche auswählen, um Belege
                  anzuzeigen.
                </td>
              </tr>
            ) : loadingReceipts ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300"
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
            ) : visibleReceipts.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Keine Belege gefunden.
                </td>
              </tr>
            ) : (
              visibleReceipts.map((receipt) => {
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

                return (
                  <tr key={receipt.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {formatDate(receipt.receiptDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {formatDateTime(receipt.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {receipt.receiptNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {receipt.description ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {incomeCell || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-rose-700 dark:text-rose-400">
                      {expenseCell || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {receipt.accountName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {receipt.type ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getTypeChipClassName(receipt.type)}`}
                        >
                          {TYPE_LABELS[receipt.type] ?? receipt.type}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {receipt.paymentStatus ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getPaymentStatusChipClassName(receipt.paymentStatus)}`}
                        >
                          {PAYMENT_STATUS_LABELS[receipt.paymentStatus] ??
                            receipt.paymentStatus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {receipt.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {receipt.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {formatPositionsField(
                        receipt.positions,
                        "costCenter1",
                        costCenterLabelMap,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      {formatPositionsField(
                        receipt.positions,
                        "costCenter2",
                        costCenterLabelMap,
                      )}
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
