"use client";

// Zeitraum der Buchungstabelle: Schnellzugriffe links, eigener Zeitraum
// rechts — das übliche Muster von Datumsbereichs-Pickern. Ein Zeitraum ist
// ein geschlossenes Intervall zweier Tage im Format YYYY-MM-DD.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import FieldShell from "@/components/knglmrt/FieldShell";

export type Period = { from: string; to: string };

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

const pad = (value: number) => String(value).padStart(2, "0");

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const lastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

// Monat und Quartal dürfen über den Jahreswechsel laufen: new Date
// rechnet negative oder zu große Monate selbst um.
const monthPeriod = (year: number, monthIndex: number): Period => {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
};

const quarterPeriod = (year: number, quarterIndex: number): Period => {
  const start = new Date(year, quarterIndex * 3, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
};

export const yearPeriod = (year: number | string): Period => ({
  from: `${year}-01-01`,
  to: `${year}-12-31`,
});

const formatDay = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
};

// Ganze Jahre, Quartale und Monate heißen auch so — alles andere zeigt
// die beiden Tage.
export const describePeriod = ({ from, to }: Period) => {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const isWholeMonths =
    fromDay === 1 && toDay === lastDayOfMonth(toYear, toMonth - 1);

  if (isWholeMonths && fromYear === toYear) {
    if (fromMonth === 1 && toMonth === 12) {
      return String(fromYear);
    }
    if (fromMonth === toMonth) {
      return `${MONTH_LABELS[fromMonth - 1]} ${fromYear}`;
    }
    if (fromMonth % 3 === 1 && toMonth === fromMonth + 2) {
      return `Q${(fromMonth + 2) / 3} ${fromYear}`;
    }
  }

  return `${formatDay(from)} – ${formatDay(to)}`;
};

const isSamePeriod = (left: Period, right: Period) =>
  left.from === right.from && left.to === right.to;

const getPresets = (): Array<{ label: string; period: Period }> => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const quarter = Math.floor(month / 3);

  return [
    { label: "Dieser Monat", period: monthPeriod(year, month) },
    { label: "Letzter Monat", period: monthPeriod(year, month - 1) },
    { label: "Dieses Quartal", period: quarterPeriod(year, quarter) },
    { label: "Letztes Quartal", period: quarterPeriod(year, quarter - 1) },
    { label: "Dieses Jahr", period: yearPeriod(year) },
    { label: "Letztes Jahr", period: yearPeriod(year - 1) },
  ];
};

type PeriodFilterProps = {
  value: Period;
  onChange: (value: Period) => void;
  /** Jahre mit Buchungen, absteigend — als weitere Schnellzugriffe. */
  years: string[];
  /** Zusatzklasse am aufgeklappten Feld. */
  panelClassName?: string;
};

export default function PeriodFilter({
  value,
  onChange,
  years,
  panelClassName,
}: PeriodFilterProps) {
  const buttonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Period>(value);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const presets = getPresets();
  // Jahre, die schon als „Dieses/Letztes Jahr" dastehen, nicht doppelt.
  const yearShortcuts = years.filter(
    (year) =>
      !presets.some((preset) => isSamePeriod(preset.period, yearPeriod(year))),
  );
  const buttonLabel = describePeriod(value);
  const isDraftValid =
    Boolean(draft.from) && Boolean(draft.to) && draft.from <= draft.to;

  const toggle = () => {
    if (!isOpen) {
      setDraft(value);
    }
    setIsOpen((open) => !open);
  };

  const choose = (period: Period) => {
    onChange(period);
    setIsOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDraftValid) {
      choose(draft);
    }
  };

  const renderShortcut = (label: string, period: Period) => {
    const isActive = isSamePeriod(period, value);
    return (
      <li key={label}>
        <button
          type="button"
          onClick={() => choose(period)}
          aria-pressed={isActive}
          className={`flex w-full items-center justify-between gap-3 px-5 py-2 text-left transition hover:bg-primary-soft ${
            isActive ? "font-bold" : ""
          }`}
        >
          {label}
          {isActive ? (
            <FontAwesomeIcon
              icon={faCheck}
              aria-hidden="true"
              className="h-3 w-3 shrink-0"
            />
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <FieldShell
      as="div"
      htmlFor={buttonId}
      label="Zeitraum"
      className="relative shrink-0"
    >
      <div ref={containerRef}>
        <button
          id={buttonId}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="period-filter-panel"
          onClick={toggle}
          className="inline-flex h-[38px] shrink-0 items-center gap-3 whitespace-nowrap knglmrt-border bg-card px-4 transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <span className="knglmrt-num font-bold!">{buttonLabel}</span>
          <FontAwesomeIcon
            icon={faChevronDown}
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen ? (
          <div
            id="period-filter-panel"
            role="dialog"
            aria-label="Zeitraum wählen"
            className={`absolute left-0 top-full z-30 mt-2 flex w-[min(520px,calc(100vw-2rem))] flex-col border border-primary bg-popover text-popover-foreground sm:flex-row ${panelClassName ?? ""}`}
          >
            <ul className="max-h-[320px] shrink-0 overflow-y-auto border-b border-border py-2 sm:w-48 sm:border-r sm:border-b-0">
              {presets.map((preset) =>
                renderShortcut(preset.label, preset.period),
              )}
              {yearShortcuts.length > 0 ? (
                <li
                  aria-hidden="true"
                  className="mx-5 my-2 border-t border-border"
                />
              ) : null}
              {yearShortcuts.map((year) =>
                renderShortcut(year, yearPeriod(year)),
              )}
            </ul>

            <form
              onSubmit={handleSubmit}
              className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-4"
            >
              <span className="knglmrt-label">Eigener Zeitraum</span>
              <Field
                label="Von"
                type="date"
                kind="mono"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
              <Field
                label="Bis"
                type="date"
                kind="mono"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
              <Button
                type="submit"
                kind="secondary"
                size="small"
                disabled={!isDraftValid}
                className="self-end"
              >
                Anwenden
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
