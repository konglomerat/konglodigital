"use client";

// Die Summenleiste unter der Belegtabelle (Entwurf „Buchungen Auswertung“, 4a):
// Barkasse für sich mit „+“ für eine Kassenbuchung, daneben Ausgaben und
// Einnahmen, rechts das Guthaben. Ein Klick auf Einnahmen/Ausgaben oder das
// Guthaben klappt die Auswertung auf: je Seite eine Liste nach Tags und
// daneben der Saldo als Rechnung.
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  faCaretDown,
  faCaretUp,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import Dialog from "@/components/knglmrt/Dialog";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Notice from "@/components/knglmrt/Notice";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";

export type BreakdownCategory = {
  key: string;
  label: string;
  /** Betrag in Cent, immer positiv. */
  amount: number;
  color: string;
  /** „Weitere“ fasst kleine Tags zusammen und filtert nicht. */
  clickable: boolean;
};

export type BreakdownSide = {
  kind: "expense" | "income";
  title: string;
  /** Summe der Seite in Cent (positiv) — ohne Doppelzählung mehrfach getaggter Belege. */
  total: number;
  categories: BreakdownCategory[];
};

/** Woraus sich das Guthaben zusammensetzt — nur ungefiltert und mit Barkasse. */
export type SaldoParts = {
  /** Bestand aus der Zeit vor dem Zeitraum (steckt im Kassenbestand). */
  carryOver: number;
  cash: number;
  account: number;
};

type ReceiptsSummaryBarProps = {
  count: number;
  /** Einnahmen und Ausgaben der Zeilen in der Tabelle, in Cent (positiv). */
  totalIncome: number;
  totalExpense: number;
  /** Überhang aus dem Vorjahr (Belege mit Tag „Überhang“), vorzeichenbehaftet in Cent. */
  overhang: number;
  /** Ausgaben und Einnahmen der Tabellenzeilen nach Tag — gefiltert nur die aktiven Tags. */
  sides: BreakdownSide[];
  activeTagKeys: string[];
  onToggleTag: (key: string) => void;
  /** „Guthaben“ ungefiltert, „Saldo“ für einen Ausschnitt. */
  netLabel: string;
  netScope: string;
  /** Die ganze Liste hinter einem gekürzten `netScope` — als Tooltip. */
  netScopeDetail?: string;
  /** Tabelle ist nach Projekt, Tag oder Suche eingeschränkt. */
  isNarrowed: boolean;
  net: number;
  saldoParts: SaldoParts | null;
  periodLabel: string;
  /** Nur mit eigener Barkasse — sonst fehlt der Block. */
  cashRegister: {
    label: string;
    balance: number | null;
    error: string | null;
    costCenter2: string;
    onBooked: () => void;
  } | null;
  formatCents: (cents: number) => string;
  formatSignedCents: (cents: number) => string;
};

const INK: Record<BreakdownSide["kind"], string> = {
  expense: "text-primary",
  income: "text-emerald-700 dark:text-emerald-400",
};

// Die Trennlinien der Auswertung: kräftig unter Überschriften, zart dazwischen.
const ROW_RULE = "border-b border-[var(--knglmrt-pink-30)] last:border-b-0";

function CategoryList({
  side,
  activeTagKeys,
  onToggleTag,
  formatCents,
  formatSignedCents,
}: {
  side: BreakdownSide;
  activeTagKeys: string[];
  onToggleTag: (key: string) => void;
  formatCents: (cents: number) => string;
  formatSignedCents: (cents: number) => string;
}) {
  const active = new Set(activeTagKeys);
  // Balken relativ zum größten Tag, Prozente relativ zur Summe der Seite.
  const max = Math.max(0, ...side.categories.map((entry) => entry.amount));

  return (
    <section className="@container/list flex min-w-0 flex-col">
      <h3 className="flex items-baseline justify-between gap-3 border-b border-foreground pb-2">
        <span className="knglmrt-label">{side.title} nach Kategorie</span>
        <span
          className={`knglmrt-num font-bold! whitespace-nowrap ${INK[side.kind]}`}
        >
          {formatSignedCents(side.kind === "income" ? side.total : -side.total)}
        </span>
      </h3>
      {side.categories.length === 0 ? (
        <p className="py-2 text-muted-foreground">
          Keine {side.title} im Zeitraum.
        </p>
      ) : (
        <ul>
          {side.categories.map((category) => {
            const isActive = active.has(category.key);
            const share =
              side.total > 0 ? Math.round((category.amount / side.total) * 100) : 0;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0"
                  style={{ background: category.color }}
                />
                <span
                  lang="de"
                  className={`min-w-0 flex-1 hyphens-auto [overflow-wrap:anywhere] ${isActive ? "font-bold" : ""}`}
                >
                  {category.label}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden h-2 w-16 shrink-0 bg-card @min-[460px]/list:block @min-[560px]/list:w-24"
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${max > 0 ? (category.amount / max) * 100 : 0}%`,
                      background: category.color,
                    }}
                  />
                </span>
                <span className="knglmrt-num min-w-[10ch] shrink-0 text-right whitespace-nowrap">
                  {formatCents(category.amount)}
                </span>
                <span className="knglmrt-num hidden min-w-[4ch] shrink-0 text-right whitespace-nowrap text-muted-foreground @min-[340px]/list:inline">
                  {share} %
                </span>
              </>
            );
            const rowClassName =
              "flex w-full items-center gap-2.5 px-1.5 py-2 text-left";
            return (
              <li key={category.key} className={ROW_RULE}>
                {category.clickable ? (
                  <button
                    type="button"
                    onClick={() => onToggleTag(category.key)}
                    aria-pressed={isActive}
                    title={
                      isActive
                        ? `Filter ${category.label} aufheben`
                        : `Nach ${category.label} filtern`
                    }
                    className={`${rowClassName} cursor-pointer hover:bg-card focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${isActive ? "bg-card" : ""}`}
                  >
                    {content}
                  </button>
                ) : (
                  <span className={rowClassName}>{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SaldoCalculation({
  totalIncome,
  totalExpense,
  overhang,
  netLabel,
  netScope,
  netScopeDetail,
  isNarrowed,
  net,
  saldoParts,
  periodLabel,
  formatCents,
}: Pick<
  ReceiptsSummaryBarProps,
  | "totalIncome"
  | "totalExpense"
  | "overhang"
  | "netLabel"
  | "netScope"
  | "netScopeDetail"
  | "isNarrowed"
  | "net"
  | "saldoParts"
  | "periodLabel"
  | "formatCents"
>) {
  const isWholeYear = /^\d{4}$/.test(periodLabel);
  const rows: {
    key: string;
    operator?: string;
    label: string;
    value: number;
    className?: string;
    title?: string;
  }[] = [];

  if (overhang !== 0) {
    rows.push({
      key: "overhang",
      label: "Überhang Vorjahr",
      value: overhang,
      title: "Belege mit dem Tag „Überhang“",
    });
  }
  // Was vor dem Zeitraum in der Kasse lag, steckt im Kassenbestand, aber in
  // keiner Einnahme des Zeitraums.
  if (saldoParts && saldoParts.carryOver !== 0) {
    rows.push({
      key: "carry",
      operator: rows.length > 0 ? "+" : undefined,
      label: isWholeYear ? "Barkasse Vorjahr" : "Barkasse vorher",
      value: saldoParts.carryOver,
      title: "Kassenbestand aus der Zeit vor dem Zeitraum",
    });
  }
  rows.push(
    {
      key: "income",
      operator: "+",
      label: "Einnahmen",
      value: totalIncome,
      className: INK.income,
    },
    {
      key: "expense",
      operator: "−",
      label: "Ausgaben",
      value: totalExpense,
      className: INK.expense,
    },
  );

  return (
    <section className="flex min-w-0 flex-col">
      <h3
        className="knglmrt-label border-b border-foreground pb-2"
        title={netScopeDetail}
      >
        Saldo {isNarrowed ? `· ${netScope} · ` : ""}
        {periodLabel}
      </h3>
      <dl>
        {rows.map((row) => (
          <div
            key={row.key}
            title={row.title}
            className="flex items-center gap-2 border-b border-[var(--knglmrt-pink-30)] px-1.5 py-2"
          >
            <dt className="flex min-w-0 flex-1 items-center gap-2">
              <span aria-hidden="true" className="w-3 shrink-0 font-bold">
                {row.operator ?? ""}
              </span>
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className={`knglmrt-num whitespace-nowrap ${row.className ?? ""}`}>
              {formatCents(row.value)}
            </dd>
          </div>
        ))}
        <div className="flex items-center gap-2 px-1.5 py-2.5">
          <dt className="flex min-w-0 flex-1 items-center gap-2 font-bold">
            <span aria-hidden="true" className="w-3 shrink-0">
              =
            </span>
            <span className="truncate">{netLabel}</span>
          </dt>
          <dd
            className={`knglmrt-num font-bold! whitespace-nowrap border-b-[3px] border-double border-foreground pb-0.5 ${net < 0 ? "text-primary" : ""}`}
          >
            {formatCents(net)}
          </dd>
        </div>
        {saldoParts ? (
          <>
            <div className="flex items-center gap-2 border-t border-[var(--knglmrt-pink-30)] px-1.5 py-2 text-muted-foreground">
              <dt className="flex-1 pl-5">davon Barkasse</dt>
              <dd className="knglmrt-num whitespace-nowrap">
                {formatCents(saldoParts.cash)}
              </dd>
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--knglmrt-pink-30)] px-1.5 py-2 text-muted-foreground">
              <dt className="flex-1 pl-5">davon Konto</dt>
              <dd className="knglmrt-num whitespace-nowrap">
                {formatCents(saldoParts.account)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function BreakdownPanel({
  sides,
  activeTagKeys,
  onToggleTag,
  onClose,
  formatCents,
  formatSignedCents,
  ...saldo
}: Pick<
  ReceiptsSummaryBarProps,
  | "sides"
  | "activeTagKeys"
  | "onToggleTag"
  | "totalIncome"
  | "totalExpense"
  | "overhang"
  | "netLabel"
  | "netScope"
  | "netScopeDetail"
  | "isNarrowed"
  | "net"
  | "saldoParts"
  | "periodLabel"
  | "formatCents"
  | "formatSignedCents"
> & { onClose: () => void }) {
  // In der Auswertung stehen die Einnahmen vorn.
  const orderedSides = [...sides].sort((left, right) =>
    left.kind === right.kind ? 0 : left.kind === "income" ? -1 : 1,
  );

  return (
    <div
      id="receipts-breakdown"
      className="relative mb-3 grid max-h-[60vh] gap-7 overflow-y-auto bg-primary-soft px-4 pt-12 pb-5 @min-[900px]:max-h-none @min-[900px]:pt-5 @min-[900px]:pr-12 @min-[900px]:pl-5 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(240px,300px)] @min-[900px]:overflow-visible"
    >
      <Button
        kind="ghost"
        size="small"
        iconOnly
        icon={faXmark}
        onClick={onClose}
        aria-label="Auswertung schließen"
        title="Auswertung schließen"
        className="absolute! top-2 right-2"
      />
      {orderedSides.map((side) => (
        <CategoryList
          key={side.kind}
          side={side}
          activeTagKeys={activeTagKeys}
          onToggleTag={onToggleTag}
          formatCents={formatCents}
          formatSignedCents={formatSignedCents}
        />
      ))}
      <div className="border-t border-foreground pt-5 @min-[900px]:border-t-0 @min-[900px]:border-l @min-[900px]:pt-0 @min-[900px]:pl-5">
        <SaldoCalculation {...saldo} formatCents={formatCents} />
      </div>
    </div>
  );
}

type CashDirection = "revenue" | "expense";

const TAX_OPTIONS: Record<CashDirection, { value: string; label: string }[]> = {
  revenue: [
    { value: "US0", label: "0 %" },
    { value: "US7", label: "7 %" },
    { value: "US19", label: "19 %" },
  ],
  expense: [
    { value: "VS0", label: "0 %" },
    { value: "VS7", label: "7 %" },
    { value: "VS19", label: "19 %" },
  ],
};

// Einnahmen gehen auf Spenden (steuerfrei), Ausgaben meist mit voller Vorsteuer.
const DEFAULT_TAX: Record<CashDirection, string> = {
  revenue: "US0",
  expense: "VS19",
};

const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

/** „12,50“, „1.234,50“ oder „12.50“ → Cent; alles andere → null. */
const parseEuroInput = (value: string): number | null => {
  const trimmed = value.replace(/\s|€/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /^\d+\.\d{1,2}$/.test(trimmed)
      ? trimmed
      : trimmed.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number.parseFloat(normalized) * 100);
  return cents > 0 ? cents : null;
};

function CashBooking({
  label,
  balance,
  costCenter2,
  asModal,
  onClose,
  onBooked,
  formatCents,
}: {
  label: string;
  balance: number | null;
  costCenter2: string;
  /** Schmal als Modal, breit als Popover über der Barkasse. */
  asModal: boolean;
  onClose: () => void;
  onBooked: () => void;
  formatCents: (cents: number) => string;
}) {
  const [direction, setDirection] = useState<CashDirection>("revenue");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayIso);
  const [taxCode, setTaxCode] = useState(DEFAULT_TAX.revenue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const formId = useId();

  // Im Modal nicht: dort setzt der Dialog den Fokus, und auf dem Telefon
  // klappte sonst sofort die Tastatur über das Formular.
  useEffect(() => {
    if (!asModal) amountRef.current?.focus();
  }, [asModal]);

  const cents = parseEuroInput(amount);
  const amountError =
    amount.trim() && cents === null ? "Betrag z. B. als 12,50 eingeben." : null;
  const hint =
    balance === null
      ? undefined
      : `Barkasse danach: ${formatCents(
          balance + (direction === "revenue" ? 1 : -1) * (cents ?? 0),
        )}`;

  const changeDirection = (next: CashDirection) => {
    setDirection(next);
    setTaxCode(DEFAULT_TAX[next]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (cents === null) {
      setError("Bitte einen Betrag größer als 0 angeben.");
      amountRef.current?.focus();
      return;
    }
    if (!text.trim()) {
      setError("Bitte eine Beschreibung angeben.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/campai/cash-registers/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          amountCents: cents,
          text,
          receiptDate: date,
          taxCode,
          costCenter2,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Fehler ${response.status}`);
      }
      onBooked();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Kassenbuchung fehlgeschlagen.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3.5"
    >
      <SegmentedControl<CashDirection>
        value={direction}
        onChange={changeDirection}
        options={[
          { value: "revenue", label: "Einnahme" },
          { value: "expense", label: "Ausgabe" },
        ]}
        className="w-full"
        segmentClassName="flex-1"
      />
      <Field
        ref={amountRef}
        label="Betrag in €"
        kind="mono"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        error={amountError ?? undefined}
        hint={amountError ? undefined : hint}
        required
      />
      <Field
        label="Beschreibung"
        value={text}
        maxLength={1000}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          direction === "revenue" ? "z. B. Spende Verbrauchsmittel" : "z. B. Schrauben"
        }
        required
      />
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <Field
          label="Datum"
          kind="mono"
          type="date"
          value={date}
          max={todayIso()}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        <NativeSelect
          label="Steuer"
          value={taxCode}
          onChange={(event) => setTaxCode(event.target.value)}
        >
          {TAX_OPTIONS[direction].map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {error ? <Notice tone="rosa">{error}</Notice> : null}
    </form>
  );

  const actions = (
    <>
      <Button kind="secondary" type="button" onClick={onClose}>
        Abbrechen
      </Button>
      <Button kind="primary" type="submit" form={formId} loading={submitting}>
        Buchen
      </Button>
    </>
  );

  if (asModal) {
    return (
      <Dialog
        open
        title={`Kassenbuchung · ${label}`}
        onCancel={onClose}
        actions={actions}
        width={440}
      >
        {form}
      </Dialog>
    );
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="absolute bottom-[calc(100%+10px)] left-0 z-30 flex w-[380px] flex-col knglmrt-border bg-card knglmrt-emphasis-shadow"
    >
      <div
        id={titleId}
        className="knglmrt-label bg-primary px-4 py-2.5 text-primary-foreground"
      >
        Kassenbuchung · {label}
      </div>
      <div className="flex flex-col gap-3.5 p-4">
        {form}
        <div className="flex justify-end gap-2.5">{actions}</div>
      </div>
    </div>
  );
}

// Ab dieser Breite der Leiste steht alles in einer Zeile und die
// Kassenbuchung öffnet als Popover über der Barkasse — darunter als Modal.
const WIDE_BAR_PX = 900;

export default function ReceiptsSummaryBar({
  count,
  totalIncome,
  totalExpense,
  overhang,
  sides,
  activeTagKeys,
  onToggleTag,
  netLabel,
  netScope,
  netScopeDetail,
  isNarrowed,
  net,
  saldoParts,
  periodLabel,
  cashRegister,
  formatCents,
  formatSignedCents,
}: ReceiptsSummaryBarProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookedNotice, setBookedNotice] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const cashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsWide(entry.contentRect.width >= WIDE_BAR_PX);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Nur das Popover schließt beim Klick daneben — das Modal regelt das selbst.
  const bookingAsPopover = bookingOpen && isWide;
  useEffect(() => {
    if (!bookingAsPopover) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!cashRef.current?.contains(event.target as Node)) {
        setBookingOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookingOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [bookingAsPopover]);

  useEffect(() => {
    if (!bookedNotice) return;
    const timeout = window.setTimeout(() => setBookedNotice(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [bookedNotice]);

  const toggleBreakdown = () => setBreakdownOpen((open) => !open);
  const caret = (
    <FontAwesomeIcon
      icon={breakdownOpen ? faCaretDown : faCaretUp}
      aria-hidden="true"
      className="shrink-0"
    />
  );

  // Die Leiste zeigt die Zeilen der Tabelle.
  const barTotals: Record<BreakdownSide["kind"], number> = {
    expense: -totalExpense,
    income: totalIncome,
  };

  return (
    <div
      ref={barRef}
      className="@container sticky bottom-0 z-10 shrink-0 bg-background py-3 md:static md:-mb-7 md:py-0"
    >
      {breakdownOpen ? (
        <BreakdownPanel
          sides={sides}
          activeTagKeys={activeTagKeys}
          onToggleTag={onToggleTag}
          onClose={() => setBreakdownOpen(false)}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          overhang={overhang}
          netLabel={netLabel}
          netScope={netScope}
          netScopeDetail={netScopeDetail}
          isNarrowed={isNarrowed}
          net={net}
          saldoParts={saldoParts}
          periodLabel={periodLabel}
          formatCents={formatCents}
          formatSignedCents={formatSignedCents}
        />
      ) : null}
      {/* Schmal zwei Zeilen: oben Anzahl und Barkasse, darunter Einnahmen/
          Ausgaben mit dem Guthaben über die volle Breite. Breit alles in einer. */}
      <div className="flex flex-wrap items-stretch justify-end gap-2 @min-[900px]:flex-nowrap @min-[900px]:gap-2.5">
        <span
          className="knglmrt-num mr-auto self-center whitespace-nowrap text-muted-foreground"
          title={`${count} ${count === 1 ? "Buchung" : "Buchungen"}`}
          aria-live="polite"
        >
          {count}
          <span className="hidden @min-[480px]:inline">
            {" "}
            {count === 1 ? "Buchung" : "Buchungen"}
          </span>
          {bookedNotice ? (
            <span className="hidden text-foreground @min-[1300px]:inline">
              {" "}
              · Kassenbuchung gespeichert
            </span>
          ) : null}
        </span>

        {cashRegister ? (
          <div ref={cashRef} className="relative flex shrink-0">
            <div
              className={`flex items-center gap-1 knglmrt-border pr-1 pl-3 @min-[640px]:gap-2.5 @min-[640px]:pl-4 ${bookingOpen ? "bg-primary-soft" : "bg-card"}`}
              title={cashRegister.error ?? undefined}
            >
              <SummaryFigure
                label="Barkasse"
                value={
                  cashRegister.balance !== null
                    ? formatCents(cashRegister.balance)
                    : "—"
                }
              />
              <Button
                kind="ghost"
                size="small"
                iconOnly
                icon={faPlus}
                onClick={() => setBookingOpen((open) => !open)}
                aria-expanded={bookingOpen}
                aria-haspopup="dialog"
                aria-label="Bargeld buchen"
                title="Bargeld buchen"
              />
            </div>
            {bookingOpen ? (
              <CashBooking
                label={cashRegister.label}
                balance={cashRegister.balance}
                costCenter2={cashRegister.costCenter2}
                asModal={!isWide}
                onClose={() => setBookingOpen(false)}
                onBooked={() => {
                  setBookingOpen(false);
                  setBookedNotice(true);
                  cashRegister.onBooked();
                }}
                formatCents={formatCents}
              />
            ) : null}
          </div>
        ) : null}

        {/* Einnahmen/Ausgaben und Guthaben hängen zusammen: Das Guthaben ist
            ihre Summe, beide öffnen dieselbe Auswertung. */}
        <div className="order-last flex w-full min-w-0 items-stretch @min-[900px]:order-none @min-[900px]:w-auto">
          <button
            type="button"
            onClick={toggleBreakdown}
            aria-expanded={breakdownOpen}
            aria-controls="receipts-breakdown"
            title={breakdownOpen ? "Auswertung schließen" : "Auswertung öffnen"}
            className={`flex min-w-0 flex-1 cursor-pointer flex-nowrap items-center justify-between gap-x-4 knglmrt-border border-r-0! px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] @min-[640px]:px-4 @min-[900px]:flex-none @min-[900px]:justify-start @min-[1300px]:gap-x-5 @min-[1300px]:py-3 ${breakdownOpen ? "bg-primary-soft" : "bg-card hover:bg-muted"}`}
          >
            {sides.map((side) => (
              <SummaryFigure
                key={side.kind}
                label={side.title}
                value={formatSignedCents(barTotals[side.kind])}
                valueClassName={INK[side.kind]}
              />
            ))}
          </button>

          <button
            type="button"
            onClick={toggleBreakdown}
            aria-expanded={breakdownOpen}
            aria-controls="receipts-breakdown"
            title={breakdownOpen ? "Auswertung schließen" : "Saldo-Rechnung öffnen"}
            className="flex shrink-0 cursor-pointer items-center gap-3 knglmrt-border bg-[var(--knglmrt-ink)] px-3 py-2 text-left text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] @min-[640px]:px-5 @min-[1300px]:gap-5 @min-[1300px]:py-3"
          >
            <span className="flex flex-col justify-center whitespace-nowrap @min-[1300px]:flex-row @min-[1300px]:items-baseline @min-[1300px]:gap-1.5">
              <span
                className={`flex min-w-0 ${FIGURE_LABEL} text-white/70 @min-[1300px]:text-white`}
                title={netScopeDetail}
              >
                {netLabel}
                <span className="hidden max-w-[16ch] truncate align-bottom @min-[640px]:inline-block">
                  &nbsp;· {netScope}
                </span>
              </span>
              <span
                className={`knglmrt-value whitespace-nowrap text-[length:var(--ui-size-num)]! leading-4! @min-[640px]:text-[length:var(--ui-size-card)]! @min-[640px]:leading-tight! ${net < 0 ? "text-[var(--knglmrt-pink-60)]" : ""}`}
              >
                {formatCents(net)}
              </span>
            </span>
            {/* Ein Pfeil für den ganzen Block — beide Hälften öffnen dieselbe Auswertung. */}
            {caret}
          </button>
        </div>
      </div>
    </div>
  );
}

// Beschriftung aller Werte der Leiste (Barkasse, Einnahmen, Ausgaben, Guthaben):
// schmal Label-Größe (14px) über dem Wert, breit Fließtext daneben.
const FIGURE_LABEL =
  "text-[length:var(--ui-size-label)] leading-5 @min-[1300px]:text-[length:var(--ui-size-body)] @min-[1300px]:leading-normal";

// Ein Wert der Saldo-Zeile: schmal Beschriftung über dem Wert, breit daneben.
function SummaryFigure({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col whitespace-nowrap @min-[1300px]:flex-row @min-[1300px]:items-baseline @min-[1300px]:gap-1.5">
      <span className={`${FIGURE_LABEL} text-muted-foreground @min-[1300px]:text-foreground`}>
        {label}
      </span>
      <span className={`knglmrt-num font-bold! ${valueClassName ?? ""}`}>
        {value}
      </span>
    </span>
  );
}
