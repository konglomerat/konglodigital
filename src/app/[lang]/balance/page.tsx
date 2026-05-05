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

type PaymentStatusTone = "paid" | "partial" | "unpaid" | "default";

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

const formatCostCenter2WithAmounts = (
  positions: CampaiReceiptPosition[],
  labelMap: Map<string, string>,
): string => {
  if (positions.length === 0) {
    return "—";
  }

  const values = positions.map((position) => {
    if (position.costCenter2 === null) {
      return "—";
    }

    const key = String(position.costCenter2);
    const label = labelMap.get(key) ?? key;

    if (position.amount === null) {
      return label;
    }

    return `${label} (${formatCents(position.amount)})`;
  });

  return values.join(", ");
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
  receiptDate: "Beleg Datum",
  createdAt: "Buchung Datum",
  receiptNumber: "Beleg",
  description: "Beschreibung",
  accountName: "Sender/Empfänger",
  paymentAccounts: "Zahlkonto",
  type: "Typ",
  paymentStatus: "Status",
  tags: "Tags",
  Sphäre: "Sphäre",
  "positions.costCenter2": "positions.costCenter2",
};

const CELL_TEXT_CLASS_NAME =
  "block overflow-hidden text-ellipsis whitespace-nowrap";

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
    "paymentAccounts",
    "type",
    "paymentStatus",
    "tags",
    "Sphäre",
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
        <table className="min-w-full table-fixed divide-y divide-zinc-200 dark:divide-zinc-800">
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
                    title={TABLE_HEADER_LABELS[header] ?? header}
                  >
                    {TABLE_HEADER_LABELS[header] ?? header}
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
                      <span className={CELL_TEXT_CLASS_NAME} title={formatDate(receipt.receiptDate)}>
                        {formatDate(receipt.receiptDate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={formatDateTime(receipt.createdAt)}>
                        {formatDateTime(receipt.createdAt)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={receipt.receiptNumber ?? "—"}>
                        {receipt.receiptNumber ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={receipt.description ?? "—"}>
                        {receipt.description ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <span className={CELL_TEXT_CLASS_NAME} title={incomeCell || "—"}>
                        {incomeCell || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-rose-700 dark:text-rose-400">
                      <span className={CELL_TEXT_CLASS_NAME} title={expenseCell || "—"}>
                        {expenseCell || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span className={CELL_TEXT_CLASS_NAME} title={receipt.accountName ?? "—"}>
                        {receipt.accountName ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {receipt.type ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${getTypeChipClassName(receipt.type)}`}
                          title={TYPE_LABELS[receipt.type] ?? receipt.type}
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
                          title={getPaymentStatusLabel(receipt.paymentStatus) ?? receipt.paymentStatus}
                        >
                          {getPaymentStatusLabel(receipt.paymentStatus) ??
                            receipt.paymentStatus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {receipt.tags.length > 0 ? (
                        <span
                          className={CELL_TEXT_CLASS_NAME}
                          title={receipt.tags.join(", ")}
                        >
                          {receipt.tags.join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span
                        className={CELL_TEXT_CLASS_NAME}
                        title={formatFirstPositionField(
                          receipt.positions,
                          "costCenter1",
                          costCenterLabelMap,
                        )}
                      >
                        {formatFirstPositionField(
                        receipt.positions,
                        "costCenter1",
                        costCenterLabelMap,
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                      <span
                        className={CELL_TEXT_CLASS_NAME}
                        title={formatCostCenter2WithAmounts(
                          receipt.positions,
                          costCenterLabelMap,
                        )}
                      >
                        {formatCostCenter2WithAmounts(receipt.positions, costCenterLabelMap)}
                      </span>
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
