"use client";

// Eingabe einer neuen Aufgabe: Titel, optional Datum und Priorität als Chips.
// Enter legt an, Esc schließt erst das offene Popover, dann das Formular.
import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import Button from "@/components/knglmrt/Button";
import { cn } from "@/components/knglmrt/FieldShell";
import {
  MONTHS,
  WEEKDAYS,
  addDays,
  monthCells,
  nextMonday,
  parseIsoDate,
  relativeLabel,
  shortDate,
  startOfDay,
  toIsoDate,
} from "@/lib/tasks/format";
import type { TaskPriority } from "@/lib/tasks/types";

export const PRIORITIES: Record<TaskPriority, { label: string; mark: string }> = {
  1: { label: "Hoch", mark: "var(--knglmrt-pink-100)" },
  2: { label: "Mittel", mark: "var(--knglmrt-yellow-100)" },
  3: { label: "Niedrig", mark: "var(--knglmrt-blue-100)" },
};

export type TaskDraft = {
  title: string;
  dueDate: string | null;
  priority: TaskPriority | null;
};

type Popover = "date" | "prio" | null;

/** Schließt ein offenes Menü, sobald außerhalb von `selector` geklickt wird. */
export const useCloseOnOutsideClick = (open: boolean, selector: string, close: () => void) =>
  useEffect(() => {
    if (!open) return;
    const onDown = (event: globalThis.MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.(selector)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, selector, close]);

const popoverClassName =
  "absolute left-0 top-[30px] z-10 flex flex-col border border-black bg-white shadow-[3px_3px_0_#000]";

const menuItemClassName =
  "flex cursor-pointer items-center gap-2.5 px-3 py-[7px] text-left text-[13px] leading-[18px] hover:bg-[#f3f3f3]";

function ClearMark({ label, onClick }: { label: string; onClick: (event: MouseEvent) => void }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
      className="relative -mr-[3px] h-3.5 w-3.5 flex-none"
    >
      <span className="absolute left-0.5 top-1.5 h-[1.5px] w-2.5 rotate-45 bg-current" />
      <span className="absolute left-0.5 top-1.5 h-[1.5px] w-2.5 -rotate-45 bg-current" />
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[26px] cursor-pointer items-center gap-[7px] whitespace-nowrap border px-2 text-[13px] hover:bg-[#f3f3f3]",
        active
          ? "border-[var(--knglmrt-pink-100)] bg-[#faecf1] text-[var(--knglmrt-pink-100)]"
          : "border-[#c1c3c9] bg-white text-[#2e3846]",
      )}
    >
      {children}
    </button>
  );
}

function DueCalendar({
  value,
  today,
  onPick,
}: {
  value: Date | null;
  today: Date;
  onPick: (date: Date | null) => void;
}) {
  const [month, setMonth] = useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const short = (date: Date) => `${WEEKDAYS[date.getDay()].slice(0, 2)} ${shortDate(date, today)}`;
  const quick = [
    { label: "Heute", date: today },
    { label: "Morgen", date: addDays(today, 1) },
    { label: "Nächste Woche", date: nextMonday(today) },
    { label: "Ohne Datum", date: null },
  ];
  const shift = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <div className={cn(popoverClassName, "w-[260px]")}>
      <div className="flex flex-col border-b-[0.5px] border-[#c1c3c9] py-1">
        {quick.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => onPick(entry.date)}
            className={cn(menuItemClassName, "justify-between")}
          >
            <span>{entry.label}</span>
            <span className="font-num text-[11px] text-[#6b727c]">
              {entry.date ? short(entry.date) : ""}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Vorheriger Monat"
              onClick={() => shift(-1)}
              className="flex h-6 w-6 items-center justify-center hover:bg-[#f3f3f3]"
            >
              <span className="ml-[3px] h-1.5 w-1.5 rotate-45 border-b-[1.5px] border-l-[1.5px] border-black" />
            </button>
            <button
              type="button"
              aria-label="Nächster Monat"
              onClick={() => shift(1)}
              className="flex h-6 w-6 items-center justify-center hover:bg-[#f3f3f3]"
            >
              <span className="-ml-[3px] h-1.5 w-1.5 rotate-45 border-r-[1.5px] border-t-[1.5px] border-black" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
            <span
              key={day}
              className="text-center text-[10px] font-bold uppercase leading-[18px] tracking-[.08em] text-[#6b727c]"
            >
              {day}
            </span>
          ))}
          {monthCells(month.getFullYear(), month.getMonth()).map((date, index) => {
            if (!date) return <span key={`lead-${index}`} />;
            const selected = value?.getTime() === date.getTime();
            const isToday = date.getTime() === today.getTime();
            return (
              <button
                key={date.getTime()}
                type="button"
                onClick={() => onPick(date)}
                className={cn(
                  "flex h-[30px] items-center justify-center font-num text-[12px] hover:outline hover:outline-1 hover:outline-black",
                  selected
                    ? "bg-[var(--knglmrt-pink-100)] text-white"
                    : date < today
                      ? "text-[#a6aab2]"
                      : isToday
                        ? "text-[var(--knglmrt-pink-100)] shadow-[inset_0_0_0_1px_var(--knglmrt-pink-100)]"
                        : "text-black",
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TaskComposer({
  onSubmit,
  onClose,
}: {
  /** Liefert erst nach dem Speichern zurück; das Formular bleibt danach offen. */
  onSubmit: (draft: TaskDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [saving, setSaving] = useState(false);
  const today = startOfDay(new Date());
  const due = parseIsoDate(dueDate);

  const closePopover = useCallback(() => setPopover(null), []);
  useCloseOnOutsideClick(!!popover, "[data-composer-pop]", closePopover);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await onSubmit({ title: title.trim(), dueDate, priority });
    setSaving(false);
    if (ok) {
      setTitle("");
      setDueDate(null);
      setPriority(null);
      setPopover(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.target as Element).tagName === "INPUT") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      if (popover) setPopover(null);
      else onClose();
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      className="mt-1 flex flex-col gap-2.5 border border-black bg-white px-3 py-2.5"
    >
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Aufgabe, z. B. Zugangskarte ausstellen"
        aria-label="Neue Aufgabe"
        className="w-full border-none bg-transparent py-0.5 text-[15px] leading-5 text-black outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        <div data-composer-pop className="relative">
          <Chip active={!!due} onClick={() => setPopover(popover === "date" ? null : "date")}>
            <span className="h-2.5 w-[11px] flex-none border border-t-[3px] border-current" />
            <span>{due ? relativeLabel(due, today) : "Datum"}</span>
            {due ? (
              <ClearMark
                label="Datum entfernen"
                onClick={(event) => {
                  event.stopPropagation();
                  setDueDate(null);
                  setPopover(null);
                }}
              />
            ) : null}
          </Chip>
          {popover === "date" ? (
            <DueCalendar
              value={due}
              today={today}
              onPick={(date) => {
                setDueDate(date ? toIsoDate(date) : null);
                setPopover(null);
              }}
            />
          ) : null}
        </div>
        <div data-composer-pop className="relative">
          <Chip active={!!priority} onClick={() => setPopover(popover === "prio" ? null : "prio")}>
            <span
              className="h-[9px] w-[9px] flex-none border"
              style={{
                background: priority ? PRIORITIES[priority].mark : "transparent",
                borderColor: priority ? PRIORITIES[priority].mark : "currentColor",
              }}
            />
            <span>{priority ? PRIORITIES[priority].label : "Priorität"}</span>
            {priority ? (
              <ClearMark
                label="Priorität entfernen"
                onClick={(event) => {
                  event.stopPropagation();
                  setPriority(null);
                  setPopover(null);
                }}
              />
            ) : null}
          </Chip>
          {popover === "prio" ? (
            <div className={cn(popoverClassName, "w-[170px] py-1")}>
              {([1, 2, 3] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPriority(value);
                    setPopover(null);
                  }}
                  className={cn(menuItemClassName, priority === value && "bg-[#faecf1]")}
                >
                  <span
                    className="h-[9px] w-[9px] flex-none"
                    style={{ background: PRIORITIES[value].mark }}
                  />
                  <span>{PRIORITIES[value].label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t-[0.5px] border-[#c1c3c9] pt-2">
        <Button kind="quiet" size="chip" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          kind="primary"
          size="chip"
          disabled={!title.trim()}
          loading={saving}
          onClick={() => void submit()}
        >
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
