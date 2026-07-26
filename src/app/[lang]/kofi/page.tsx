"use client";

import { Fragment, useDeferredValue, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faArrowTrendDown,
  faArrowTrendUp,
  faChartPie,
  faChevronDown,
  faChevronRight,
  faCircleCheck,
  faFilter,
  faReceipt,
  faSpinner,
  faTableCellsLarge,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import type {
  KoFiBlock,
  KoFiCarryoverSummary,
  KoFiGroupRow,
  KoFiMonthlySummary,
  KoFiResponse,
} from "@/lib/campai-kofi";
import PageTitle from "../components/PageTitle";

type ViewMode = "month" | "quarter" | "year";

const VIEW_OPTIONS: Array<{
  value: ViewMode;
  label: string;
  buttonLabel: string;
}> = [
  { value: "month", label: "Monat", buttonLabel: "Monatsansicht" },
  { value: "quarter", label: "Quartal", buttonLabel: "Quartalsansicht" },
  { value: "year", label: "Jahr", buttonLabel: "Jahresansicht" },
];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

const CHART_COLORS = [
  "#2f5e4e",
  "#5a7d4d",
  "#a36b29",
  "#b84c3c",
  "#496b89",
  "#7c6c9e",
];

const formatCurrency = (cents: number) => {
  const amount = cents / 100;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Datum unbekannt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatCount = (value: number) =>
  new Intl.NumberFormat("de-DE").format(value);

const numberClassName = (value: number) => {
  if (value < 0) {
    return "text-destructive";
  }

  if (value > 0) {
    return "text-success";
  }

  return "text-muted-foreground";
};

const projectSeries = (months: number[], viewMode: ViewMode) => {
  const carryover = months[0] ?? 0;
  const currentYearMonths = months.slice(1);

  if (viewMode === "year") {
    return [
      carryover,
      currentYearMonths.reduce((sum, value) => sum + value, 0),
    ];
  }

  if (viewMode === "quarter") {
    return [
      carryover,
      ...[0, 1, 2, 3].map((quarter) => {
        const start = quarter * 3;
        return currentYearMonths
          .slice(start, start + 3)
          .reduce((sum, value) => sum + value, 0);
      }),
    ];
  }

  return months;
};

const getPeriodLabels = (viewMode: ViewMode, year: number) => {
  if (viewMode === "year") {
    return [String(year - 1), String(year)];
  }

  if (viewMode === "quarter") {
    return [String(year - 1), ...QUARTER_LABELS];
  }

  return [String(year - 1), ...MONTH_LABELS];
};

const cumulativeCellStyle = (value: number, maxMagnitude: number) => {
  if (maxMagnitude === 0 || value === 0) {
    return undefined;
  }

  const intensity = Math.min(
    0.18,
    0.06 + (Math.abs(value) / maxMagnitude) * 0.12,
  );
  const color =
    value >= 0
      ? `rgba(22, 101, 52, ${intensity})`
      : `rgba(190, 24, 93, ${intensity})`;

  return { backgroundColor: color };
};

const SummaryCard = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
    <p className={`mt-3 text-2xl font-semibold tabular-nums ${accent}`}>
      {value}
    </p>
  </div>
);

const CostDistributionChart = ({ groups }: { groups: KoFiGroupRow[] }) => {
  const currentYearGroups = groups
    .map((group) => ({
      label: group.label,
      value: group.months
        .slice(1)
        .reduce((sum, monthValue) => sum + monthValue, 0),
    }))
    .filter((group) => group.value > 0)
    .sort((left, right) => right.value - left.value);
  const total = currentYearGroups.reduce(
    (sum, group) => sum + group.value,
    0,
  );
  const slices = currentYearGroups.slice(0, 5).map((group, index) => ({
    label: group.label,
    value: group.value,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const remainder = currentYearGroups
    .slice(5)
    .reduce((sum, group) => sum + group.value, 0);
  if (remainder > 0) {
    slices.push({
      label: "Weitere",
      value: remainder,
      color: "#d4d4d8",
    });
  }

  const gradient = slices
    .reduce(
      (result, slice) => {
        const start = result.progress;
        const progress =
          start + (total > 0 ? (slice.value / total) * 100 : 0);

        return {
          progress,
          stops: [
            ...result.stops,
            `${slice.color} ${start}% ${progress}%`,
          ],
        };
      },
      { progress: 0, stops: [] as string[] },
    )
    .stops.join(", ");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <FontAwesomeIcon
          icon={faChartPie}
          className="h-4 w-4 text-muted-foreground"
        />
        Kostenverteilung
      </div>
      <div className="mt-4 flex items-center gap-5">
        <div
          className="relative h-28 w-28 rounded-full border border-border"
          style={{
            background: gradient ? `conic-gradient(${gradient})` : "#f4f4f5",
          }}
        >
          <div className="absolute inset-[18px] rounded-full bg-card" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          {slices.length === 0 ? (
            <p className="text-muted-foreground">
              Keine Kostendaten im gewählten Filter.
            </p>
          ) : (
            slices.map((slice) => (
              <div key={slice.label} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {slice.label}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(slice.value)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const CashflowChart = ({
  monthlySummary,
}: {
  monthlySummary: KoFiMonthlySummary[];
}) => {
  const maxValue = Math.max(
    ...monthlySummary.flatMap((entry) => [entry.income, entry.expense]),
    0,
  );

  // Linear regression through the monthly balance — its slope visualises
  // whether the cashflow trend is heading up or down across the year.
  const n = monthlySummary.length;
  let slope = 0;
  let intercept = 0;
  if (n > 1) {
    const sumX = monthlySummary.reduce((sum, _, i) => sum + i, 0);
    const sumY = monthlySummary.reduce((sum, e) => sum + e.balance, 0);
    const sumXY = monthlySummary.reduce((sum, e, i) => sum + i * e.balance, 0);
    const sumXX = monthlySummary.reduce((sum, _, i) => sum + i * i, 0);
    const denom = n * sumXX - sumX * sumX;
    slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    intercept = (sumY - slope * sumX) / n;
  }
  const trendStart = intercept;
  const trendEnd = slope * (n - 1) + intercept;

  const yMin = Math.min(0, trendStart, trendEnd);
  const yMax = Math.max(maxValue, trendStart, trendEnd);
  const yRange = yMax - yMin || 1;
  const toY = (value: number) => 100 - ((value - yMin) / yRange) * 100;
  const startX = n > 1 ? (0.5 * 100) / n : 0;
  const endX = n > 1 ? ((n - 0.5) * 100) / n : 100;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <FontAwesomeIcon
          icon={faTableCellsLarge}
          className="h-4 w-4 text-muted-foreground"
        />
        Einnahmen vs. Ausgaben
      </div>
      <div className="mt-4">
        <div className="relative h-28">
          <div className="flex h-full items-end gap-2">
            {monthlySummary.map((entry) => {
              const incomeHeight =
                maxValue > 0 ? Math.max(6, (entry.income / maxValue) * 100) : 6;
              const expenseHeight =
                maxValue > 0
                  ? Math.max(6, (entry.expense / maxValue) * 100)
                  : 6;

              return (
                <div
                  key={entry.monthIndex}
                  className="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
                >
                  <div
                    className="w-2 rounded-t bg-success"
                    style={{ height: `${incomeHeight}%` }}
                    title={`Einnahmen ${entry.label}: ${formatCurrency(entry.income)}`}
                  />
                  <div
                    className="w-2 rounded-t bg-warning"
                    style={{ height: `${expenseHeight}%` }}
                    title={`Ausgaben ${entry.label}: ${formatCurrency(entry.expense)}`}
                  />
                </div>
              );
            })}
          </div>
          {n > 1 ? (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full text-foreground/70"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1={startX.toFixed(2)}
                y1={toY(trendStart).toFixed(2)}
                x2={endX.toFixed(2)}
                y2={toY(trendEnd).toFixed(2)}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}
        </div>
        <div className="mt-2 flex gap-2">
          {monthlySummary.map((entry) => (
            <span
              key={entry.monthIndex}
              className="min-w-0 flex-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {entry.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-success" />
          Einnahmen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-warning" />
          Ausgaben
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-5 border-t border-dashed border-foreground/70" />
          Saldo-Trend
        </span>
      </div>
    </div>
  );
};

type MonthlyOverviewRow = KoFiMonthlySummary & {
  isForecast: boolean;
  isCarryover: boolean;
};

const buildForecastRows = (
  monthlySummary: KoFiMonthlySummary[],
  year: number,
  carryover: KoFiCarryoverSummary,
): MonthlyOverviewRow[] => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Forecast only for the current year, for months strictly after the
  // current (in-progress) month. Past years stay fully actual; future years
  // have no historical basis to forecast from.
  const forecastStart =
    year === currentYear ? currentMonth + 1 : year < currentYear ? 12 : 12;

  const elapsed = monthlySummary.slice(0, forecastStart);
  const hasBasis = elapsed.length > 0;
  const avgIncome = hasBasis
    ? elapsed.reduce((sum, entry) => sum + entry.income, 0) / elapsed.length
    : 0;
  const avgExpense = hasBasis
    ? elapsed.reduce((sum, entry) => sum + entry.expense, 0) / elapsed.length
    : 0;

  let cumulative = carryover.balance;
  const monthRows = monthlySummary.map((entry) => {
    const isForecast = hasBasis && entry.monthIndex >= forecastStart;
    const income = isForecast ? avgIncome : entry.income;
    const expense = isForecast ? avgExpense : entry.expense;
    const balance = income - expense;
    cumulative += balance;

    return {
      monthIndex: entry.monthIndex,
      label: entry.label,
      income,
      expense,
      balance,
      cumulative,
      isForecast,
      isCarryover: false,
    };
  });

  return [
    {
      monthIndex: -1,
      label: carryover.label,
      income: carryover.income,
      expense: carryover.expense,
      balance: carryover.balance,
      cumulative: carryover.balance,
      isForecast: false,
      isCarryover: true,
    },
    ...monthRows,
  ];
};

const MonthlyOverviewTable = ({
  monthlySummary,
  year,
  carryover,
}: {
  monthlySummary: KoFiMonthlySummary[];
  year: number;
  carryover: KoFiCarryoverSummary;
}) => {
  const rows = buildForecastRows(monthlySummary, year, carryover);
  const maxMagnitude = Math.max(
    ...rows.map((entry) => Math.abs(entry.cumulative)),
    0,
  );
  const hasForecast = rows.some((entry) => entry.isForecast);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Monatsverlauf
        </h2>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["Monat", "Einnahmen", "Ausgaben", "Saldo", "Kumuliert"].map(
                (label) => (
                  <th
                    key={label}
                    className="border-b border-r border-border bg-muted/50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => {
              const baseRow =
                index % 2 === 0 ? "bg-card" : "bg-muted/60";
              const rowClass = entry.isCarryover
                ? "bg-amber-50/80"
                : entry.isForecast
                  ? `${baseRow} italic text-muted-foreground/90`
                  : baseRow;

              return (
                <tr key={entry.monthIndex} className={rowClass}>
                  <td className="border-b border-r border-border px-4 py-2 font-medium text-foreground/90">
                    <span className="inline-flex items-center gap-2">
                      {entry.label}
                      {entry.isCarryover ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          Überhang
                        </span>
                      ) : null}
                      {entry.isForecast ? (
                        <span className="rounded-full border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Prognose
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="border-b border-r border-border px-4 py-2 text-right tabular-nums text-success">
                    {formatCurrency(entry.income)}
                  </td>
                  <td className="border-b border-r border-border px-4 py-2 text-right tabular-nums text-warning">
                    {formatCurrency(entry.expense)}
                  </td>
                  <td
                    className={`border-b border-r border-border px-4 py-2 text-right font-semibold tabular-nums ${numberClassName(entry.balance)}`}
                  >
                    {formatCurrency(entry.balance)}
                  </td>
                  <td
                    className={`border-b border-border px-4 py-2 text-right font-semibold tabular-nums ${numberClassName(entry.cumulative)}`}
                    style={cumulativeCellStyle(entry.cumulative, maxMagnitude)}
                  >
                    {formatCurrency(entry.cumulative)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasForecast ? (
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          Prognosewerte basieren auf dem Durchschnitt der bisher abgelaufenen
          Monate.
        </div>
      ) : null}
    </div>
  );
};

const KoFiTable = ({
  title,
  block,
  kind,
  viewMode,
  year,
  collapsedGroups,
  expandedLeaves,
  onToggleGroup,
  onToggleLeaf,
}: {
  title: string;
  block: KoFiBlock;
  kind: "costs" | "funding";
  viewMode: ViewMode;
  year: number;
  collapsedGroups: Record<string, boolean>;
  expandedLeaves: Record<string, boolean>;
  onToggleGroup: (groupKey: string) => void;
  onToggleLeaf: (leafKey: string) => void;
}) => {
  const periodLabels = getPeriodLabels(viewMode, year);
  const sectionTint =
    kind === "funding"
      ? "from-emerald-50 via-white to-white"
      : "from-zinc-100 via-white to-white";
  const headerTint = kind === "funding" ? "bg-success-soft/70" : "bg-red-200/60";
  const sumTint = kind === "funding" ? "bg-success-soft/70" : "bg-muted/70";
  const summarySeries = projectSeries(
    block.groups.reduce(
      (accumulator, group) =>
        accumulator.map((value, index) => value + group.months[index]),
      Array.from({ length: 13 }, () => 0),
    ),
    viewMode,
  );

  return (
    <section
      className={`rounded-3xl border border-border bg-gradient-to-br ${sectionTint} shadow-sm`}
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold tracking-[0.16em] text-foreground/90">
          {title}
        </h2>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[1120px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[300px] border-b border-r border-border bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kategorie
              </th>
              {periodLabels.map((label) => (
                <th
                  key={label}
                  className="sticky top-0 z-20 border-b border-r border-border bg-muted/50 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </th>
              ))}
              <th className="sticky top-0 z-20 border-b border-r border-border bg-muted/50 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Gesamt inkl. {year - 1}
              </th>
              <th className="sticky top-0 z-20 border-b border-l-2 border-border bg-card px-3 py-3 pl-5 text-right text-xs font-normal uppercase tracking-wide text-muted-foreground">
                Durchschnitt / Monat
              </th>
            </tr>
          </thead>
          <tbody>
            {block.groups.length === 0 ? (
              <tr>
                <td
                  colSpan={periodLabels.length + 3}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  Keine Daten für diesen Abschnitt im gewählten Filter.
                </td>
              </tr>
            ) : (
              block.groups.map((group) => {
                const projectedGroup = projectSeries(group.months, viewMode);
                const isCollapsed = collapsedGroups[group.key] ?? true;

                return (
                  <Fragment key={group.key}>
                    <tr className={headerTint}>
                      <td
                        className={`sticky left-0 z-10 border-b border-r border-border px-4 py-3 ${headerTint}`}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleGroup(group.key)}
                          className="flex items-center gap-2 font-semibold text-foreground/90"
                        >
                          <FontAwesomeIcon
                            icon={isCollapsed ? faChevronRight : faChevronDown}
                            className="h-3 w-3 text-muted-foreground"
                          />
                          <span>{group.label}</span>
                        </button>
                      </td>
                      {projectedGroup.map((value, index) => (
                        <td
                          key={`${group.key}:${periodLabels[index]}`}
                          className={`border-b border-r border-border px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(value)}`}
                        >
                          {formatCurrency(value)}
                        </td>
                      ))}
                      <td
                        className={`border-b border-r border-border px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(group.total)}`}
                      >
                        {formatCurrency(group.total)}
                      </td>
                      <td className="border-b border-l-2 border-border bg-card px-3 py-3 pl-5 text-right font-normal tabular-nums text-muted-foreground">
                        {formatCurrency(group.average)}
                      </td>
                    </tr>
                    {!isCollapsed &&
                      group.children.map((child, index) => {
                        const projectedChild = projectSeries(
                          child.months,
                          viewMode,
                        );
                        const rowClassName =
                          index % 2 === 0 ? "bg-card" : "bg-muted/65";
                        const isLeafExpanded =
                          expandedLeaves[child.key] ?? false;

                        return (
                          <Fragment key={child.key}>
                            <tr className={rowClassName}>
                              <td
                                className={`sticky left-0 z-10 border-b border-r border-border px-4 py-2.5 ${rowClassName}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => onToggleLeaf(child.key)}
                                  className="flex w-full items-center gap-2 pl-6 text-left text-foreground/80 hover:text-foreground"
                                  aria-expanded={isLeafExpanded}
                                >
                                  <FontAwesomeIcon
                                    icon={
                                      isLeafExpanded
                                        ? faChevronDown
                                        : faChevronRight
                                    }
                                    className="h-2.5 w-2.5 text-muted-foreground"
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {child.label}
                                  </span>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                    {formatCount(child.transactions.length)}
                                  </span>
                                </button>
                              </td>
                              {projectedChild.map((value, valueIndex) => (
                                <td
                                  key={`${child.key}:${periodLabels[valueIndex]}`}
                                  className={`border-b border-r border-border px-3 py-2.5 text-right tabular-nums ${numberClassName(value)}`}
                                >
                                  {formatCurrency(value)}
                                </td>
                              ))}
                              <td
                                className={`border-b border-r border-border px-3 py-2.5 text-right font-medium tabular-nums ${numberClassName(child.total)}`}
                              >
                                {formatCurrency(child.total)}
                              </td>
                              <td className="border-b border-l-2 border-border bg-card px-3 py-2.5 pl-5 text-right font-normal tabular-nums text-muted-foreground">
                                {formatCurrency(child.average)}
                              </td>
                            </tr>
                            {isLeafExpanded ? (
                              <tr>
                                <td
                                  colSpan={periodLabels.length + 3}
                                  className="border-b border-border bg-muted/35 p-0"
                                >
                                  <div className="px-5 py-4">
                                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                      <FontAwesomeIcon
                                        icon={faReceipt}
                                        className="h-3.5 w-3.5"
                                      />
                                      Einzelbuchungen
                                    </div>
                                    <div className="grid gap-2">
                                      {child.transactions.map(
                                        (transaction) => (
                                          <div
                                            key={transaction.id}
                                            className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm md:grid-cols-[110px_minmax(220px,1.2fr)_minmax(240px,1fr)_130px]"
                                          >
                                            <div className="text-xs text-muted-foreground">
                                              <div className="font-medium text-foreground/80">
                                                {formatDate(transaction.date)}
                                              </div>
                                              <div className="mt-1">
                                                {transaction.sourceLabel}
                                              </div>
                                            </div>
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                {transaction.receiptNumber ? (
                                                  <a
                                                    href={
                                                      transaction.campaiUrl
                                                    }
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                                  >
                                                    {
                                                      transaction.receiptNumber
                                                    }
                                                    <FontAwesomeIcon
                                                      icon={
                                                        faArrowUpRightFromSquare
                                                      }
                                                      className="h-2.5 w-2.5"
                                                    />
                                                  </a>
                                                ) : (
                                                  <a
                                                    href={
                                                      transaction.campaiUrl
                                                    }
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                                  >
                                                    Beleglose Zuordnung
                                                    <FontAwesomeIcon
                                                      icon={
                                                        faArrowUpRightFromSquare
                                                      }
                                                      className="h-2.5 w-2.5"
                                                    />
                                                  </a>
                                                )}
                                                {transaction.receiptless ? (
                                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                                    ohne Beleg
                                                  </span>
                                                ) : null}
                                                {transaction.reverse ? (
                                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                                    Storno
                                                  </span>
                                                ) : null}
                                              </div>
                                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                                {transaction.text ||
                                                  "Kein Buchungstext"}
                                              </p>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              <p className="font-medium text-foreground/80">
                                                {
                                                  transaction.cashAccount
                                                }{" "}
                                                ·{" "}
                                                {
                                                  transaction.cashAccountLabel
                                                }
                                              </p>
                                              <p className="mt-1">
                                                Gegenkonto{" "}
                                                {
                                                  transaction.counterAccount
                                                }{" "}
                                                ·{" "}
                                                {
                                                  transaction.counterAccountLabel
                                                }
                                              </p>
                                              <p className="mt-1">
                                                KSt 1:{" "}
                                                {transaction.costCenter1 ?? "–"}
                                                {" · "}
                                                KSt 2:{" "}
                                                {transaction.costCenter2 ?? "–"}
                                              </p>
                                            </div>
                                            <div
                                              className={`self-center text-right font-semibold tabular-nums ${numberClassName(transaction.amount)}`}
                                            >
                                              {formatCurrency(
                                                transaction.amount,
                                              )}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })
            )}
            <tr className={sumTint}>
              <td
                className={`sticky left-0 z-10 border-r border-border px-4 py-3 font-semibold ${sumTint}`}
              >
                {kind === "costs" ? "SUMME KOSTEN" : "SUMME FINANZIERUNG"}
              </td>
              {summarySeries.map((value, index) => (
                <td
                  key={`sum:${title}:${periodLabels[index]}`}
                  className={`border-r border-border px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(value)}`}
                >
                  {formatCurrency(value)}
                </td>
              ))}
              <td
                className={`border-r border-border px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(block.total)}`}
              >
                {formatCurrency(block.total)}
              </td>
              <td className="border-l-2 border-border bg-card px-3 py-3 pl-5 text-right font-normal tabular-nums text-muted-foreground">
                {formatCurrency(block.average)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default function KoFiPage() {
  const currentYear = new Date().getFullYear();
  const [data, setData] = useState<KoFiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(currentYear);
  const [costCenter1, setCostCenter1] = useState("");
  const [costCenter2, setCostCenter2] = useState("");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedLeaves, setExpandedLeaves] = useState<
    Record<string, boolean>
  >({});
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ year: String(year) });

    if (costCenter1) {
      params.set("costCenter1", costCenter1);
    }
    if (costCenter2) {
      params.set("costCenter2", costCenter2);
    }
    if (account) {
      params.set("account", account);
    }
    if (deferredSearch.trim()) {
      params.set("search", deferredSearch.trim());
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/campai/kofi?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | KoFiResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload
              ? payload.error
              : "KoFi konnte nicht geladen werden.",
          );
        }

        setData(payload as KoFiResponse);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setData(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "KoFi konnte nicht geladen werden.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [account, costCenter1, costCenter2, deferredSearch, year]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupKey]: !(current[groupKey] ?? true),
    }));
  };

  const toggleLeaf = (leafKey: string) => {
    setExpandedLeaves((current) => ({
      ...current,
      [leafKey]: !(current[leafKey] ?? false),
    }));
  };

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-8 md:px-6 xl:px-8">
      <PageTitle
        eyebrow="Campai / SKR 42"
        title="KoFi Kosten- und Finanzierungsplan"
        subTitle="Liquiditätsansicht mit Monats-, Quartals- und Jahresperspektive direkt aus dem Campai-Buchungsjournal und den tatsächlichen Geldkontobewegungen."
        className="border-b border-border pb-6"
        eyebrowClassName="text-xs tracking-[0.26em] text-muted-foreground"
        titleClassName="mt-2 text-foreground md:text-4xl"
        subTitleClassName="mt-3 max-w-3xl leading-6"
      />

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <FontAwesomeIcon
            icon={faFilter}
            className="h-4 w-4 text-muted-foreground"
          />
          Filter
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <label className="block text-sm text-foreground/80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Jahr
            </span>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring"
            >
              {Array.from({ length: 6 }, (_, index) => currentYear - index).map(
                (optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block text-sm text-foreground/80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kostenstelle 1 (Sphäre)
            </span>
            <select
              value={costCenter1}
              onChange={(event) => setCostCenter1(event.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring"
            >
              <option value="">Alle Kostenstellen 1</option>
              {data?.filters.costCenters1.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-foreground/80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kostenstelle 2 (Werkbereiche/Projekte)
            </span>
            <select
              value={costCenter2}
              onChange={(event) => setCostCenter2(event.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring"
            >
              <option value="">Alle Kostenstellen 2</option>
              {data?.filters.costCenters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-foreground/80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SKR-42-Konto
            </span>
            <select
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring"
            >
              <option value="">Alle Konten</option>
              {data?.filters.accounts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-foreground/80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Buchungstext oder Kategorie
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="z. B. Miete, Fördermittel, Kulturamt"
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-ring"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setViewMode(option.value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                viewMode === option.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-card text-foreground/80 hover:border-ring/80"
              }`}
            >
              {option.buttonLabel}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="mt-6 rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center gap-3 rounded-3xl border border-border bg-card px-6 py-16 text-muted-foreground shadow-sm">
          <FontAwesomeIcon icon={faSpinner} spin className="h-5 w-5" />
          KoFi-Daten werden geladen…
        </div>
      ) : null}

      {!isLoading && data ? (
        <div className="mt-6 space-y-8">
          <section className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Gesamtkosten"
                value={formatCurrency(data.summary.totalCosts)}
                accent="text-warning"
              />
              <SummaryCard
                label="Gesamtfinanzierung"
                value={formatCurrency(data.summary.totalFunding)}
                accent="text-success"
              />
              <SummaryCard
                label="Netto-Cashflow"
                value={formatCurrency(data.summary.variance)}
                accent={numberClassName(data.summary.variance)}
              />
              <SummaryCard
                label="Berücksichtigte Buchungen"
                value={formatCount(data.dataQuality.includedPostings)}
                accent="text-foreground"
              />
              <SummaryCard
                label={`Überhang ${data.carryover.label}`}
                value={formatCurrency(data.carryover.balance)}
                accent={numberClassName(data.carryover.balance)}
              />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
                    <FontAwesomeIcon
                      icon={faCircleCheck}
                      className="h-4 w-4 text-success"
                    />
                    Datenqualität und Abgrenzung
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Beträge und Buchungsdaten stammen aus den tatsächlichen
                    Geldkontobuchungen. Interne Umbuchungen werden nicht als
                    Kosten oder Finanzierung gezählt. Bei Belegzahlungen
                    stammen Sachkonto und Kostenstellen aus den verknüpften
                    Belegpositionen.
                  </p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Aktualisiert{" "}
                  {new Intl.DateTimeFormat("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(data.dataQuality.refreshedAt))}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {[
                  {
                    label: "Geldbuchungen",
                    value: data.dataQuality.totalMoneyPostings,
                    warning: false,
                  },
                  {
                    label: "Beleglose Zuordnungen",
                    value: data.dataQuality.receiptlessPostings,
                    warning: false,
                  },
                  {
                    label: "Ohne Kostenstelle 1",
                    value: data.dataQuality.missingCostCenter1,
                    warning: data.dataQuality.missingCostCenter1 > 0,
                  },
                  {
                    label: "Ohne Kostenstelle 2",
                    value: data.dataQuality.missingCostCenter2,
                    warning: data.dataQuality.missingCostCenter2 > 0,
                  },
                  {
                    label: "Fallback-Kategorie",
                    value: data.dataQuality.fallbackCategorized,
                    warning: data.dataQuality.fallbackCategorized > 0,
                  },
                  {
                    label: "Umbuchungen ignoriert",
                    value: data.dataQuality.internalTransfers,
                    warning: false,
                  },
                  {
                    label: `Überhänge aus ${data.carryover.label}`,
                    value: data.dataQuality.carryoverPostings,
                    warning: false,
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-border bg-muted/35 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={
                          metric.warning
                            ? faTriangleExclamation
                            : faCircleCheck
                        }
                        className={`h-3 w-3 ${
                          metric.warning
                            ? "text-warning"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-lg font-semibold tabular-nums text-foreground">
                        {formatCount(metric.value)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {metric.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <MonthlyOverviewTable
                monthlySummary={data.monthlySummary}
                year={year}
                carryover={data.carryover}
              />
              <div className="grid gap-5">
                <CostDistributionChart groups={data.costs.groups} />
                <CashflowChart monthlySummary={data.monthlySummary} />
              </div>
            </div>
          </section>

          <KoFiTable
            title="KOSTEN"
            block={data.costs}
            kind="costs"
            viewMode={viewMode}
            year={year}
            collapsedGroups={collapsedGroups}
            expandedLeaves={expandedLeaves}
            onToggleGroup={toggleGroup}
            onToggleLeaf={toggleLeaf}
          />

          <KoFiTable
            title="FINANZIERUNG"
            block={data.funding}
            kind="funding"
            viewMode={viewMode}
            year={year}
            collapsedGroups={collapsedGroups}
            expandedLeaves={expandedLeaves}
            onToggleGroup={toggleGroup}
            onToggleLeaf={toggleLeaf}
          />

          <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faArrowTrendUp}
                  className="h-4 w-4 text-success"
                />
                Positive Werte werden grün hervorgehoben.
              </span>
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faArrowTrendDown}
                  className="h-4 w-4 text-destructive"
                />
                Negative Salden werden rot hervorgehoben.
              </span>
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faReceipt}
                  className="h-4 w-4 text-muted-foreground"
                />
                Kontenzeilen lassen sich bis zur Einzelbuchung aufklappen.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
