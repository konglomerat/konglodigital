"use client";

// Belege eines Werkbereichs (zweistellige Kostenstelle 2) samt seiner
// Unterprojekte (dreistellig). Filter oben, Salden in einer schlanken Zeile
// unter der Tabelle.
import {
  Fragment,
  type CSSProperties,
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
  faArrowLeft,
  faArrowUp,
  faCheck,
  faColumns,
  faEllipsis,
  faFileCsv,
  faFileExcel,
  faFilePdf,
  faRotateLeft,
  faSort,
  faSortDown,
  faSortUp,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import FieldShell from "@/components/knglmrt/FieldShell";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import SegmentedControl from "@/components/knglmrt/SegmentedControl";
import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import {
  type BuchhaltungWerkbereich,
  belongsToWerkbereich,
  getWerkbereichCostCenterCandidates,
} from "@/lib/buchhaltung-werkbereiche";
import type {
  CampaiBalanceReceipt,
  CampaiReceiptPosition,
} from "@/lib/campai-balance-receipts";
import {
  CASH_REGISTER_ACCOUNT_BY_COST_CENTER2,
  OPENING_BALANCE_TYPE,
  isCashRegisterAccount,
} from "@/lib/campai-cash-register-balances";
import type { CampaiCashRegisterBalanceSummary } from "@/lib/campai-cash-register-balances";
import type {
  BalanceTableDensity,
  MemberProfilePreferences,
} from "@/lib/member-profiles";

import NewBookingMenu from "./NewBookingMenu";
import PeriodFilter, {
  describePeriod,
  toIsoDate,
  yearPeriod,
  type Period,
} from "./PeriodFilter";
import ProjectFilter, { type ProjectFilterOption } from "./ProjectFilter";
import ReceiptSearch from "./ReceiptSearch";
import ReceiptDetailDrawer from "./receipt-detail-drawer";
import {
  exportTable,
  type ExportCell,
  type ExportColumn,
  type ExportFormat,
} from "./receipts-export";

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
type SearchScope =
  | "all"
  | "receiptNumber"
  | "description"
  | "accountName"
  | "amount"
  | "project"
  | "paymentAccounts"
  | "tags"
  | "date";

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

const SEARCH_SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: "all", label: "Alle Felder" },
  { value: "receiptNumber", label: "Beleg" },
  { value: "description", label: "Beschreibung" },
  { value: "accountName", label: "Sender/Empfänger" },
  { value: "amount", label: "Betrag" },
  { value: "project", label: "Sphäre/Projekt" },
  { value: "paymentAccounts", label: "Zahlkonto" },
  { value: "tags", label: "Tags" },
  { value: "date", label: "Datum" },
];

const CURRENT_YEAR = String(new Date().getFullYear());

// In der schmalsten Stufe scrollt die Filterzeile seitlich und würde ein
// absolut gesetztes Popover abschneiden. `fixed` ohne `top` bleibt an seiner
// statischen Stelle unter dem Auslöser, entkommt aber dem Scrollcontainer.
const NARROW_POPOVER_CLASS_NAME =
  "@max-[559px]:fixed @max-[559px]:inset-x-4 @max-[559px]:top-auto @max-[559px]:w-auto";
// Dasselbe für die Filter links, deren Container nur den Platz neben Suche
// und Drei-Punkte-Menü bekommt.
const FILTERS_NARROW_POPOVER_CLASS_NAME =
  "@max-[419px]:fixed @max-[419px]:inset-x-4 @max-[419px]:top-auto @max-[419px]:w-auto";


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
  [OPENING_BALANCE_TYPE]: "Eröffnungsbestand Barkasse",
};

const OPENING_BALANCE_HINT =
  "Eröffnungsbestand der Barkasse — nicht in den Einnahmen enthalten, steckt schon im Kassenbestand";

const CASH_REGISTER_TYPE_LABEL = "Kassenbuchung";

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

// Zeilenabstand der Tabelle. Die Zellen lesen ihn aus CSS-Variablen, die
// <table> setzt — „Komfortabel" ist das ursprüngliche Maß, die beiden
// anderen bringen mehr Zeilen auf kleine Bildschirme.
const DENSITY_OPTIONS: {
  value: BalanceTableDensity;
  label: string;
  style: Record<string, string>;
}[] = [
  {
    value: "comfortable",
    label: "Komfortabel",
    style: {
      "--cell-py": "0.75rem",
      "--chip-py": "3px",
      "--action-cell-py": "0.5rem",
      "--action-size": "2rem",
    },
  },
  {
    value: "standard",
    label: "Standard",
    style: {
      "--cell-py": "0.5rem",
      "--chip-py": "2px",
      "--action-cell-py": "0.25rem",
      "--action-size": "1.75rem",
    },
  },
  {
    value: "compact",
    label: "Kompakt",
    style: {
      "--cell-py": "0.25rem",
      "--chip-py": "0px",
      "--action-cell-py": "0.125rem",
      "--action-size": "1.5rem",
    },
  },
];

const EXPORT_OPTIONS: {
  value: ExportFormat;
  label: string;
  icon: typeof faFileCsv;
}[] = [
  { value: "xlsx", label: "Excel (XLSX)", icon: faFileExcel },
  { value: "csv", label: "CSV", icon: faFileCsv },
  { value: "pdf", label: "PDF", icon: faFilePdf },
];

// Spaltenbreiten im Export (Zeichen in XLSX, Gewicht im PDF).
const EXPORT_COLUMN_WIDTHS: Partial<Record<ColumnKey, number>> = {
  receiptNumber: 14,
  paymentStatus: 12,
  Sphäre: 16,
  description: 40,
  accountName: 26,
  paymentAccounts: 18,
  "positions.account": 34,
  type: 14,
  tags: 18,
};

const isDensity = (value: unknown): value is BalanceTableDensity =>
  DENSITY_OPTIONS.some((option) => option.value === value);

const CELL_CLASS_NAME =
  "whitespace-nowrap px-4 py-[var(--cell-py)] text-foreground";
const CELL_TEXT_CLASS_NAME =
  "block overflow-hidden text-ellipsis whitespace-nowrap";
const CHIP_CLASS_NAME =
  "inline-block max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap px-[7px] py-[var(--chip-py)] knglmrt-tag text-foreground";

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
  density: BalanceTableDensity = "comfortable",
) => {
  return JSON.stringify({
    costCenter2,
    columns: {
      order: columnOrder,
      hidden: hiddenColumnKeys,
    },
    density,
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

// Zahlungsdatum als YYYY-MM-DD in Ortszeit — vergleichbar mit <input type="date">.
const getPaidDate = (receipt: CampaiBalanceReceipt): string | null => {
  const timestamp = receipt.paidAt ? Date.parse(receipt.paidAt) : Number.NaN;
  return Number.isNaN(timestamp) ? null : toIsoDate(new Date(timestamp));
};

const FILTER_SEGMENT_CLASS_NAME = "min-h-0! h-9 py-0";

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
  /** Einziger freigegebener Werkbereich: /receipts leitet direkt hierher. */
  isOnlyWerkbereich?: boolean;
};

export default function WerkbereichReceipts({
  werkbereich,
  isOnlyWerkbereich = false,
}: WerkbereichReceiptsProps) {
  // Drei-Punkte-Menü: zu, Menü oder die Seite „Spalten verwalten".
  const [viewMenu, setViewMenu] = useState<null | "menu" | "columns">(null);
  const [density, setDensity] = useState<BalanceTableDensity>("comfortable");
  const densityStyle = (DENSITY_OPTIONS.find(
    (option) => option.value === density,
  ) ?? DENSITY_OPTIONS[0]).style as CSSProperties;
  const [columnOrder, setColumnOrder] =
    useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<ColumnKey[]>([]);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [allCostCenters, setAllCostCenters] = useState<CostCenterOption[]>([]);
  const [costCenter1Labels, setCostCenter1Labels] = useState<
    CostCenterOption[]
  >([]);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [period, setPeriod] = useState<Period>(() => yearPeriod(CURRENT_YEAR));
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
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
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
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

        const nextDensity = isDensity(balancePreferences?.density)
          ? balancePreferences.density
          : "comfortable";

        setColumnOrder(nextColumnOrder);
        setHiddenColumnKeys(nextHiddenColumnKeys);
        setDensity(nextDensity);
        savedBalancePreferencesRef.current = serializeBalancePreferences(
          balancePreferences?.costCenter2 ?? [],
          nextColumnOrder,
          nextHiddenColumnKeys,
          nextDensity,
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
    if (viewMenu === null) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!viewMenuRef.current?.contains(event.target as Node)) {
        setViewMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [viewMenu]);

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

  // Der Werkbereich selbst und alle Unterprojekte mit seinen beiden Ziffern —
  // aus dem Muster statt aus der Kostenstellenliste, damit die Belege nicht
  // erst auf deren Abruf warten.
  const werkbereichCostCenterValues = useMemo(
    () => getWerkbereichCostCenterCandidates(werkbereich.value),
    [werkbereich.value],
  );

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

  useEffect(() => {
    void loadReceipts(werkbereichCostCenterValues);
  }, [loadReceipts, werkbereichCostCenterValues]);

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

  // Merkt sich den zuletzt geöffneten Werkbereich (für /receipts), die
  // Spaltenauswahl und den Zeilenabstand.
  useEffect(() => {
    if (!hasLoadedPreferences) {
      return;
    }

    const nextSerializedPreferences = serializeBalancePreferences(
      [werkbereich.value],
      columnOrder,
      hiddenColumnKeys,
      density,
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
          density,
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
    density,
    hasLoadedPreferences,
    hiddenColumnKeys,
    werkbereich.value,
  ]);

  const visibleReceipts = useMemo(
    () =>
      receipts.filter(
        (receipt) => !(receipt.type && EXCLUDED_TYPES.has(receipt.type)),
      ),
    [receipts],
  );

  const yearsWithReceipts = useMemo(() => {
    const years = new Set<string>();

    for (const receipt of visibleReceipts) {
      const year = getPaidDate(receipt)?.slice(0, 4);
      if (year) {
        years.add(year);
      }
    }

    return Array.from(years).sort((left, right) => Number(right) - Number(left));
  }, [visibleReceipts]);

  // Belege ohne Zahlungsdatum bleiben in jedem Zeitraum stehen — sie sind offen.
  const receiptsMatchingToolbarFilters = useMemo(() => {
    return visibleReceipts.filter((receipt) => {
      const paidDate = getPaidDate(receipt);
      if (paidDate && (paidDate < period.from || paidDate > period.to)) {
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
  }, [kindFilter, period, visibleReceipts]);

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

  const receiptsMatchingProjects = useMemo(() => {
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

  // Durchsuchbarer Text je Bereich — so, wie er in der Tabelle steht, plus
  // Beträge ohne Tausenderpunkt und mit Dezimalpunkt.
  const getSearchText = useCallback(
    (receipt: CampaiBalanceReceipt, scope: SearchScope): string => {
      const formatAmountVariants = (cents: number | null) => {
        if (cents === null) {
          return "";
        }
        const plain = (Math.abs(cents) / 100).toFixed(2);
        return `${formatCents(cents)} ${plain} ${plain.replace(".", ",")}`;
      };

      switch (scope) {
        case "receiptNumber":
          return receipt.receiptNumber ?? "";
        case "description":
          return [
            receipt.description,
            ...receipt.positions.map((position) => position.description),
          ]
            .filter(Boolean)
            .join(" ");
        case "accountName":
          return receipt.accountName ?? "";
        case "amount":
          return [
            formatAmountVariants(receipt.totalGrossAmount),
            ...receipt.positions.map((position) =>
              formatAmountVariants(position.amount),
            ),
          ].join(" ");
        case "project":
          return receipt.positions
            .flatMap((position) => [
              position.costCenter1 !== null
                ? `${position.costCenter1} ${costCenterLabelMap.get(String(position.costCenter1)) ?? ""}`
                : null,
              getProjectLabel(getPositionCostCenter2Key(position)),
              position.costCenter2 !== null ? String(position.costCenter2) : null,
            ])
            .filter(Boolean)
            .join(" ");
        case "paymentAccounts":
          return [
            ...receipt.paymentAccountNames,
            ...receipt.paymentAccounts.map(String),
          ].join(" ");
        case "tags":
          return receipt.tags.join(" ");
        case "date":
          return [receipt.paidAt, receipt.receiptDate, receipt.createdAt]
            .filter(Boolean)
            .map((value) => formatDate(value))
            .join(" ");
        case "all":
          return [
            ...SEARCH_SCOPE_OPTIONS.filter((option) => option.value !== "all").map(
              (option) => getSearchText(receipt, option.value),
            ),
            receipt.type ? (TYPE_LABELS[receipt.type] ?? receipt.type) : "",
            getPaymentStatusLabel(receipt.paymentStatus) ?? "",
          ].join(" ");
      }
    },
    [costCenterLabelMap, getProjectLabel],
  );

  const searchTerms = useMemo(
    () => searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [searchQuery],
  );

  // Mehrere Wörter müssen alle vorkommen, egal in welcher Reihenfolge.
  const filteredReceipts = useMemo(() => {
    if (searchTerms.length === 0) {
      return receiptsMatchingProjects;
    }

    return receiptsMatchingProjects.filter((receipt) => {
      const text = getSearchText(receipt, searchScope).toLowerCase();
      return searchTerms.every((term) => text.includes(term));
    });
  }, [getSearchText, receiptsMatchingProjects, searchScope, searchTerms]);

  // Markiert die Suchwörter in einer Zelle — nur in Spalten, die zum
  // gewählten Suchbereich gehören. `all` heißt: nur bei „Alle Felder".
  const searchPattern = useMemo(
    () =>
      searchTerms.length > 0
        ? new RegExp(
            `(${searchTerms
              .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("|")})`,
            "gi",
          )
        : null,
    [searchTerms],
  );

  const highlight = useCallback(
    (text: string, cellScope: SearchScope): ReactNode => {
      if (
        !searchPattern ||
        (searchScope !== "all" && searchScope !== cellScope)
      ) {
        return text;
      }

      return text.split(searchPattern).map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="bg-primary-soft text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      );
    },
    [searchPattern, searchScope],
  );

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

  // Die Summen zählen genau die Zeilen, die in der Tabelle stehen — also auch
  // nach Projekt und Suche gefiltert.
  const { totalIncome, totalExpense, saldo, transferSaldo } = useMemo(() => {
    let income = 0;
    let expense = 0;
    // Zahlungsweg pro Beleg: Campai bucht Barzahlungen auf ein Kassenkonto
    // (160xx), alles andere gilt hier als überwiesen.
    let transfer = 0;

    for (const receipt of filteredReceipts) {
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
  }, [filteredReceipts]);

  // Projekt oder Suche schränken die Tabelle auf einen Ausschnitt ein.
  const isNarrowed = activeProjectKeys.length > 0 || searchTerms.length > 0;
  const summaryScopeLabel =
    activeProjectKeys.length > 0
      ? activeProjectKeys.map((key) => getProjectLabel(key)).join(", ")
      : searchTerms.length > 0
        ? "Auswahl"
        : `${werkbereich.label} gesamt`;

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
  // Kasse bleibt es beim reinen Beleg-Saldo. Der Kassenbestand gehört zum
  // ganzen Werkbereich — im Ausschnitt zählt er deshalb nicht mit.
  const showCashRegister = cashRegisterAccount !== undefined && !isNarrowed;
  const availableSaldo =
    showCashRegister && cashRegisterBalance !== null
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
      const isOpeningBalance = receipt.type === OPENING_BALANCE_TYPE;
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
                {highlight(receipt.receiptNumber ?? "—", "receiptNumber")}
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
                  {highlight(statusLabel, "all")}
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
                {highlight(formatDate(receipt.paidAt), "date")}
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
                {highlight(
                  getFirstPositionValue(receipt.positions, "costCenter1"),
                  "project",
                )}
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
                {highlight(receiptDescription, "description")}
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
                {highlight(receipt.accountName ?? "—", "accountName")}
              </span>
            </td>
          );
        case "Einnahmen":
          // Eröffnungsbestand: Betrag sichtbar, aber gedämpft und ohne „+“,
          // weil er in keiner Summe mitzählt.
          if (isOpeningBalance && amount !== null) {
            return (
              <td
                key={cellKey}
                className={`${CELL_CLASS_NAME} knglmrt-num text-right text-muted-foreground!`}
              >
                <span
                  className={CELL_TEXT_CLASS_NAME}
                  title={OPENING_BALANCE_HINT}
                >
                  ({formatCents(amount)})
                </span>
              </td>
            );
          }
          return (
            <td
              key={cellKey}
              className={`${CELL_CLASS_NAME} knglmrt-num text-right font-bold!`}
            >
              <span className={CELL_TEXT_CLASS_NAME} title={incomeCell}>
                {highlight(incomeCell, "amount")}
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
                {highlight(expenseCell, "amount")}
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
                {highlight(paymentAccountsLabel, "paymentAccounts")}
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
                          ? highlight(formatCents(position.amount), "amount")
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
        case "type": {
          const typeLabel =
            receipt.source === "cashRegister" && !isOpeningBalance
              ? CASH_REGISTER_TYPE_LABEL
              : receipt.type
                ? (TYPE_LABELS[receipt.type] ?? receipt.type)
                : null;
          return (
            <td key={cellKey} className={CELL_CLASS_NAME}>
              {typeLabel ? (
                <span
                  className={`${CHIP_CLASS_NAME} bg-muted`}
                  title={typeLabel}
                >
                  {highlight(typeLabel, "all")}
                </span>
              ) : (
                "—"
              )}
            </td>
          );
        }
        case "receiptDate":
          return (
            <td key={cellKey} className={`${CELL_CLASS_NAME} knglmrt-num`}>
              <span
                className={CELL_TEXT_CLASS_NAME}
                title={formatDate(receipt.receiptDate)}
              >
                {highlight(formatDate(receipt.receiptDate), "date")}
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
                {highlight(formatDate(receipt.createdAt), "date")}
              </span>
            </td>
          );
        case "tags":
          return (
            <td key={cellKey} className="px-4 py-[var(--cell-py)]">
              {receipt.tags.length > 0 ? (
                <div
                  className="inline-flex max-w-full flex-nowrap gap-1 overflow-hidden align-middle"
                  title={receipt.tags.join(", ")}
                >
                  {receipt.tags.map((tag) => (
                    <span key={tag} className={`${CHIP_CLASS_NAME} bg-muted`}>
                      {highlight(tag, "tags")}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </td>
          );
        case "pdf":
          // Kassenbuchungen haben keinen Beleg zum Herunterladen.
          if (receipt.source === "cashRegister") {
            return (
              <td
                key={cellKey}
                className="px-4 py-[var(--action-cell-py)] text-center"
              >
                —
              </td>
            );
          }
          return (
            <td
                key={cellKey}
                className="px-4 py-[var(--action-cell-py)] text-center"
              >
              <a
                href={`/api/campai/balance/receipts/${receipt.id}/download`}
                className="inline-flex h-[var(--action-size)] w-[var(--action-size)] items-center justify-center knglmrt-border bg-card text-foreground transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
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
    [costCenterLabelMap, highlight],
  );

  // Kassenbuchungen sind keine Belege — die Detailansicht hätte nichts zu laden.
  const renderReceiptRow = (receipt: CampaiBalanceReceipt, key: string) =>
    receipt.source === "cashRegister" ? (
      <tr
        key={key}
        title={
          receipt.type === OPENING_BALANCE_TYPE
            ? OPENING_BALANCE_HINT
            : "Kassenbuchung aus dem Campai-Kassenbuch"
        }
      >
        {visibleColumns.map((column) => renderReceiptCell(column.key, receipt))}
      </tr>
    ) : (
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

  // Exportiert, was die Tabelle gerade zeigt: gefilterte und sortierte
  // Belege, sichtbare Spalten in ihrer Reihenfolge (ohne PDF-Link).
  const getExportCell = useCallback(
    (columnKey: ColumnKey, receipt: CampaiBalanceReceipt): ExportCell => {
      const amount = receipt.totalGrossAmount;
      const isIncome = receipt.type ? INCOME_TYPES.has(receipt.type) : false;
      const isExpense = receipt.type ? EXPENSE_TYPES.has(receipt.type) : false;

      switch (columnKey) {
        case "receiptNumber":
          return receipt.receiptNumber;
        case "paymentStatus":
          return getPaymentStatusLabel(receipt.paymentStatus);
        case "paidAt":
          return receipt.paidAt;
        case "Sphäre": {
          const label = formatFirstPositionField(
            receipt.positions,
            "costCenter1",
            costCenterLabelMap,
          );
          return label === "—" ? null : label;
        }
        case "description": {
          const description = getReceiptDescription(receipt);
          return description === "—" ? null : description;
        }
        case "accountName":
          return receipt.accountName;
        case "Einnahmen":
          // Eröffnungsbestand als Text, damit er in keiner Summe mitzählt.
          if (receipt.type === OPENING_BALANCE_TYPE && amount !== null) {
            return `(${formatCents(amount)})`;
          }
          return isIncome ? amount : null;
        case "Ausgaben":
          return isExpense && amount !== null ? -amount : null;
        case "paymentAccounts":
          return receipt.paymentAccountNames.length > 0
            ? receipt.paymentAccountNames.join(", ")
            : receipt.paymentAccounts.length > 0
              ? receipt.paymentAccounts
                  .map((account) => `Konto ${account}`)
                  .join(", ")
              : null;
        case "positions.account":
          return receipt.positions.length > 0
            ? formatCostCentersWithAmounts(receipt.positions, costCenterLabelMap)
            : null;
        case "type":
          return receipt.source === "cashRegister" &&
            receipt.type !== OPENING_BALANCE_TYPE
            ? CASH_REGISTER_TYPE_LABEL
            : receipt.type
              ? (TYPE_LABELS[receipt.type] ?? receipt.type)
              : null;
        case "receiptDate":
          return receipt.receiptDate;
        case "createdAt":
          return receipt.createdAt;
        case "tags":
          return receipt.tags.length > 0 ? receipt.tags.join(", ") : null;
        case "pdf":
          return null;
      }
    },
    [costCenterLabelMap],
  );

  const handleExport = async (format: ExportFormat) => {
    const columns = visibleColumns.filter((column) => column.key !== "pdf");
    const exportColumns: ExportColumn[] = columns.map((column) => ({
      label: column.label,
      kind:
        column.key === "Einnahmen" || column.key === "Ausgaben"
          ? "amount"
          : column.key === "paidAt" ||
              column.key === "receiptDate" ||
              column.key === "createdAt"
            ? "date"
            : "text",
      width: EXPORT_COLUMN_WIDTHS[column.key],
    }));

    const filterLabels = [
      describePeriod(period),
      kindFilter !== "all"
        ? KIND_FILTER_OPTIONS.find((option) => option.value === kindFilter)
            ?.label
        : null,
      activeProjectKeys.length > 0
        ? activeProjectKeys.map((key) => getProjectLabel(key)).join(", ")
        : null,
      searchQuery.trim() ? `Suche „${searchQuery.trim()}"` : null,
      `${sortedReceipts.length} ${sortedReceipts.length === 1 ? "Buchung" : "Buchungen"}`,
    ].filter(Boolean);

    const fileSlug = `${werkbereich.label}-${describePeriod(period)}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    setExportingFormat(format);
    setExportError(null);
    try {
      await exportTable(
        {
          fileName: `belege-${fileSlug}`,
          title: `Belege · ${werkbereich.label}`,
          subtitle: filterLabels.join(" · "),
          columns: exportColumns,
          rows: sortedReceipts.map((receipt) =>
            columns.map((column) => getExportCell(column.key, receipt)),
          ),
          summary: [
            ...(showCashRegister && cashRegisterBalance !== null
              ? [{ label: "Barkasse", value: formatCents(cashRegisterBalance) }]
              : []),
            { label: "Einnahmen", value: formatSignedCents(totalIncome) },
            { label: "Ausgaben", value: formatCents(-totalExpense) },
            { label: "Guthaben", value: formatCents(availableSaldo) },
          ],
        },
        format,
      );
      setViewMenu(null);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Export fehlgeschlagen.",
      );
    } finally {
      setExportingFormat(null);
    }
  };

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

  const showSummary = !loadingReceipts && !receiptsError;

  return (
    // Ab md füllt die Ansicht die Höhe: die Tabelle scrollt in sich, die
    // Saldo-Zeile steht immer unten.
    <div className="flex w-full flex-col gap-4 md:h-full">
      <div className="shrink-0">
        <SubPageTitle
          ressort="buchhaltung"
          title={werkbereich.label}
          hideBack={isOnlyWerkbereich}
          customActions={<NewBookingMenu />}
        />
      </div>

      {costCentersError ? (
        <div className="shrink-0 border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive">
          {costCentersError}
        </div>
      ) : null}

      {/* Eine Zeile, nie breiter als die Seite; Beschriftungen stehen über
          den Feldern, alles sitzt auf der Unterkante. Rechts Suche und
          Drei-Punkte-Menü in voller Größe; die Filter links stehen in einem
          eigenen Container, der nur den Rest bekommt — klappt die Suche auf,
          rücken sie also zusammen. Ihre Stufen (Container-Queries auf den
          linken Teil): ≥720px „Art" als Segmente, darunter als Auswahlliste.
          Unter 420px scrollen die Filter seitlich, die Popover hängen dann
          fest unter ihnen, statt abgeschnitten zu werden. */}
      <div className="@container shrink-0">
        <div className="flex flex-nowrap items-end gap-2 @min-[560px]:gap-3">
          <div className="@container min-w-0 flex-1">
            <div className="flex flex-nowrap items-end gap-2 overflow-x-auto @min-[420px]:gap-3 @min-[420px]:overflow-visible">
              <FieldShell as="div" label="Art" className="shrink-0">
                <div className="hidden @min-[720px]:block">
                  <SegmentedControl
                    tone="ink"
                    size="medium"
                    segmentClassName={FILTER_SEGMENT_CLASS_NAME}
                    value={kindFilter}
                    options={KIND_FILTER_OPTIONS}
                    onChange={setKindFilter}
                  />
                </div>
                <FilterSelect
                  className="@min-[720px]:hidden"
                  label="Art"
                  value={kindFilter}
                  options={KIND_FILTER_OPTIONS}
                  onChange={setKindFilter}
                />
              </FieldShell>
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                years={yearsWithReceipts}
                panelClassName={FILTERS_NARROW_POPOVER_CLASS_NAME}
              />
              <ProjectFilter
                options={projectOptions}
                value={activeProjectKeys}
                onChange={setSelectedProjects}
                formatAmount={formatCents}
                groupByProject={groupByProject}
                onGroupByProjectChange={setGroupByProject}
                panelClassName={FILTERS_NARROW_POPOVER_CLASS_NAME}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-end gap-2">
            <ReceiptSearch
              value={searchQuery}
              onChange={setSearchQuery}
              scope={searchScope}
              scopes={SEARCH_SCOPE_OPTIONS}
              onScopeChange={setSearchScope}
            />
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() =>
                  setViewMenu((current) => (current === null ? "menu" : null))
                }
                aria-haspopup="menu"
                aria-expanded={viewMenu !== null}
                aria-label="Ansicht und Einstellungen"
                title="Ansicht und Einstellungen"
                className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center knglmrt-border bg-card transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <FontAwesomeIcon
                  icon={faEllipsis}
                  aria-hidden="true"
                  className="h-4 w-4"
                />
              </button>

              {viewMenu === "menu" ? (
                <ul
                  role="menu"
                  aria-label="Ansicht und Einstellungen"
                  className={`absolute right-0 top-full z-20 mt-2 w-[260px] border border-primary bg-popover py-2 text-popover-foreground ${NARROW_POPOVER_CLASS_NAME}`}
                >
                  <li
                    role="presentation"
                    className="knglmrt-label px-5 pt-1 pb-1.5"
                  >
                    Zeilenabstand
                  </li>
                  {DENSITY_OPTIONS.map((option) => {
                    const isActive = option.value === density;
                    return (
                      <li key={option.value} role="none">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => setDensity(option.value)}
                          className={`flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-primary-soft ${isActive ? "font-bold" : ""}`}
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                            {isActive ? (
                              <FontAwesomeIcon
                                icon={faCheck}
                                aria-hidden="true"
                                className="h-3 w-3"
                              />
                            ) : null}
                          </span>
                          {option.label}
                        </button>
                      </li>
                    );
                  })}
                  <li
                    role="separator"
                    className="mx-5 my-2 border-t border-border"
                  />
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setViewMenu("columns")}
                      className="flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-primary-soft"
                    >
                      <FontAwesomeIcon
                        icon={faColumns}
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      Spalten verwalten …
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setColumnOrder(DEFAULT_COLUMN_ORDER);
                        setHiddenColumnKeys([]);
                        setViewMenu(null);
                      }}
                      className="flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-primary-soft"
                    >
                      <FontAwesomeIcon
                        icon={faRotateLeft}
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      Spalten zurücksetzen
                    </button>
                  </li>
                  <li
                    role="separator"
                    className="mx-5 my-2 border-t border-border"
                  />
                  <li
                    role="presentation"
                    className="knglmrt-label px-5 pt-1 pb-1.5"
                  >
                    Exportieren
                  </li>
                  {EXPORT_OPTIONS.map((option) => (
                    <li key={option.value} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={
                          exportingFormat !== null ||
                          loadingReceipts ||
                          sortedReceipts.length === 0
                        }
                        onClick={() => void handleExport(option.value)}
                        className="flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <FontAwesomeIcon
                          icon={
                            exportingFormat === option.value
                              ? faSpinner
                              : option.icon
                          }
                          spin={exportingFormat === option.value}
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        {option.label}
                      </button>
                    </li>
                  ))}
                  {exportError ? (
                    <li
                      role="presentation"
                      className="px-5 pt-1 text-destructive"
                    >
                      {exportError}
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {viewMenu === "columns" ? (
                <div
                  className={`absolute right-0 top-full z-20 mt-2 w-[320px] border border-primary bg-popover p-3 text-popover-foreground ${NARROW_POPOVER_CLASS_NAME}`}
                  role="dialog"
                  aria-label="Spalten verwalten"
                >
                  <div className="mb-2 flex items-start gap-2">
                    <Button
                      kind="ghost"
                      iconOnly
                      icon={faArrowLeft}
                      onClick={() => setViewMenu("menu")}
                      aria-label="Zurück zum Menü"
                      title="Zurück"
                    />
                    <div>
                      <p className="font-semibold">Spalten verwalten</p>
                      <p className="text-muted-foreground">
                        Spalten ein- oder ausblenden und ihre Reihenfolge
                        anpassen.
                      </p>
                    </div>
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
        <table
          className="min-w-full table-fixed border-collapse"
          style={densityStyle}
        >
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
                    className={`whitespace-nowrap px-4 py-[var(--cell-py)] font-bold text-foreground ${column.headerWidthClassName ?? ""} ${getHeaderAlignmentClassName(
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
                            <div className="sticky left-0 flex w-[100cqw] items-baseline justify-between gap-4 px-4 py-[var(--cell-py)]">
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
            <span
              className="knglmrt-num mr-auto self-center whitespace-nowrap text-muted-foreground"
              title={`${sortedReceipts.length} ${sortedReceipts.length === 1 ? "Buchung" : "Buchungen"}`}
            >
              {sortedReceipts.length}
              <span className="hidden @min-[640px]:inline">
                {" "}
                {sortedReceipts.length === 1 ? "Buchung" : "Buchungen"}
              </span>
            </span>
            <div className="flex flex-nowrap items-center gap-x-[clamp(8px,2.5cqw,32px)] knglmrt-border bg-muted px-[clamp(8px,2.5cqw,20px)] py-2 @min-[1100px]:py-3">
              {showCashRegister ? (
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
                  · {summaryScopeLabel}
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
