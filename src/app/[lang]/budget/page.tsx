"use client";

import { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBook,
  faBullseye,
  faBuilding,
  faCamera,
  faCube,
  faFlask,
  faGear,
  faHeart,
  faLayerGroup,
  faPrint,
  faShirt,
  faStore,
  faTree,
  faArrowTrendDown,
  faArrowTrendUp,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

type AreaOption = {
  value: string;
  label: string;
  icon: IconProp;
};

type AccountBalance = {
  accountType: string | null;
  account: number | null;
  accountName?: string;
  debit: number;
  credit: number;
  balance: number;
  balanceType: string;
  balanceAmount: number;
  date: string | null;
};

type BalancesResponse = {
  count: number;
  accountBalances: AccountBalance[];
  error?: string;
};

const areaOptions: AreaOption[] = [
  { value: "3D-DRUCK", label: "3D-Druck", icon: faCube },
  { value: "DRUCK", label: "Druck", icon: faPrint },
  { value: "_BASIS", label: "_Basis", icon: faLayerGroup },
  { value: "BETON", label: "Beton", icon: faBuilding },
  { value: "CNC", label: "CNC", icon: faGear },
  { value: "ELEKTRO", label: "Elektro", icon: faBolt },
  { value: "FOTO/FILM", label: "Foto/Film", icon: faCamera },
  { value: "HOLZ", label: "Holz", icon: faTree },
  { value: "KUSS", label: "Kuss", icon: faHeart },
  { value: "LASER", label: "Laser", icon: faBullseye },
  { value: "N-BIBO", label: "N-Bibo", icon: faBook },
  { value: "PRINTSHOP", label: "Printshop", icon: faStore },
  { value: "TEXTIL", label: "Textil", icon: faShirt },
  { value: "ZÜNDSTOFFE", label: "Zündstoffe", icon: faFlask },
];

const formatCents = (cents: number): string => {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${euros.toLocaleString("de-DE")},${String(rest).padStart(2, "0")} €`;
};

const accountTypeLabel = (type: string | null): string => {
  switch (type) {
    case "revenue":
      return "Einnahmen";
    case "expense":
      return "Ausgaben";
    case "asset":
      return "Vermögen";
    case "liability":
      return "Verbindlichkeiten";
    case "debtor":
      return "Debitoren";
    case "creditor":
      return "Kreditoren";
    default:
      return type ?? "Sonstiges";
  }
};

export default function BudgetPage() {
  const [costCenters, setCostCenters] = useState<
    { value: string; label: string }[]
  >([]);
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCostCenters, setLoadingCostCenters] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load cost centers on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/campai/cost-centers");
        if (!res.ok) throw new Error("Fehler beim Laden der Kostenstellen");
        const data = await res.json();
        setCostCenters(data.costCenters ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Kostenstellen konnten nicht geladen werden",
        );
      } finally {
        setLoadingCostCenters(false);
      }
    };
    load();
  }, []);

  const loadBalances = useCallback(async () => {
    if (!selectedCostCenter) return;

    setLoading(true);
    setError(null);
    try {
      const costCenterNum = parseInt(selectedCostCenter, 10);
      const body: { year: number; costCenters?: number[] } = { year };
      if (!isNaN(costCenterNum)) {
        body.costCenters = [costCenterNum];
      }

      const res = await fetch("/api/campai/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error ?? `Fehler ${res.status}`,
        );
      }

      const data: BalancesResponse = await res.json();
      setBalances(data.accountBalances ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salden konnten nicht geladen werden",
      );
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCostCenter, year]);

  // Load balances whenever cost center or year changes
  useEffect(() => {
    if (selectedCostCenter) {
      loadBalances();
    }
  }, [selectedCostCenter, year, loadBalances]);

  // Separate revenue and expense entries
  const revenueEntries = balances.filter((b) => b.accountType === "revenue");
  const expenseEntries = balances.filter((b) => b.accountType === "expense");
  const otherEntries = balances.filter(
    (b) => b.accountType !== "revenue" && b.accountType !== "expense",
  );

  const totalRevenue = revenueEntries.reduce((sum, b) => sum + b.credit, 0);
  const totalExpenses = expenseEntries.reduce((sum, b) => sum + b.debit, 0);
  const saldo = totalRevenue - totalExpenses;

  const selectedArea = areaOptions.find((a) => {
    const cc = costCenters.find((c) => c.value === selectedCostCenter);
    return cc && cc.label.toUpperCase().includes(a.value);
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-0">
      <h1 className="mb-6 text-2xl font-bold text-foreground ">
        Budget Werkbereiche
      </h1>

      {/* Cost Center Selection */}
      <div className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm  ">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="costCenter"
              className="mb-1.5 block text-sm font-medium text-foreground/80 "
            >
              Werkbereich (Kostenstelle)
            </label>
            {loadingCostCenters ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />
                Kostenstellen werden geladen…
              </div>
            ) : (
              <select
                id="costCenter"
                value={selectedCostCenter}
                onChange={(e) => setSelectedCostCenter(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring   "
              >
                <option value="">— Werkbereich wählen —</option>
                {costCenters.map((cc) => (
                  <option key={cc.value} value={cc.value}>
                    {cc.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="w-32">
            <label
              htmlFor="year"
              className="mb-1.5 block text-sm font-medium text-foreground/80 "
            >
              Jahr
            </label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring   "
            >
              {Array.from({ length: 5 }, (_, i) => currentYear - i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive   ">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <FontAwesomeIcon icon={faSpinner} spin className="h-5 w-5" />
          <span>Daten werden geladen…</span>
        </div>
      )}

      {/* Results */}
      {!loading && selectedCostCenter && balances.length > 0 && (
        <>
          {/* Saldo Card */}
          <div className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm  ">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground ">
              {selectedArea && (
                <FontAwesomeIcon icon={selectedArea.icon} className="h-4 w-4" />
              )}
              Saldo{" "}
              {costCenters.find((c) => c.value === selectedCostCenter)?.label ??
                selectedCostCenter}
            </div>
            <div
              className={`text-4xl font-bold tracking-tight ${
                saldo >= 0
                  ? "text-success "
                  : "text-destructive "
              }`}
            >
              {formatCents(saldo)}
            </div>
            <div className="mt-3 flex gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-success ">
                <FontAwesomeIcon icon={faArrowTrendUp} className="h-3.5 w-3.5" />
                Einnahmen: {formatCents(totalRevenue)}
              </div>
              <div className="flex items-center gap-1.5 text-destructive ">
                <FontAwesomeIcon icon={faArrowTrendDown} className="h-3.5 w-3.5" />
                Ausgaben: {formatCents(totalExpenses)}
              </div>
            </div>
          </div>

          {/* Revenue List */}
          {revenueEntries.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-success ">
                <FontAwesomeIcon icon={faArrowTrendUp} className="h-4 w-4" />
                Einnahmen
              </h2>
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-sm   ">
                {revenueEntries.map((entry, i) => (
                  <div
                    key={`rev-${i}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground ">
                        {entry.accountName ?? `Konto ${entry.account}`}
                      </div>
                      <div className="text-xs text-muted-foreground ">
                        Konto {entry.account}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-success ">
                      {formatCents(entry.credit)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted/50 px-4 py-3 font-semibold ">
                  <span className="text-sm text-foreground/80 ">
                    Summe Einnahmen
                  </span>
                  <span className="text-sm text-success ">
                    {formatCents(totalRevenue)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Expense List */}
          {expenseEntries.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-destructive ">
                <FontAwesomeIcon icon={faArrowTrendDown} className="h-4 w-4" />
                Ausgaben
              </h2>
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-sm   ">
                {expenseEntries.map((entry, i) => (
                  <div
                    key={`exp-${i}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground ">
                        {entry.accountName ?? `Konto ${entry.account}`}
                      </div>
                      <div className="text-xs text-muted-foreground ">
                        Konto {entry.account}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-destructive ">
                      {formatCents(entry.debit)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted/50 px-4 py-3 font-semibold ">
                  <span className="text-sm text-foreground/80 ">
                    Summe Ausgaben
                  </span>
                  <span className="text-sm text-destructive ">
                    {formatCents(totalExpenses)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Other entries */}
          {otherEntries.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-foreground/80 ">
                Sonstige Konten
              </h2>
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-sm   ">
                {otherEntries.map((entry, i) => (
                  <div
                    key={`other-${i}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground ">
                        {entry.accountName ?? `Konto ${entry.account}`}
                      </div>
                      <div className="text-xs text-muted-foreground ">
                        {accountTypeLabel(entry.accountType)} · Konto{" "}
                        {entry.account}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-foreground/80 ">
                      {formatCents(entry.balanceAmount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && selectedCostCenter && balances.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Keine Buchungen für diesen Werkbereich im Jahr {year} gefunden.
        </div>
      )}

      {/* Initial state */}
      {!selectedCostCenter && !loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Bitte wähle einen Werkbereich aus, um das Budget einzusehen.
        </div>
      )}
    </div>
  );
}
