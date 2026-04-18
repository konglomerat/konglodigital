"use client";

import { Fragment, useDeferredValue, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartPie,
  faChevronDown,
  faChevronRight,
  faFilter,
  faSpinner,
  faTableCellsLarge,
} from "@fortawesome/free-solid-svg-icons";

import type {
  KoFiBlock,
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
  if (viewMode === "year") {
    return [months.reduce((sum, value) => sum + value, 0)];
  }

  if (viewMode === "quarter") {
    return [0, 1, 2, 3].map((quarter) => {
      const start = quarter * 3;
      return months
        .slice(start, start + 3)
        .reduce((sum, value) => sum + value, 0);
    });
  }

  return months;
};

const getPeriodLabels = (viewMode: ViewMode) => {
  if (viewMode === "year") {
    return ["Jahr"];
  }

  if (viewMode === "quarter") {
    return QUARTER_LABELS;
  }

  return MONTH_LABELS;
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
  value: number;
  accent: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
    <p className={`mt-3 text-2xl font-semibold tabular-nums ${accent}`}>
      {formatCurrency(value)}
    </p>
  </div>
);

const CostDistributionChart = ({ groups }: { groups: KoFiGroupRow[] }) => {
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const slices = groups.slice(0, 5).map((group, index) => ({
    label: group.label,
    value: group.total,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const remainder = groups
    .slice(5)
    .reduce((sum, group) => sum + group.total, 0);
  if (remainder > 0) {
    slices.push({
      label: "Weitere",
      value: remainder,
      color: "#d4d4d8",
    });
  }

  let progress = 0;
  const gradient = slices
    .map((slice) => {
      const start = progress;
      progress += total > 0 ? (slice.value / total) * 100 : 0;
      return `${slice.color} ${start}% ${progress}%`;
    })
    .join(", ");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <FontAwesomeIcon icon={faChartPie} className="h-4 w-4 text-muted-foreground" />
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <FontAwesomeIcon
          icon={faTableCellsLarge}
          className="h-4 w-4 text-muted-foreground"
        />
        Einnahmen vs. Ausgaben
      </div>
      <div className="mt-4 flex h-40 items-end gap-2">
        {monthlySummary.map((entry) => {
          const incomeHeight =
            maxValue > 0 ? Math.max(6, (entry.income / maxValue) * 100) : 6;
          const expenseHeight =
            maxValue > 0 ? Math.max(6, (entry.expense / maxValue) * 100) : 6;

          return (
            <div
              key={entry.monthIndex}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-28 items-end gap-1">
                <div
                  className="w-2 rounded-t bg-success-soft0"
                  style={{ height: `${incomeHeight}%` }}
                  title={`Einnahmen ${entry.label}: ${formatCurrency(entry.income)}`}
                />
                <div
                  className="w-2 rounded-t bg-warning-soft0"
                  style={{ height: `${expenseHeight}%` }}
                  title={`Ausgaben ${entry.label}: ${formatCurrency(entry.expense)}`}
                />
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MonthlyOverviewTable = ({
  monthlySummary,
}: {
  monthlySummary: KoFiMonthlySummary[];
}) => {
  const maxMagnitude = Math.max(
    ...monthlySummary.map((entry) => Math.abs(entry.cumulative)),
    0,
  );

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
            {monthlySummary.map((entry, index) => (
              <tr
                key={entry.monthIndex}
                className={index % 2 === 0 ? "bg-card" : "bg-muted/60"}
              >
                <td className="border-b border-r border-border px-4 py-2 font-medium text-foreground/90">
                  {entry.label}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KoFiTable = ({
  title,
  block,
  kind,
  viewMode,
  collapsedGroups,
  onToggleGroup,
}: {
  title: string;
  block: KoFiBlock;
  kind: "costs" | "funding";
  viewMode: ViewMode;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (groupKey: string) => void;
}) => {
  const periodLabels = getPeriodLabels(viewMode);
  const sectionTint =
    kind === "funding"
      ? "from-emerald-50 via-white to-white"
      : "from-zinc-100 via-white to-white";
  const headerTint =
    kind === "funding" ? "bg-success-soft/70" : "bg-accent/80";
  const sumTint = kind === "funding" ? "bg-success-soft/70" : "bg-muted/70";
  const summarySeries = projectSeries(
    block.groups.reduce(
      (accumulator, group) =>
        accumulator.map((value, index) => value + group.months[index]),
      Array.from({ length: 12 }, () => 0),
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
                Gesamt
              </th>
              <th className="sticky top-0 z-20 border-b border-border bg-muted/50 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                const isCollapsed = collapsedGroups[group.key] ?? false;

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
                      <td
                        className={`border-b border-border px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(group.average)}`}
                      >
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

                        return (
                          <tr key={child.key} className={rowClassName}>
                            <td
                              className={`sticky left-0 z-10 border-b border-r border-border px-4 py-2.5 ${rowClassName}`}
                            >
                              <div className="pl-6 text-foreground/80">
                                {child.label}
                              </div>
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
                            <td
                              className={`border-b border-border px-3 py-2.5 text-right font-medium tabular-nums ${numberClassName(child.average)}`}
                            >
                              {formatCurrency(child.average)}
                            </td>
                          </tr>
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
              <td
                className={`px-3 py-3 text-right font-semibold tabular-nums ${numberClassName(block.average)}`}
              >
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
  const [costCenter, setCostCenter] = useState("");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ year: String(year) });

    if (costCenter) {
      params.set("costCenter", costCenter);
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
  }, [account, costCenter, deferredSearch, year]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-8 md:px-6 xl:px-8">
      <PageTitle
        eyebrow="Campai / SKR 42"
        title="KoFi Kosten- und Finanzierungsplan"
        subTitle="Tabellenansicht mit Monats-, Quartals- und Jahresperspektive direkt aus den Campai-Belegen, Konten und Kostenstellen."
        className="border-b border-border pb-6"
        eyebrowClassName="text-xs tracking-[0.26em] text-muted-foreground"
        titleClassName="mt-2 text-foreground md:text-4xl"
        subTitleClassName="mt-3 max-w-3xl leading-6"
      />

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <FontAwesomeIcon icon={faFilter} className="h-4 w-4 text-muted-foreground" />
          Filter
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
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
              Kostenstelle
            </span>
            <select
              value={costCenter}
              onChange={(event) => setCostCenter(event.target.value)}
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring"
            >
              <option value="">Alle Kostenstellen</option>
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
            <div className="grid gap-4 lg:grid-cols-4">
              <SummaryCard
                label="Gesamtkosten"
                value={data.summary.totalCosts}
                accent="text-warning"
              />
              <SummaryCard
                label="Gesamtfinanzierung"
                value={data.summary.totalFunding}
                accent="text-success"
              />
              <SummaryCard
                label="Fehl-/Mehrbetrag"
                value={data.summary.variance}
                accent={numberClassName(data.summary.variance)}
              />
              <SummaryCard
                label="Liquiditätsreserve"
                value={data.summary.liquidityReserve}
                accent="text-foreground"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <MonthlyOverviewTable monthlySummary={data.monthlySummary} />
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
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
          />

          <KoFiTable
            title="FINANZIERUNG"
            block={data.funding}
            kind="funding"
            viewMode={viewMode}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
