"use client";

// Belege eines Werkbereichs (zweistellige Kostenstelle 2) samt seiner
// Unterprojekte (dreistellig). Filter oben, Salden in einer schlanken Zeile
// unter der Tabelle.
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";
import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import SegmentedControl from "@/components/knglmrt/SegmentedControl";
import PageTitle from "@/app/[lang]/components/PageTitle";
import {
  type BuchhaltungWerkbereich,
  belongsToWerkbereich,
  isUnterprojektOf,
} from "@/lib/buchhaltung-werkbereiche";
import type {
  CampaiBalanceReceipt,
  CampaiReceiptPosition,
} from "@/lib/campai-balance-receipts";
import {
  CASH_REGISTER_ACCOUNT_BY_COST_CENTER2,
  isCashRegisterAccount,
} from "@/lib/campai-cash-register-balances";
import type { CampaiCashRegisterBalanceSummary } from "@/lib/campai-cash-register-balances";
import type { MemberProfilePreferences } from "@/lib/member-profiles";

import NewBookingMenu from "./NewBookingMenu";
import ProjectFilter, { type ProjectFilterOption } from "./ProjectFilter";
import ReceiptDetailDrawer from "./receipt-detail-drawer";

type CostCenterOption = {
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
type KindFilter = "all" | "income" | "expense" | "open";

type TableColumn = {
  key: ColumnKey;
  label: string;
  title?: string;
  headerWidthClassName?: string;
  align?: "left" | "right" | "center";
  sortableKey?: SortKey;
};

type BalancePreferences = NonNullable<MemberProfilePreferences["balance"]>;

const KIND_FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "income", label: "Einnahmen" },
  { value: "expense", label: "Ausgaben" },
  { value: "open", label: "Offen" },
];

const CURRENT_YEAR = String(new Date().getFullYear());
// Mehr Jahre passen nicht als Segmente in die Zeile — dann immer als Liste.
const MAX_YEAR_SEGMENTS = 3;

// In der schmalsten Stufe scrollt die Filterzeile seitlich und würde ein
// absolut gesetztes Popover abschneiden. `fixed` ohne `top` bleibt an seiner
// statischen Stelle unter dem Auslöser, entkommt aber dem Scrollcontainer.
const NARROW_POPOVER_CLASS_NAME =
  "@max-[559px]:fixed @max-[559px]:inset-x-4 @max-[559px]:top-auto @max-[559px]:w-auto";


const INCOME_TYPES = new Set(["revenue", "invoice", "donation", "deposit"]);
const EXPENSE_TYPES = new Set(["expense"]);
const EXCLUDED_TYPES = new Set(["offer"]);
const OPEN_PAYMENT_STATUSES = new Set(["unpaid", "partial"]);

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
  unpaid: "Offen",
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

const formatSignedCents = (cents: number): string =>
  cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);

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

const normalizePaymentStatusTone = (
  status: string | null,
): PaymentStatusTone => {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "paid" || normalized === "partial" || normalized === "unpaid") {
    return normalized;
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

// Die Tint-Stufen der Palette: bezahlt kühl, offen pink, teilweise gelb.
const PAYMENT_STATUS_CHIP_CLASS_NAMES: Record<PaymentStatusTone, string> = {
  paid: "bg-info-soft",
  unpaid: "bg-[var(--knglmrt-pink-30)]",
  partial: "bg-warning-soft",
  default: "bg-muted",
};

const isOpenReceipt = (receipt: CampaiBalanceReceipt): boolean =>
  OPEN_PAYMENT_STATUSES.has(receipt.paymentStatus?.trim().toLowerCase() ?? "");

const CELL_CLASS_NAME = "whitespace-nowrap px-4 py-3 text-foreground";
const CELL_TEXT_CLASS_NAME =
  "block overflow-hidden text-ellipsis whitespace-nowrap";
const CHIP_CLASS_NAME =
  "inline-block max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap px-[7px] py-[3px] knglmrt-tag text-foreground";

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

const getHeaderAlignmentClassName = (
  alignment: TableColumn["align"],
): string => {
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

const getPaidYear = (receipt: CampaiBalanceReceipt): string | null => {
  const timestamp = receipt.paidAt ? Date.parse(receipt.paidAt) : Number.NaN;
  return Number.isNaN(timestamp)
    ? null
    : String(new Date(timestamp).getFullYear());
};

// Auswahlliste statt Segmenten, wenn die Filterzeile schmal wird.
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`w-auto shrink-0 ${className ?? ""}`}
      selectClassName="h-[38px] py-0 font-bold"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

// Ein Wert der Saldo-Zeile: schmal Beschriftung über dem Wert, breit daneben.
function SummaryFigure({
  label,
  value,
  valueClassName,
  title,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="flex flex-col whitespace-nowrap @min-[1100px]:flex-row @min-[1100px]:items-baseline @min-[1100px]:gap-1.5"
    >
      <span className="text-[length:clamp(11px,3cqw,14px)] leading-4 text-muted-foreground @min-[1100px]:text-[length:var(--ui-size-body)] @min-[1100px]:leading-normal @min-[1100px]:text-foreground">
        {label}
      </span>
      <span
        className={`knglmrt-num font-bold! text-[length:clamp(10px,2.9cqw,15px)]! ${valueClassName ?? ""}`}
      >
        {value}
      </span>
    </span>
  );
}

type WerkbereichReceiptsProps = {
  werkbereich: BuchhaltungWerkbereich;
};

export default function WerkbereichReceipts({
  werkbereich,
}: WerkbereichReceiptsProps) {
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [columnOrder, setColumnOrder] =
    useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<ColumnKey[]>([]);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [allCostCenters, setAllCostCenters] = useState<CostCenterOption[]>([]);
  const [costCenter1Labels, setCostCenter1Labels] = useState<
    CostCenterOption[]
  >([]);
  const [costCentersReady, setCostCentersReady] = useState(false);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [groupByProject, setGroupByProject] = useState(false);
  const [cashRegisterSummary, setCashRegisterSummary] =
    useState<CampaiCashRegisterBalanceSummary | null>(null);
  const [cashRegisterError, setCashRegisterError] = useState<string | null>(
    null,
  );

  const [receipts, setReceipts] = useState<CampaiBalanceReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>({ key: "paidAt", direction: "desc" });
  const columnPanelRef = useRef<HTMLDivElement | null>(null);
  const savedBalancePreferencesRef = useRef<string>(
    serializeBalancePreferences([], DEFAULT_COLUMN_ORDER, []),
  );

  const loadCostCenters = useCallback(async () => {
    setCostCentersError(null);

    try {
      const [allResponse, costCenter1Response] = await Promise.all([
        fetch("/api/campai/cost-centers?includeNonBookable=1"),
        fetch("/api/campai/cost-center1-labels"),
      ]);

      if (!allResponse.ok || !costCenter1Response.ok) {
        throw new Error("Kostenstellen konnten nicht geladen werden.");
      }

      const allData = (await allResponse.json()) as {
        costCenters?: CostCenterOption[];
      };
      const costCenter1Data = (await costCenter1Response.json()) as {
        costCenter1Labels?: CostCenterOption[];
      };

      setAllCostCenters(allData.costCenters ?? []);
      setCostCenter1Labels(costCenter1Data.costCenter1Labels ?? []);
    } catch (error) {
      setCostCentersError(
        error instanceof Error
          ? error.message
          : "Kostenstellen konnten nicht geladen werden.",
      );
    } finally {
      setCostCentersReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadPreferences = async () => {
      try {
        const response = await fetchJson<{
          preferences?: MemberProfilePreferences;
        }>("/api/account/preferences");

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

        setColumnOrder(nextColumnOrder);
        setHiddenColumnKeys(nextHiddenColumnKeys);
        savedBalancePreferencesRef.current = serializeBalancePreferences(
          balancePreferences?.costCenter2 ?? [],
          nextColumnOrder,
          nextHiddenColumnKeys,
        );
      } catch {
        if (!active) {
          return;
        }

        setColumnOrder(DEFAULT_COLUMN_ORDER);
        setHiddenColumnKeys([]);
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

  const getProjectLabel = useCallback(
    (key: string) =>
      key === werkbereich.value
        ? `${werkbereich.label} allgemein`
        : (costCenterLabelMap.get(key) ?? key),
    [costCenterLabelMap, werkbereich],
  );

  const visibleColumns = useMemo(() => {
    const hiddenKeySet = new Set(hiddenColumnKeys);

    return columnOrder
      .filter((key) => !hiddenKeySet.has(key))
      .map((key) => TABLE_COLUMN_MAP.get(key))
      .filter((column): column is TableColumn => Boolean(column));
  }, [columnOrder, hiddenColumnKeys]);

  // Der Werkbereich selbst und alle Unterprojekte mit seinen beiden Ziffern.
  const werkbereichCostCenterValues = useMemo(() => {
    const values = new Set([werkbereich.value]);

    for (const option of allCostCenters) {
      const value = option.value.trim();
      if (isUnterprojektOf(value, werkbereich.value)) {
        values.add(value);
      }
    }

    return Array.from(values);
  }, [allCostCenters, werkbereich.value]);

  const loadReceipts = useCallback(async (values: string[]) => {
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

  // Erst wenn die Unterprojekte bekannt sind — sonst lädt die Seite zweimal.
  useEffect(() => {
    if (!costCentersReady) {
      return;
    }

    void loadReceipts(werkbereichCostCenterValues);
  }, [costCentersReady, loadReceipts, werkbereichCostCenterValues]);

  // Der Kassenbestand ist ein Stand, keine Bewegung: er hängt nicht an den
  // Filtern der Tabelle.
  useEffect(() => {
    let active = true;

    const loadCashRegisters = async () => {
      try {
        const summary = await fetchJson<CampaiCashRegisterBalanceSummary>(
          "/api/campai/cash-registers",
        );

        if (!active) {
          return;
        }

        setCashRegisterSummary(summary);
        setCashRegisterError(null);
      } catch (error) {
        if (!active) {
          return;
        }

        setCashRegisterSummary(null);
        setCashRegisterError(
          error instanceof Error
            ? error.message
            : "Barkassen-Bestand konnte nicht geladen werden.",
        );
      }
    };

    void loadCashRegisters();

    return () => {
      active = false;
    };
  }, []);

  // Merkt sich den zuletzt geöffneten Werkbereich (für /receipts) und die
  // Spaltenauswahl.
  useEffect(() => {
    if (!hasLoadedPreferences) {
      return;
    }

    const nextSerializedPreferences = serializeBalancePreferences(
      [werkbereich.value],
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
          costCenter2: [werkbereich.value],
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
  }, [columnOrder, hasLoadedPreferences, hiddenColumnKeys, werkbereich.value]);

  const visibleReceipts = useMemo(
    () =>
      receipts.filter(
        (receipt) => !(receipt.type && EXCLUDED_TYPES.has(receipt.type)),
      ),
    [receipts],
  );

  const yearOptions = useMemo(() => {
    const years = new Set<string>([CURRENT_YEAR, selectedYear]);

    for (const receipt of visibleReceipts) {
      const year = getPaidYear(receipt);
      if (year) {
        years.add(year);
      }
    }

    return Array.from(years)
      .sort((left, right) => Number(left) - Number(right))
      .map((year) => ({ value: year, label: year }));
  }, [selectedYear, visibleReceipts]);

  // Belege ohne Zahlungsdatum bleiben in jedem Jahr stehen — sie sind offen.
  const receiptsMatchingToolbarFilters = useMemo(() => {
    return visibleReceipts.filter((receipt) => {
      const year = getPaidYear(receipt);
      if (year && year !== selectedYear) {
        return false;
      }

      if (kindFilter === "income") {
        return Boolean(receipt.type && INCOME_TYPES.has(receipt.type));
      }

      if (kindFilter === "expense") {
        return Boolean(receipt.type && EXPENSE_TYPES.has(receipt.type));
      }

      if (kindFilter === "open") {
        return isOpenReceipt(receipt);
      }

      return true;
    });
  }, [kindFilter, selectedYear, visibleReceipts]);

  const projectOptions = useMemo<ProjectFilterOption[]>(() => {
    const projects = new Map<string, ProjectFilterOption>();

    for (const receipt of receiptsMatchingToolbarFilters) {
      const isIncome = Boolean(receipt.type && INCOME_TYPES.has(receipt.type));
      const isExpense = Boolean(
        receipt.type && EXPENSE_TYPES.has(receipt.type),
      );
      const countedKeys = new Set<string>();

      for (const position of receipt.positions) {
        const key = getPositionCostCenter2Key(position);
        if (!belongsToWerkbereich(key, werkbereich.value)) {
          continue;
        }

        const project = projects.get(key) ?? {
          key,
          label: getProjectLabel(key),
          count: 0,
          saldo: 0,
        };

        if (!countedKeys.has(key)) {
          project.count += 1;
          countedKeys.add(key);
        }

        if (position.amount !== null) {
          if (isIncome) {
            project.saldo += position.amount;
          } else if (isExpense) {
            project.saldo -= position.amount;
          }
        }

        projects.set(key, project);
      }
    }

    return Array.from(projects.values()).sort(
      (left, right) => Number(left.key) - Number(right.key),
    );
  }, [getProjectLabel, receiptsMatchingToolbarFilters, werkbereich.value]);

  // Auswahl, die es unter den aktuellen Filtern nicht gibt, zählt nicht.
  const activeProjectKeys = useMemo(() => {
    const available = new Set(projectOptions.map((option) => option.key));
    return selectedProjects.filter((key) => available.has(key));
  }, [projectOptions, selectedProjects]);

  const filteredReceipts = useMemo(() => {
    if (activeProjectKeys.length === 0) {
      return receiptsMatchingToolbarFilters;
    }

    const keys = new Set(activeProjectKeys);
    return receiptsMatchingToolbarFilters.filter((receipt) =>
      receipt.positions.some((position) =>
        keys.has(getPositionCostCenter2Key(position)),
      ),
    );
  }, [activeProjectKeys, receiptsMatchingToolbarFilters]);

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

  // Ein Beleg mit Positionen in mehreren Unterprojekten steht in jeder Gruppe.
  const projectGroups = useMemo(() => {
    if (!groupByProject) {
      return [];
    }

    const keys = new Set(activeProjectKeys);
    return projectOptions
      .filter((option) => keys.size === 0 || keys.has(option.key))
      .map((option) => ({
        ...option,
        receipts: sortedReceipts.filter((receipt) =>
          receipt.positions.some(
            (position) => getPositionCostCenter2Key(position) === option.key,
          ),
        ),
      }));
  }, [activeProjectKeys, groupByProject, projectOptions, sortedReceipts]);

  const { totalIncome, totalExpense, saldo, transferSaldo } = useMemo(() => {
    let income = 0;
    let expense = 0;
    // Zahlungsweg pro Beleg: Campai bucht Barzahlungen auf ein Kassenkonto
    // (160xx), alles andere gilt hier als überwiesen.
    let transfer = 0;

    for (const receipt of receiptsMatchingToolbarFilters) {
      const paidInCash = receipt.paymentAccounts.some(isCashRegisterAccount);
      const amount = receipt.totalGrossAmount ?? 0;

      if (receipt.type && INCOME_TYPES.has(receipt.type)) {
        income += amount;
        if (!paidInCash) {
          transfer += amount;
        }
      } else if (receipt.type && EXPENSE_TYPES.has(receipt.type)) {
        expense += amount;
        if (!paidInCash) {
          transfer -= amount;
        }
      }
    }

    return {
      totalIncome: income,
      totalExpense: expense,
      saldo: income - expense,
      transferSaldo: transfer,
    };
  }, [receiptsMatchingToolbarFilters]);

  const cashRegisterAccount =
    CASH_REGISTER_ACCOUNT_BY_COST_CENTER2[werkbereich.value];
  const cashRegisterBalance =
    cashRegisterAccount === undefined
      ? null
      : (cashRegisterSummary?.registers.find(
          (register) => register.account === cashRegisterAccount,
        )?.balance ?? null);

  // Der Kassenbestand entsteht aus den bar bezahlten Belegen — die zählen im
  // Guthaben deshalb nur einmal, nämlich über den Bestand. Ohne zugeordnete
  // Kasse bleibt es beim reinen Beleg-Saldo.
  const availableSaldo =
    cashRegisterBalance !== null
      ? transferSaldo + cashRegisterBalance
      : saldo;
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

  const renderReceiptCell = useCallback(
    (columnKey: ColumnKey, receipt: CampaiBalanceReceipt) => {
      const cellKey = `${receipt.id}-${columnKey}`;
      const isIncome = receipt.type ? INCOME_TYPES.has(receipt.type) : false;
      const isExpense = receipt.type ? EXPENSE_TYPES.has(receipt.type) : false;
      const amount = receipt.totalGrossAmount;
      const incomeCell =
        isIncome && amount !== null ? `+${formatCents(amount)}` : "";
      const expenseCell =
        isExpense && amount !== null ? `-${formatCents(amount)}` : "";
      const receiptDescription = getReceiptDescription(receipt);
      const paymentAccountsLabel =
        receipt.paymentAccountNames.length > 0
          ? receipt.paymentAccountNames.join(", ")
          : receipt.paymentAccounts.length > 0
            ? receipt.paymentAccounts
                .map((account) => `Konto ${account}`)
                .join(", ")
            : "—";

      switch (columnKey) {
        case "receiptNumber":
          return (
            <td key={cellKey} className={`${CELL_CLASS_NAME} knglmrt-num`}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={receipt.receiptNumber ?? "—"}
              >
                {receipt.receiptNumber ?? "—"}
              </span>
            </td>
          );
        case "paymentStatus": {
          const statusLabel = getPaymentStatusLabel(receipt.paymentStatus);
          return (
            <td key={cellKey} className={CELL_CLASS_NAME}>
              {statusLabel ? (
                <span
                  className={`${CHIP_CLASS_NAME} ${PAYMENT_STATUS_CHIP_CLASS_NAMES[normalizePaymentStatusTone(receipt.paymentStatus)]}`}
                  title={statusLabel}
                >
                  {statusLabel}
                </span>
              ) : (
                "—"
              )}
            </td>
          );
        }
        case "paidAt":
          return (
            <td key={cellKey} className={`${CELL_CLASS_NAME} knglmrt-num`}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={formatDate(receipt.paidAt)}
              >
                {formatDate(receipt.paidAt)}
              </span>
            </td>
          );
        case "Sphäre":
          return (
            <td key={cellKey} className={CELL_CLASS_NAME}>
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
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} w-[260px] max-w-[260px]`}
            >
              <span
                className={`${CELL_TEXT_CLASS_NAME} max-w-[300px]`}
                title={receiptDescription}
              >
                {receiptDescription}
              </span>
            </td>
          );
        case "accountName":
          return (
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} max-w-[220px]`}
            >
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={receipt.accountName ?? "—"}
              >
                {receipt.accountName ?? "—"}
              </span>
            </td>
          );
        case "Einnahmen":
          return (
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} knglmrt-num text-right font-bold!`}
            >
              <span className={CELL_TEXT_CLASS_NAME} title={incomeCell}>
                {incomeCell}
              </span>
            </td>
          );
        case "Ausgaben":
          return (
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} knglmrt-num text-right font-bold!`}
            >
              <span className={CELL_TEXT_CLASS_NAME} title={expenseCell}>
                {expenseCell}
              </span>
            </td>
          );
        case "paymentAccounts":
          return (
            <td key={cellKey} className={CELL_CLASS_NAME}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={paymentAccountsLabel}
              >
                {paymentAccountsLabel}
              </span>
            </td>
          );
        case "positions.account":
          return (
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} w-[180px] max-w-[180px]`}
            >
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
                        className={`h-2.5 w-2.5 shrink-0 ${getSplitDotClassName(getPositionCostCenter2Key(position))}`}
                        aria-hidden="true"
                      />
                      <span className="knglmrt-num">
                        {position.amount !== null
                          ? formatCents(position.amount)
                          : "—"}
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
            <td key={cellKey} className={CELL_CLASS_NAME}>
              {receipt.type ? (
                <span
                  className={`${CHIP_CLASS_NAME} bg-muted`}
                  title={TYPE_LABELS[receipt.type] ?? receipt.type}
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
            <td key={cellKey} className={`${CELL_CLASS_NAME} knglmrt-num`}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={formatDate(receipt.receiptDate)}
              >
                {formatDate(receipt.receiptDate)}
              </span>
            </td>
          );
        case "createdAt":
          return (
            <td key={cellKey} className={`${CELL_CLASS_NAME} knglmrt-num`}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={formatDate(receipt.createdAt)}
              >
                {formatDate(receipt.createdAt)}
              </span>
            </td>
          );
        case "tags":
          return (
            <td key={cellKey} className="px-4 py-3">
              {receipt.tags.length > 0 ? (
                <div
                  className="inline-flex max-w-full flex-nowrap gap-1 overflow-hidden align-middle"
                  title={receipt.tags.join(", ")}
                >
                  {receipt.tags.map((tag) => (
                    <span key={tag} className={`${CHIP_CLASS_NAME} bg-muted`}>
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
            <td key={cellKey} className="px-4 py-2 text-center">
              <a
                href={`/api/campai/balance/receipts/${receipt.id}/download`}
                className="inline-flex h-8 w-8 items-center justify-center knglmrt-border bg-card text-foreground transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
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

  const renderReceiptRow = (receipt: CampaiBalanceReceipt, key: string) => (
    <tr
      key={key}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a,button")) {
          return;
        }
        setSelectedReceiptId(receipt.id);
      }}
      className="cursor-pointer transition hover:bg-muted"
    >
      {visibleColumns.map((column) => renderReceiptCell(column.key, receipt))}
    </tr>
  );

  const renderMessageRow = (content: ReactNode) => (
    <tr>
      <td
        colSpan={visibleColumnCount}
        className="px-4 py-6 text-muted-foreground"
      >
        {content}
      </td>
    </tr>
  );

  const isProject = werkbereich.label.startsWith("#");
  const showSummary = !loadingReceipts && !receiptsError;

  return (
    // Ab md füllt die Ansicht die Höhe: die Tabelle scrollt in sich, die
    // Saldo-Zeile steht immer unten.
    <div className="flex w-full flex-col gap-4 md:h-full">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Buchhaltung" },
              { label: isProject ? "Projekt" : "Werkbereich" },
            ]}
          />
          <PageTitle headingLevel={2} title={werkbereich.label} />
        </div>
        <NewBookingMenu />
      </div>

      {costCentersError ? (
        <div className="shrink-0 border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive">
          {costCentersError}
        </div>
      ) : null}

      {/* Eine Zeile, die mit der verfügbaren Breite schrumpft (Container-
          Queries, weil die Sidebar die Breite mitbestimmt):
          ≥1180px Segmente und volle Beschriftungen, darunter Auswahllisten;
          die Beschriftungen fallen nacheinander weg („Gruppieren" <800px,
          „Buchungen" <720px, „Projekt" <600px). Unter 560px scrollt die Zeile
          seitlich, die Popover hängen dann fest unter ihr, statt abgeschnitten
          zu werden. */}
      <div className="@container shrink-0">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto @min-[560px]:gap-3 @min-[560px]:overflow-visible">
          <div className="hidden shrink-0 @min-[1180px]:block">
            <SegmentedControl
              tone="ink"
              size="medium"
              value={kindFilter}
              options={KIND_FILTER_OPTIONS}
              onChange={setKindFilter}
            />
          </div>
          <FilterSelect
            className="@min-[1180px]:hidden"
            label="Art"
            value={kindFilter}
            options={KIND_FILTER_OPTIONS}
            onChange={setKindFilter}
          />
          {yearOptions.length <= MAX_YEAR_SEGMENTS ? (
            <div className="hidden shrink-0 @min-[1180px]:block">
              <SegmentedControl
                tone="ink"
                size="medium"
                value={selectedYear}
                options={yearOptions}
                onChange={setSelectedYear}
              />
            </div>
          ) : null}
          <FilterSelect
            className={
              yearOptions.length <= MAX_YEAR_SEGMENTS ? "@min-[1180px]:hidden" : ""
            }
            label="Jahr"
            value={selectedYear}
            options={yearOptions}
            onChange={setSelectedYear}
          />
          <span
            aria-hidden="true"
            className="mx-1 hidden h-8 w-px shrink-0 bg-border @min-[1180px]:block"
          />
          <ProjectFilter
            options={projectOptions}
            value={activeProjectKeys}
            onChange={setSelectedProjects}
            formatAmount={formatCents}
            captionClassName="hidden @min-[600px]:inline"
            panelClassName={NARROW_POPOVER_CLASS_NAME}
          />
          <Choice
            kind="switch"
            className="shrink-0 whitespace-nowrap"
            checked={groupByProject}
            onChange={(event) => setGroupByProject(event.target.checked)}
            aria-label="Nach Projekt gruppieren"
            title="Nach Projekt gruppieren"
            label={
              <>
                <span className="hidden @min-[1180px]:inline">
                  Nach Projekt gruppieren
                </span>
                <span className="hidden @min-[800px]:inline @min-[1180px]:hidden">
                  Gruppieren
                </span>
              </>
            }
          />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {showSummary ? (
              <span
                className="knglmrt-num whitespace-nowrap text-muted-foreground"
                title={`${sortedReceipts.length} ${sortedReceipts.length === 1 ? "Buchung" : "Buchungen"}`}
              >
                {sortedReceipts.length}
                <span className="hidden @min-[720px]:inline">
                  {" "}
                  {sortedReceipts.length === 1 ? "Buchung" : "Buchungen"}
                </span>
              </span>
            ) : null}
            <div className="relative" ref={columnPanelRef}>
              <Button
                kind="ghost"
                iconOnly
                icon={faColumns}
                onClick={() => setIsColumnPanelOpen((current) => !current)}
                aria-haspopup="dialog"
                aria-expanded={isColumnPanelOpen}
                aria-label="Spalten verwalten"
                title="Spalten verwalten"
              />

              {isColumnPanelOpen ? (
                <div
                  className={`absolute right-0 top-full z-20 mt-2 w-[320px] knglmrt-border bg-popover p-3 text-popover-foreground ${NARROW_POPOVER_CLASS_NAME}`}
                  role="dialog"
                  aria-label="Spalten verwalten"
                >
                  <div className="mb-2">
                    <p className="font-semibold">Spalten verwalten</p>
                    <p className="text-muted-foreground">
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
                          className="flex items-center gap-2 border border-border px-2 py-2"
                        >
                          <Choice
                            className="min-w-0 flex-1"
                            label={<span className="truncate">{column.label}</span>}
                            checked={isVisible}
                            disabled={disableHide}
                            onChange={() => toggleColumnVisibility(column.key)}
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              kind="ghost"
                              iconOnly
                              icon={faArrowUp}
                              onClick={() => moveColumn(column.key, -1)}
                              disabled={index === 0}
                              aria-label={`${column.label} nach oben verschieben`}
                            />
                            <Button
                              kind="ghost"
                              iconOnly
                              icon={faArrowDown}
                              onClick={() => moveColumn(column.key, 1)}
                              disabled={index === columnOrder.length - 1}
                              aria-label={`${column.label} nach unten verschieben`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {receiptsError ? (
        <div className="shrink-0 border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive">
          {receiptsError}
        </div>
      ) : null}

      <ReceiptDetailDrawer
        receiptId={selectedReceiptId}
        costCenterOptions={allCostCenters}
        onCostCentersChanged={loadCostCenters}
        onClose={() => setSelectedReceiptId(null)}
        onSaved={() => {
          void loadReceipts(werkbereichCostCenterValues);
        }}
      />

      <div className="@container max-h-[70vh] min-h-0 overflow-auto knglmrt-border bg-card md:max-h-none">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--hairline-color)]">
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
                    className={`whitespace-nowrap px-4 py-3 font-bold text-foreground ${column.headerWidthClassName ?? ""} ${getHeaderAlignmentClassName(
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
                        className={`group inline-flex w-full items-center gap-1.5 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${getHeaderButtonAlignmentClassName(
                          column.align,
                        )}`}
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
                            className={`leading-none ${
                              isActiveSort
                                ? "opacity-100"
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
          <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-border">
            {loadingReceipts
              ? renderMessageRow(
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={faSpinner}
                      spin
                      className="h-4 w-4"
                    />
                    Belege werden geladen…
                  </span>,
                )
              : sortedReceipts.length === 0
                ? renderMessageRow("Keine Belege gefunden.")
                : groupByProject
                  ? projectGroups.map((group) => (
                      <Fragment key={group.key}>
                        <tr className="bg-primary-soft">
                          <td colSpan={visibleColumnCount} className="p-0">
                            {/* Bleibt beim seitlichen Scrollen im Blick:
                                so breit wie der sichtbare Tabellenausschnitt. */}
                            <div className="sticky left-0 flex w-[100cqw] items-baseline justify-between gap-4 px-4 py-3">
                              <span className="flex items-baseline gap-3">
                                <span className="font-bold">{group.label}</span>
                                <span className="text-muted-foreground">
                                  {group.count}{" "}
                                  {group.count === 1 ? "Buchung" : "Buchungen"}
                                </span>
                              </span>
                              <span className="whitespace-nowrap">
                                Guthaben{" "}
                                <span
                                  className={`knglmrt-num font-bold! ${group.saldo < 0 ? "text-primary" : ""}`}
                                >
                                  {formatCents(group.saldo)}
                                </span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {group.receipts.map((receipt) =>
                          renderReceiptRow(receipt, `${group.key}-${receipt.id}`),
                        )}
                      </Fragment>
                    ))
                  : sortedReceipts.map((receipt) =>
                      renderReceiptRow(receipt, receipt.id),
                    )}
          </tbody>
        </table>
      </div>

      {/* Ab md hält das Flex-Layout die Leiste unten — sticky würde sie am
          unteren Innenabstand der Shell (40px) festhalten. Der negative
          Rand zieht sie stattdessen näher an den Rand. */}
      {showSummary ? (
        <div className="@container sticky bottom-0 z-10 shrink-0 bg-background py-3 md:static md:-mb-7 md:py-0">
          {/* Bricht nie um: unter 1100px stehen die Beschriftungen über den
              Werten, und Schrift, Abstände und Innenränder wachsen mit der
              Breite der Zeile (cqw) — so passt sie bis auf Telefonbreite. */}
          <div className="flex flex-nowrap items-stretch justify-end gap-2 @min-[640px]:gap-3">
            <div className="flex flex-nowrap items-center gap-x-[clamp(8px,2.5cqw,32px)] knglmrt-border bg-muted px-[clamp(8px,2.5cqw,20px)] py-2 @min-[1100px]:py-3">
              {cashRegisterAccount !== undefined ? (
                <SummaryFigure
                  label="Barkasse"
                  title={cashRegisterError ?? undefined}
                  value={
                    cashRegisterBalance !== null
                      ? formatCents(cashRegisterBalance)
                      : "—"
                  }
                />
              ) : null}
              <SummaryFigure
                label="Einnahmen"
                value={formatSignedCents(totalIncome)}
                valueClassName="text-emerald-700 dark:text-emerald-400"
              />
              <SummaryFigure
                label="Ausgaben"
                value={formatCents(-totalExpense)}
                valueClassName="text-destructive"
              />
            </div>
            <div className="flex shrink-0 flex-col justify-center gap-0.5 bg-[var(--knglmrt-dark-100)] px-[clamp(8px,2.5cqw,20px)] py-2 text-white @min-[1100px]:flex-row @min-[1100px]:items-center @min-[1100px]:gap-5 @min-[1100px]:py-3">
              <span className="knglmrt-label whitespace-nowrap text-[length:clamp(11px,3cqw,14px)]!">
                Guthaben
                <span className="hidden @min-[640px]:inline">
                  {" "}
                  · {werkbereich.label} gesamt
                </span>
              </span>
              <span
                className={`knglmrt-value whitespace-nowrap text-[length:clamp(13px,4cqw,24px)]! leading-tight! @min-[1100px]:text-[length:var(--ui-size-value)]! ${availableSaldo < 0 ? "text-[var(--knglmrt-pink-60)]" : ""}`}
              >
                {formatCents(availableSaldo)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
