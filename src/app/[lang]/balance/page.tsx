"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faColumns,
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
import type { MemberProfilePreferences } from "@/lib/member-profiles";

import ReceiptDetailDrawer from "./receipt-detail-drawer";

type CostCenterOption = {
  value: string;
  label: string;
};

type FilterOption = {
  value: string;
  label: string;
};

type ColumnKey =
  | "receiptNumber"
  | "paymentStatus"
  | "paidAt"
  | "Sphäre"
  | "description"
  | "accountName"
  | "Einnahmen"
  | "Ausgaben"
  | "paymentAccounts"
  | "positions.account"
  | "type"
  | "receiptDate"
  | "createdAt"
  | "tags"
  | "pdf";

type PaymentStatusTone = "paid" | "partial" | "unpaid" | "default";
type SortKey = "paidAt" | "receiptDate" | "createdAt" | "income" | "expense";
type SortDirection = "asc" | "desc";

type TableColumn = {
  key: ColumnKey;
  label: string;
  title?: string;
  headerWidthClassName?: string;
  align?: "left" | "right" | "center";
  sortableKey?: SortKey;
};

type BalancePreferences = NonNullable<MemberProfilePreferences["balance"]>;

const ALL_COST_CENTERS_OPTION: CostCenterOption = {
  value: "__ALL__",
  label: "Alle",
};

const ALL_FILTER_OPTION: FilterOption = {
  value: "__ALL__",
  label: "Alle",
};

const isTwoDigitCostCenterOption = (option: CostCenterOption): boolean =>
  /^\d{2}$/.test(option.value.trim());

const isThreeDigitCostCenterValue = (value: string): boolean => /^\d{3}$/.test(value);

const DEFAULT_YEAR_FILTER_OPTION: FilterOption = {
  value: "2026",
  label: "2026",
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

const ACCOUNT_DOT_CLASS_NAMES = [
  "bg-sky-500 dark:bg-sky-400",
  "bg-emerald-500 dark:bg-emerald-400",
  "bg-amber-500 dark:bg-amber-400",
  "bg-fuchsia-500 dark:bg-fuchsia-400",
  "bg-cyan-500 dark:bg-cyan-400",
  "bg-orange-500 dark:bg-orange-400",
  "bg-lime-500 dark:bg-lime-400",
  "bg-pink-500 dark:bg-pink-400",
];

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

const getPositionCostCenter2Key = (position: CampaiReceiptPosition): string => {
  if (position.costCenter2 !== null) {
    return String(position.costCenter2);
  }

  return "—";
};

const getPositionCostCenter2Label = (
  position: CampaiReceiptPosition,
  labelMap: Map<string, string>,
): string => {
  const key = getPositionCostCenter2Key(position);
  return labelMap.get(key) ?? key;
};

const formatCostCentersWithAmounts = (
  positions: CampaiReceiptPosition[],
  labelMap: Map<string, string>,
): string => {
  if (positions.length === 0) {
    return "—";
  }

  return positions
    .map((position) => {
      const label = getPositionCostCenter2Label(position, labelMap);

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

const getSplitDotClassName = (splitKey: string): string => {
  let hash = 0;

  for (const character of splitKey) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return ACCOUNT_DOT_CLASS_NAMES[hash % ACCOUNT_DOT_CLASS_NAMES.length];
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

const CELL_TEXT_CLASS_NAME =
  "block overflow-hidden text-ellipsis whitespace-nowrap";

const TABLE_COLUMNS: TableColumn[] = [
  { key: "receiptNumber", label: "Beleg" },
  { key: "paymentStatus", label: "Status" },
  {
    key: "paidAt",
    label: "Zahlungsdatum",
    sortableKey: "paidAt",
  },
  { key: "Sphäre", label: "Sphäre" },
  {
    key: "description",
    label: "Beschreibung",
    headerWidthClassName: "w-[300px]",
  },
  { key: "accountName", label: "Sender/Empfänger" },
  {
    key: "Einnahmen",
    label: "Einnahmen",
    align: "right",
    sortableKey: "income",
  },
  {
    key: "Ausgaben",
    label: "Ausgaben",
    align: "right",
    sortableKey: "expense",
  },
  { key: "paymentAccounts", label: "Zahlkonto" },
  {
    key: "positions.account",
    label: "Aufteilung",
    headerWidthClassName: "w-[200px]",
  },
  { key: "type", label: "Typ" },
  {
    key: "receiptDate",
    label: "Beleg Datum",
    sortableKey: "receiptDate",
  },
  {
    key: "createdAt",
    label: "Buchung Datum",
    sortableKey: "createdAt",
  },
  { key: "tags", label: "Tags" },
  { key: "pdf", label: "PDF", align: "center" },
];

const DEFAULT_COLUMN_ORDER = TABLE_COLUMNS.map((column) => column.key);

const TABLE_COLUMN_MAP = new Map<ColumnKey, TableColumn>(
  TABLE_COLUMNS.map((column) => [column.key, column]),
);

const sanitizeColumnOrder = (order: string[] | undefined): ColumnKey[] => {
  const validKeys = new Set(DEFAULT_COLUMN_ORDER);
  const seenKeys = new Set<ColumnKey>();
  const nextOrder: ColumnKey[] = [];

  for (const key of order ?? []) {
    if (!validKeys.has(key as ColumnKey)) {
      continue;
    }

    const columnKey = key as ColumnKey;
    if (seenKeys.has(columnKey)) {
      continue;
    }

    seenKeys.add(columnKey);
    nextOrder.push(columnKey);
  }

  for (const key of DEFAULT_COLUMN_ORDER) {
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    nextOrder.push(key);
  }

  return nextOrder;
};

const sanitizeHiddenColumns = (
  hiddenColumns: string[] | undefined,
  columnOrder: ColumnKey[],
): ColumnKey[] => {
  const validKeys = new Set(columnOrder);
  const nextHiddenColumns: ColumnKey[] = [];

  for (const key of hiddenColumns ?? []) {
    if (!validKeys.has(key as ColumnKey)) {
      continue;
    }

    const columnKey = key as ColumnKey;
    if (nextHiddenColumns.includes(columnKey)) {
      continue;
    }

    nextHiddenColumns.push(columnKey);
  }

  if (nextHiddenColumns.length >= columnOrder.length) {
    return nextHiddenColumns.slice(0, Math.max(columnOrder.length - 1, 0));
  }

  return nextHiddenColumns;
};

const getHeaderAlignmentClassName = (alignment: TableColumn["align"]): string => {
  if (alignment === "center") {
    return "text-center";
  }

  if (alignment === "right") {
    return "text-right";
  }

  return "text-left";
};

const getHeaderButtonAlignmentClassName = (
  alignment: TableColumn["align"],
): string => {
  if (alignment === "center") {
    return "justify-center";
  }

  if (alignment === "right") {
    return "justify-end";
  }

  return "justify-start";
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  }

  return data;
};

const serializeBalancePreferences = (
  costCenter2: string[],
  columnOrder: ColumnKey[],
  hiddenColumnKeys: ColumnKey[],
) => {
  return JSON.stringify({
    costCenter2,
    columns: {
      order: columnOrder,
      hidden: hiddenColumnKeys,
    },
  });
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
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<ColumnKey[]>([]);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [allCostCenters, setAllCostCenters] = useState<CostCenterOption[]>([]);
  const [costCenter1Labels, setCostCenter1Labels] = useState<CostCenterOption[]>([]);
  const [loadingCostCenters, setLoadingCostCenters] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CostCenterOption[]>([]);
  const [selectedYear, setSelectedYear] = useState<FilterOption | null>(
    DEFAULT_YEAR_FILTER_OPTION,
  );
  const [selectedStatus, setSelectedStatus] = useState<FilterOption | null>(
    ALL_FILTER_OPTION,
  );
  const [selectedType, setSelectedType] = useState<FilterOption | null>(
    ALL_FILTER_OPTION,
  );
  const [selectedAccountSummaryKey, setSelectedAccountSummaryKey] = useState<string | null>(null);

  const [receipts, setReceipts] = useState<CampaiBalanceReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>({ key: "receiptDate", direction: "desc" });
  const columnPanelRef = useRef<HTMLDivElement | null>(null);
  const hasAppliedSavedSelectionRef = useRef(false);
  const savedBalancePreferencesRef = useRef<string>(
    serializeBalancePreferences([], DEFAULT_COLUMN_ORDER, []),
  );
  const [savedSelectedCostCenterValues, setSavedSelectedCostCenterValues] =
    useState<string[]>([]);

  const loadCostCenters = useCallback(async () => {
    setLoadingCostCenters(true);
    setCostCentersError(null);

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

      setCostCenters(
        (bookableData.costCenters ?? []).filter(isTwoDigitCostCenterOption),
      );
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
  }, []);

  useEffect(() => {
    let active = true;

    const loadPreferences = async () => {
      try {
        const response = await fetchJson<{ preferences?: MemberProfilePreferences }>(
          "/api/account/preferences",
        );

        if (!active) {
          return;
        }

        const balancePreferences = response.preferences?.balance;
        const nextColumnOrder = sanitizeColumnOrder(
          balancePreferences?.columns?.order,
        );
        const nextHiddenColumnKeys = sanitizeHiddenColumns(
          balancePreferences?.columns?.hidden,
          nextColumnOrder,
        );
        const nextSelectedCostCenterValues = Array.isArray(
          balancePreferences?.costCenter2,
        )
          ? balancePreferences.costCenter2
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [];

        setColumnOrder(nextColumnOrder);
        setHiddenColumnKeys(nextHiddenColumnKeys);
        setSavedSelectedCostCenterValues(nextSelectedCostCenterValues);
        savedBalancePreferencesRef.current = serializeBalancePreferences(
          nextSelectedCostCenterValues,
          nextColumnOrder,
          nextHiddenColumnKeys,
        );
      } catch {
        if (!active) {
          return;
        }

        setColumnOrder(DEFAULT_COLUMN_ORDER);
        setHiddenColumnKeys([]);
        setSavedSelectedCostCenterValues([]);
        savedBalancePreferencesRef.current = serializeBalancePreferences(
          [],
          DEFAULT_COLUMN_ORDER,
          [],
        );
      } finally {
        if (active) {
          setHasLoadedPreferences(true);
        }
      }
    };

    void loadPreferences();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isColumnPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!columnPanelRef.current?.contains(event.target as Node)) {
        setIsColumnPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsColumnPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isColumnPanelOpen]);

  useEffect(() => {
    void loadCostCenters();
  }, [loadCostCenters]);

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

  const visibleColumns = useMemo(() => {
    const hiddenKeySet = new Set(hiddenColumnKeys);

    return columnOrder
      .filter((key) => !hiddenKeySet.has(key))
      .map((key) => TABLE_COLUMN_MAP.get(key))
      .filter((column): column is TableColumn => Boolean(column));
  }, [columnOrder, hiddenColumnKeys]);

  const selectedCostCenterValues = useMemo(() => {
    const selectedBaseValues = selected.some(
      (option) => option.value === ALL_COST_CENTERS_OPTION.value,
    )
      ? costCenters.map((option) => option.value)
      : selected.map((option) => option.value);

    const expandedValues = new Set(selectedBaseValues);

    for (const baseValue of selectedBaseValues) {
      if (!/^\d{2}$/.test(baseValue)) {
        continue;
      }

      for (const option of allCostCenters) {
        const candidateValue = option.value.trim();
        if (
          isThreeDigitCostCenterValue(candidateValue) &&
          candidateValue.startsWith(baseValue)
        ) {
          expandedValues.add(candidateValue);
        }
      }
    }

    return Array.from(expandedValues);
  }, [allCostCenters, costCenters, selected]);

  const selectedPreferenceValues = useMemo(() => {
    if (selected.some((option) => option.value === ALL_COST_CENTERS_OPTION.value)) {
      return [ALL_COST_CENTERS_OPTION.value];
    }

    return selected.map((option) => option.value);
  }, [selected]);

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

  useEffect(() => {
    if (
      !hasLoadedPreferences ||
      hasAppliedSavedSelectionRef.current ||
      loadingCostCenters
    ) {
      return;
    }

    if (
      savedSelectedCostCenterValues.includes(ALL_COST_CENTERS_OPTION.value)
    ) {
      setSelected([ALL_COST_CENTERS_OPTION]);
      hasAppliedSavedSelectionRef.current = true;
      return;
    }

    const availableOptions = new Map(
      costCenters.map((option) => [option.value, option] as const),
    );
    const nextSelected = savedSelectedCostCenterValues
      .map((value) => availableOptions.get(value))
      .filter((option): option is CostCenterOption => Boolean(option));

    setSelected(nextSelected);
    hasAppliedSavedSelectionRef.current = true;
  }, [
    costCenters,
    hasLoadedPreferences,
    loadingCostCenters,
    savedSelectedCostCenterValues,
  ]);

  useEffect(() => {
    if (!hasLoadedPreferences || !hasAppliedSavedSelectionRef.current) {
      return;
    }

    const nextSerializedPreferences = serializeBalancePreferences(
      selectedPreferenceValues,
      columnOrder,
      hiddenColumnKeys,
    );

    if (savedBalancePreferencesRef.current === nextSerializedPreferences) {
      return;
    }

    let active = true;

    const savePreferences = async () => {
      const preferences: MemberProfilePreferences = {
        balance: {
          costCenter2: selectedPreferenceValues,
          columns: {
            order: columnOrder,
            hidden: hiddenColumnKeys,
          },
        },
      };

      try {
        await fetchJson<{ preferences?: BalancePreferences }>(
          "/api/account/preferences",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferences }),
          },
        );

        if (!active) {
          return;
        }

        savedBalancePreferencesRef.current = nextSerializedPreferences;
      } catch {
        if (!active) {
          return;
        }
      }
    };

    void savePreferences();

    return () => {
      active = false;
    };
  }, [
    columnOrder,
    hasLoadedPreferences,
    hiddenColumnKeys,
    selectedPreferenceValues,
  ]);

  const visibleReceipts = useMemo(
    () => receipts.filter((receipt) => !(receipt.type && EXCLUDED_TYPES.has(receipt.type))),
    [receipts],
  );

  const yearOptions = useMemo<FilterOption[]>(() => {
    const years = new Set<string>();

    for (const receipt of visibleReceipts) {
      const sourceDate = receipt.receiptDate ?? receipt.createdAt ?? receipt.paidAt;
      const timestamp = sourceDate ? Date.parse(sourceDate) : Number.NaN;

      if (Number.isNaN(timestamp)) {
        continue;
      }

      years.add(String(new Date(timestamp).getFullYear()));
    }

    return [
      ALL_FILTER_OPTION,
      ...Array.from(years)
        .sort((left, right) => Number(right) - Number(left))
        .map((year) => ({ value: year, label: year })),
    ];
  }, [visibleReceipts]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const statuses = new Map<string, FilterOption>();

    for (const receipt of visibleReceipts) {
      const status = receipt.paymentStatus?.trim();
      if (!status) {
        continue;
      }

      const normalized = status.toLowerCase();
      if (!statuses.has(normalized)) {
        statuses.set(normalized, {
          value: normalized,
          label: getPaymentStatusLabel(status) ?? status,
        });
      }
    }

    return [
      ALL_FILTER_OPTION,
      ...Array.from(statuses.values()).sort((left, right) =>
        left.label.localeCompare(right.label, "de-DE"),
      ),
    ];
  }, [visibleReceipts]);

  const typeOptions = useMemo<FilterOption[]>(() => {
    const types = new Map<string, FilterOption>();

    for (const receipt of visibleReceipts) {
      const type = receipt.type?.trim();
      if (!type) {
        continue;
      }

      if (!types.has(type)) {
        types.set(type, {
          value: type,
          label: TYPE_LABELS[type] ?? type,
        });
      }
    }

    return [
      ALL_FILTER_OPTION,
      ...Array.from(types.values()).sort((left, right) =>
        left.label.localeCompare(right.label, "de-DE"),
      ),
    ];
  }, [visibleReceipts]);

  const receiptsMatchingToolbarFilters = useMemo(() => {
    return visibleReceipts.filter((receipt) => {
      const selectedYearValue = selectedYear?.value;
      if (selectedYearValue && selectedYearValue !== ALL_FILTER_OPTION.value) {
        const sourceDate = receipt.receiptDate ?? receipt.createdAt ?? receipt.paidAt;
        const timestamp = sourceDate ? Date.parse(sourceDate) : Number.NaN;

        if (
          Number.isNaN(timestamp) ||
          String(new Date(timestamp).getFullYear()) !== selectedYearValue
        ) {
          return false;
        }
      }

      const selectedStatusValue = selectedStatus?.value;
      if (selectedStatusValue && selectedStatusValue !== ALL_FILTER_OPTION.value) {
        if (receipt.paymentStatus?.trim().toLowerCase() !== selectedStatusValue) {
          return false;
        }
      }

      const selectedTypeValue = selectedType?.value;
      if (selectedTypeValue && selectedTypeValue !== ALL_FILTER_OPTION.value) {
        if (receipt.type?.trim() !== selectedTypeValue) {
          return false;
        }
      }

      return true;
    });
  }, [selectedStatus, selectedType, selectedYear, visibleReceipts]);

  const filteredReceipts = useMemo(() => {
    if (!selectedAccountSummaryKey) {
      return receiptsMatchingToolbarFilters;
    }

    return receiptsMatchingToolbarFilters.filter((receipt) =>
      receipt.positions.some(
        (position) =>
          getPositionCostCenter2Key(position) === selectedAccountSummaryKey,
      ),
    );
  }, [receiptsMatchingToolbarFilters, selectedAccountSummaryKey]);

  useEffect(() => {
    if (
      selectedYear &&
      selectedYear.value !== DEFAULT_YEAR_FILTER_OPTION.value &&
      selectedYear.value !== ALL_FILTER_OPTION.value &&
      !yearOptions.some((option) => option.value === selectedYear.value)
    ) {
      setSelectedYear(null);
    }
  }, [selectedYear, yearOptions]);

  useEffect(() => {
    if (
      selectedStatus &&
      selectedStatus.value !== ALL_FILTER_OPTION.value &&
      !statusOptions.some((option) => option.value === selectedStatus.value)
    ) {
      setSelectedStatus(null);
    }
  }, [selectedStatus, statusOptions]);

  useEffect(() => {
    if (
      selectedType &&
      selectedType.value !== ALL_FILTER_OPTION.value &&
      !typeOptions.some((option) => option.value === selectedType.value)
    ) {
      setSelectedType(null);
    }
  }, [selectedType, typeOptions]);

  useEffect(() => {
    if (!selectedAccountSummaryKey) {
      return;
    }

    const hasMatchingAccount = receiptsMatchingToolbarFilters.some((receipt) =>
      receipt.positions.some(
        (position) =>
          getPositionCostCenter2Key(position) === selectedAccountSummaryKey,
      ),
    );

    if (!hasMatchingAccount) {
      setSelectedAccountSummaryKey(null);
    }
  }, [receiptsMatchingToolbarFilters, selectedAccountSummaryKey]);

  const sortedReceipts = useMemo(() => {
    if (!sortConfig) {
      return filteredReceipts;
    }

    return [...filteredReceipts].sort((left, right) => {
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
  }, [filteredReceipts, sortConfig]);

  const tableTotals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const receipt of filteredReceipts) {
      const amount = receipt.totalGrossAmount ?? 0;

      if (receipt.type && INCOME_TYPES.has(receipt.type)) {
        income += amount;
      }

      if (receipt.type && EXPENSE_TYPES.has(receipt.type)) {
        expense += amount;
      }
    }

    return { income, expense };
  }, [filteredReceipts]);

  const { totalIncome, totalExpense, saldo, accountSummaries } = useMemo(() => {
    let income = 0;
    let expense = 0;
    const accountSummaryMap = new Map<
      string,
      {
        key: string;
        label: string;
        income: number;
        expense: number;
      }
    >();

    for (const receipt of receiptsMatchingToolbarFilters) {
      if (receipt.type && INCOME_TYPES.has(receipt.type)) {
        const amount = receipt.totalGrossAmount ?? 0;
        income += amount;
        for (const position of receipt.positions) {
          if (position.amount === null) {
            continue;
          }

          const key = getPositionCostCenter2Key(position);
          const label = getPositionCostCenter2Label(position, costCenterLabelMap);
          const current = accountSummaryMap.get(key) ?? {
            key,
            label,
            income: 0,
            expense: 0,
          };

          current.income += position.amount;
          accountSummaryMap.set(key, current);
        }
      } else if (receipt.type && EXPENSE_TYPES.has(receipt.type)) {
        const amount = receipt.totalGrossAmount ?? 0;
        expense += amount;
        for (const position of receipt.positions) {
          if (position.amount === null) {
            continue;
          }

          const key = getPositionCostCenter2Key(position);
          const label = getPositionCostCenter2Label(position, costCenterLabelMap);
          const current = accountSummaryMap.get(key) ?? {
            key,
            label,
            income: 0,
            expense: 0,
          };

          current.expense += position.amount;
          accountSummaryMap.set(key, current);
        }
      }
    }

    return {
      totalIncome: income,
      totalExpense: expense,
      saldo: income - expense,
      accountSummaries: Array.from(accountSummaryMap.values())
        .map((entry) => ({
          ...entry,
          saldo: entry.income - entry.expense,
        }))
        .sort((left, right) => {
          const saldoDifference = Math.abs(right.saldo) - Math.abs(left.saldo);
          if (saldoDifference !== 0) {
            return saldoDifference;
          }

          return left.label.localeCompare(right.label, "de-DE");
        }),
    };
  }, [costCenterLabelMap, receiptsMatchingToolbarFilters]);

  const hasSelection = selected.length > 0;
  const visibleColumnCount = visibleColumns.length;

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

  const toggleColumnVisibility = useCallback(
    (columnKey: ColumnKey) => {
      setHiddenColumnKeys((current) => {
        const nextHiddenKeys = new Set(current);

        if (nextHiddenKeys.has(columnKey)) {
          nextHiddenKeys.delete(columnKey);
          return sanitizeHiddenColumns(Array.from(nextHiddenKeys), columnOrder);
        }

        if (columnOrder.length - nextHiddenKeys.size <= 1) {
          return current;
        }

        nextHiddenKeys.add(columnKey);
        return sanitizeHiddenColumns(Array.from(nextHiddenKeys), columnOrder);
      });
    },
    [columnOrder],
  );

  const moveColumn = useCallback((columnKey: ColumnKey, direction: -1 | 1) => {
    setColumnOrder((current) => {
      const currentIndex = current.indexOf(columnKey);
      const nextIndex = currentIndex + direction;

      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextOrder = [...current];
      const [movedColumn] = nextOrder.splice(currentIndex, 1);

      nextOrder.splice(nextIndex, 0, movedColumn);
      return nextOrder;
    });
  }, []);

  const toggleAccountSummaryFilter = useCallback((accountKey: string) => {
    setSelectedAccountSummaryKey((current) =>
      current === accountKey ? null : accountKey,
    );
  }, []);

  const renderReceiptCell = useCallback(
    (columnKey: ColumnKey, receipt: CampaiBalanceReceipt) => {
      const cellKey = `${receipt.id}-${columnKey}`;
      const isIncome = receipt.type ? INCOME_TYPES.has(receipt.type) : false;
      const isExpense = receipt.type ? EXPENSE_TYPES.has(receipt.type) : false;
      const amount = receipt.totalGrossAmount;
      const incomeCell = isIncome && amount !== null ? formatCents(amount) : "";
      const expenseCell = isExpense && amount !== null ? formatCents(amount) : "";
      const receiptDescription = getReceiptDescription(receipt);
      const paymentAccountsLabel =
        receipt.paymentAccountNames.length > 0
          ? receipt.paymentAccountNames.join(", ")
          : receipt.paymentAccounts.length > 0
            ? receipt.paymentAccounts.map((account) => `Konto ${account}`).join(", ")
            : "—";

      switch (columnKey) {
        case "receiptNumber":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={receipt.receiptNumber ?? "—"}>
                {receipt.receiptNumber ?? "—"}
              </span>
            </td>
          );
        case "paymentStatus":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm">
              {receipt.paymentStatus ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusChipClassName(receipt.paymentStatus)}`}
                  title={getPaymentStatusLabel(receipt.paymentStatus) ?? receipt.paymentStatus}
                >
                  {getPaymentStatusLabel(receipt.paymentStatus) ?? receipt.paymentStatus}
                </span>
              ) : (
                "—"
              )}
            </td>
          );
        case "paidAt":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={formatDate(receipt.paidAt)}>
                {formatDate(receipt.paidAt)}
              </span>
            </td>
          );
        case "Sphäre":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
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
          );
        case "description":
          return (
            <td key={cellKey} className="w-[260px] max-w-[260px] whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={`${CELL_TEXT_CLASS_NAME} max-w-[300px]`} title={receiptDescription}>
                {receiptDescription}
              </span>
            </td>
          );
        case "accountName":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={receipt.accountName ?? "—"}>
                {receipt.accountName ?? "—"}
              </span>
            </td>
          );
        case "Einnahmen":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <span className={CELL_TEXT_CLASS_NAME} title={incomeCell || "—"}>
                {incomeCell || "—"}
              </span>
            </td>
          );
        case "Ausgaben":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-right text-sm font-medium text-rose-700 dark:text-rose-400">
              <span className={CELL_TEXT_CLASS_NAME} title={expenseCell || "—"}>
                {expenseCell || "—"}
              </span>
            </td>
          );
        case "paymentAccounts":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={paymentAccountsLabel}>
                {paymentAccountsLabel}
              </span>
            </td>
          );
        case "positions.account":
          return (
            <td key={cellKey} className="w-[180px] max-w-[180px] whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              {receipt.positions.length > 0 ? (
                <div
                  className="flex max-w-[180px] items-center gap-3 overflow-hidden"
                  title={formatCostCentersWithAmounts(
                    receipt.positions,
                    costCenterLabelMap,
                  )}
                >
                  {receipt.positions.map((position, index) => (
                    <span
                      key={`${cellKey}-position-${position.costCenter2 ?? "none"}-${index}`}
                      className="inline-flex min-w-0 shrink-0 items-center gap-1.5"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${getSplitDotClassName(getPositionCostCenter2Key(position))}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {position.amount !== null ? formatCents(position.amount) : "—"}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </td>
          );
        case "type":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm">
              {receipt.type ? (
                <span
                  className="inline-block max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  title={TABLE_COLUMN_MAP.get("type")?.title ?? TYPE_LABELS[receipt.type] ?? receipt.type}
                >
                  {TYPE_LABELS[receipt.type] ?? receipt.type}
                </span>
              ) : (
                "—"
              )}
            </td>
          );
        case "receiptDate":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={formatDate(receipt.receiptDate)}>
                {formatDate(receipt.receiptDate)}
              </span>
            </td>
          );
        case "createdAt":
          return (
            <td key={cellKey} className="whitespace-nowrap px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100">
              <span className={CELL_TEXT_CLASS_NAME} title={formatDateTime(receipt.createdAt)}>
                {formatDateTime(receipt.createdAt)}
              </span>
            </td>
          );
        case "tags":
          return (
            <td key={cellKey} className="px-2 py-2 text-sm">
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
          );
        case "pdf":
          return (
            <td key={cellKey} className="px-2 py-2 text-center">
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
          );
      }
    },
    [costCenterLabelMap],
  );

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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full min-w-[260px] sm:w-[360px] lg:w-[420px] lg:flex-none">
          <label
            htmlFor="cost-center-2-filter"
            className="mb-1.5 block text-sm font-medium text-foreground/80"
          >
            Werkbereiche/Projekte
          </label>
          {loadingCostCenters ? (
            <div className="flex min-h-10 items-center gap-2 py-2 text-sm text-muted-foreground">
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
              styles={{
                control: (base, state) => ({
                  ...base,
                  backgroundColor: "transparent",
                  boxShadow: state.isFocused
                    ? "0 0 0 2px color-mix(in srgb, var(--ring) 28%, transparent)"
                    : "none",
                }),
              }}
            />
          )}
          {costCentersError ? (
            <p className="mt-2 text-sm text-destructive">{costCentersError}</p>
          ) : null}
        </div>

        <div className="min-w-[150px] sm:w-[150px]">
          <label
            htmlFor="balance-year-filter"
            className="mb-1.5 block text-sm font-medium text-foreground/80"
          >
            Jahr
          </label>
          <ReactSelect<FilterOption>
            inputId="balance-year-filter"
            options={yearOptions}
            value={selectedYear}
            onChange={(value) => setSelectedYear(value)}
            placeholder="Jahr"
            noOptionsMessage={() => "Keine Jahre gefunden."}
            styles={{
              control: (base, state) => ({
                ...base,
                backgroundColor: "transparent",
                boxShadow: state.isFocused
                  ? "0 0 0 2px color-mix(in srgb, var(--ring) 28%, transparent)"
                  : "none",
              }),
            }}
          />
        </div>

        <div className="min-w-[170px] sm:w-[170px]">
          <label
            htmlFor="balance-status-filter"
            className="mb-1.5 block text-sm font-medium text-foreground/80"
          >
            Status
          </label>
          <ReactSelect<FilterOption>
            inputId="balance-status-filter"
            options={statusOptions}
            value={selectedStatus}
            onChange={(value) => setSelectedStatus(value)}
            placeholder="Status"
            noOptionsMessage={() => "Keine Status gefunden."}
            styles={{
              control: (base, state) => ({
                ...base,
                backgroundColor: "transparent",
                boxShadow: state.isFocused
                  ? "0 0 0 2px color-mix(in srgb, var(--ring) 28%, transparent)"
                  : "none",
              }),
            }}
          />
        </div>

        <div className="min-w-[170px] sm:w-[170px]">
          <label
            htmlFor="balance-type-filter"
            className="mb-1.5 block text-sm font-medium text-foreground/80"
          >
            Typ
          </label>
          <ReactSelect<FilterOption>
            inputId="balance-type-filter"
            options={typeOptions}
            value={selectedType}
            onChange={(value) => setSelectedType(value)}
            placeholder="Typ"
            noOptionsMessage={() => "Keine Typen gefunden."}
            styles={{
              control: (base, state) => ({
                ...base,
                backgroundColor: "transparent",
                boxShadow: state.isFocused
                  ? "0 0 0 2px color-mix(in srgb, var(--ring) 28%, transparent)"
                  : "none",
              }),
            }}
          />
        </div>
      </div>

      {hasSelection ? (
        <div className="mb-4 flex items-start gap-3 overflow-hidden">
          <div className="shrink-0 rounded-xl border border-border bg-card p-4 text-right shadow-sm">
            <p className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Saldo
            </p>
            <p
              className={`mt-1 text-3xl font-semibold ${
                saldo < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
              }`}
            >
              {formatCents(saldo)}
            </p>
            <div className="mt-1.5 flex items-baseline justify-end gap-4 text-sm font-medium sm:text-base">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{formatCents(totalIncome)}
              </span>
              <span className="text-muted-foreground" aria-hidden="true">
                &middot;
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                -{formatCents(totalExpense)}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto pb-1">
            <div className="flex w-max gap-3 pr-1">
              {accountSummaries.map((accountSummary, index) => (
                <button
                  type="button"
                  key={accountSummary.key}
                  onClick={() => toggleAccountSummaryFilter(accountSummary.key)}
                  aria-pressed={selectedAccountSummaryKey === accountSummary.key}
                  className={`shrink-0 rounded-xl border p-4 text-right shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 ${
                    selectedAccountSummaryKey === accountSummary.key
                      ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800/80"
                      : "border-zinc-200/70 bg-zinc-50/75 hover:border-zinc-300 hover:bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80"
                  }`}
                >
                  <p
                    className="flex max-w-[220px] items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground/90"
                    title={accountSummary.label}
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getSplitDotClassName(accountSummary.key)}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{accountSummary.label}</span>
                  </p>
                  <p
                    className={`mt-1 text-2xl ${
                      selectedAccountSummaryKey === accountSummary.key
                        ? accountSummary.saldo < 0
                          ? "font-semibold text-rose-500/70 dark:text-rose-400/70"
                          : "font-semibold text-emerald-600/70 dark:text-emerald-400/70"
                        : "font-normal text-black/45 dark:text-zinc-100/45"
                    }`}
                  >
                    {formatCents(accountSummary.saldo)}
                  </p>
                  <div
                    className={`mt-1.5 flex items-baseline justify-end gap-4 text-sm font-medium transition-opacity sm:text-base ${
                      selectedAccountSummaryKey === accountSummary.key
                        ? "visible opacity-100"
                        : "invisible opacity-0"
                    }`}
                  >
                    <span className="text-emerald-600/80 dark:text-emerald-400/80">
                      +{formatCents(accountSummary.income)}
                    </span>
                    <span className="text-muted-foreground/70" aria-hidden="true">
                      &middot;
                    </span>
                    <span className="text-rose-600/80 dark:text-rose-400/80">
                      -{formatCents(accountSummary.expense)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {receiptsError ? (
        <div className="mb-6 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {receiptsError}
        </div>
      ) : null}

      <div className="mb-3 flex justify-end">
        <div className="relative" ref={columnPanelRef}>
          <button
            type="button"
            onClick={() => setIsColumnPanelOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950"
            aria-haspopup="dialog"
            aria-expanded={isColumnPanelOpen}
          >
            <FontAwesomeIcon icon={faColumns} className="h-4 w-4" />
            Spalten verwalten
          </button>

          {isColumnPanelOpen ? (
            <div
              className="absolute right-0 top-full z-20 mt-2 w-[320px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
              role="dialog"
              aria-label="Spalten verwalten"
            >
              <div className="mb-2">
                <p className="text-sm font-semibold">Spalten verwalten</p>
                <p className="text-xs text-muted-foreground">
                  Spalten ein- oder ausblenden und ihre Reihenfolge anpassen.
                </p>
              </div>

              <div className="space-y-2">
                {columnOrder.map((columnKey, index) => {
                  const column = TABLE_COLUMN_MAP.get(columnKey);

                  if (!column) {
                    return null;
                  }

                  const isVisible = !hiddenColumnKeys.includes(columnKey);
                  const disableHide = isVisible && visibleColumnCount <= 1;

                  return (
                    <div
                      key={column.key}
                      className="flex items-center gap-2 rounded-lg border border-border px-2 py-2"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleColumnVisibility(column.key)}
                          disabled={disableHide}
                          className="h-4 w-4 rounded border-border text-foreground focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <span className="truncate">{column.label}</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveColumn(column.key, -1)}
                          disabled={index === 0}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`${column.label} nach oben verschieben`}
                        >
                          <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(column.key, 1)}
                          disabled={index === columnOrder.length - 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`${column.label} nach unten verschieben`}
                        >
                          <FontAwesomeIcon icon={faArrowDown} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ReceiptDetailDrawer
        receiptId={selectedReceiptId}
        costCenterOptions={allCostCenters}
        onCostCentersChanged={loadCostCenters}
        onClose={() => setSelectedReceiptId(null)}
        onSaved={() => {
          loadReceipts(selectedCostCenterValues);
        }}
      />

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full table-fixed divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              {visibleColumns.map((column) => {
                const sortableKey = column.sortableKey;
                const isActiveSort = column.sortableKey
                  ? sortConfig?.key === column.sortableKey
                  : false;
                const sortIcon = !sortableKey
                  ? null
                  : isActiveSort
                    ? sortConfig?.direction === "asc"
                      ? faSortUp
                      : faSortDown
                    : faSort;
                return (
                  <th
                    key={column.key}
                    className={`whitespace-nowrap px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300 ${column.headerWidthClassName ?? ""} ${getHeaderAlignmentClassName(
                      column.align,
                    )}`}
                    title={column.title ?? column.label}
                    aria-sort={
                      column.sortableKey && isActiveSort
                        ? sortConfig?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sortableKey ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (sortableKey) {
                            toggleSort(sortableKey);
                          }
                        }}
                        className={`group inline-flex w-full items-center gap-1 rounded-sm px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900 ${
                          getHeaderButtonAlignmentClassName(column.align)
                        } ${
                          isActiveSort
                            ? "font-bold text-zinc-900 dark:text-zinc-50"
                            : ""
                        }`}
                        aria-label={`${column.label} sortieren${
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
                        <span>{column.label}</span>
                      </button>
                    ) : (
                      column.label
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
                  colSpan={visibleColumnCount}
                  className="px-2 py-6 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Bitte einen oder mehrere Werkbereiche auswählen, um Belege
                  anzuzeigen.
                </td>
              </tr>
            ) : loadingReceipts ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
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
                  colSpan={visibleColumnCount}
                  className="px-2 py-6 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Keine Belege gefunden.
                </td>
              </tr>
            ) : (
              sortedReceipts.map((receipt) => {
                return (
                  <tr
                    key={receipt.id}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("a,button")) {
                        return;
                      }
                      setSelectedReceiptId(receipt.id);
                    }}
                    className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    {visibleColumns.map((column) => renderReceiptCell(column.key, receipt))}
                  </tr>
                );
              })
            )}
          </tbody>
          {hasSelection && !loadingReceipts && sortedReceipts.length > 0 ? (
            <tfoot className="bg-zinc-50 dark:bg-zinc-900/80">
              <tr>
                {visibleColumns.map((column, index) => {
                  if (column.key === "Einnahmen") {
                    return (
                      <td
                        key={column.key}
                        className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                      >
                        <span className={CELL_TEXT_CLASS_NAME} title={formatCents(tableTotals.income)}>
                          {formatCents(tableTotals.income)}
                        </span>
                      </td>
                    );
                  }

                  if (column.key === "Ausgaben") {
                    return (
                      <td
                        key={column.key}
                        className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold text-rose-700 dark:text-rose-400"
                      >
                        <span className={CELL_TEXT_CLASS_NAME} title={formatCents(tableTotals.expense)}>
                          {formatCents(tableTotals.expense)}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={column.key}
                      className="whitespace-nowrap px-2 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100"
                    >
                      {index === 0 ? "Total" : ""}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
