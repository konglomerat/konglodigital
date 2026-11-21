// src/app/[lang]/verein/VereinCalendar.tsx — das Kalender-Panel der
// Vereinsseite. Der Abruf liegt bewusst in einer eigenen async-Komponente:
// die Seite streamt zuerst ihren Text, das Panel füllt sich nach.
// Optik aus dem Prototyp: dunkler Kopf, Monatsband in paper-grey,
// je Termin zwei Zeilen (Datum/Titel, Zeit/Ort), Fuß mit Link.
import Link from "next/link";
import type { ReactNode } from "react";
import { filterWerkbereichEvents } from "@/lib/werkbereich-calendar";
import { findVereinsprojekt, findWerkbereich } from "@/lib/werkbereiche";

import {
  CALENDAR_URL,
  TIME_ZONE,
  getUpcomingEvents,
  type CalendarEvent,
} from "../calendar/calendar-data";

/** Wie weit das Panel in die Zukunft schaut und wie viele Zeilen es zeigt. */
const DAYS_AHEAD = 60;
const MAX_EVENTS = 6;
/** Der Google-Feed wird pro Fenster einmal geholt, nicht pro Aufruf. */
const REVALIDATE_SECONDS = 300;

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
});
const dayMonthFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});
const monthLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  month: "long",
});
const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});
const clockFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatDate = (date: Date) =>
  `${weekdayFormatter.format(date)} ${dayMonthFormatter.format(date)}`;

/** "18–22 Uhr", solange beide Zeiten auf der vollen Stunde liegen. */
const formatTimeRange = (event: CalendarEvent) => {
  if (event.allDay) return "ganztägig";

  const start = clockFormatter.format(event.start);
  if (!event.end) return `${start} Uhr`;

  const end = clockFormatter.format(event.end);
  const bothFullHours = start.endsWith(":00") && end.endsWith(":00");
  return bothFullHours
    ? `${start.slice(0, -3)}–${end.slice(0, -3)} Uhr`
    : `${start}–${end} Uhr`;
};

/**
 * Google liefert im Ort die volle Anschrift. In der schmalen Spalte steht
 * nur der Name davor; der ganze Ort bleibt als title-Attribut erreichbar.
 */
const shortenLocation = (location?: string) => location?.split(",")[0]?.trim();

type CalendarMonth = { key: string; label: string; events: CalendarEvent[] };

const groupByMonth = (events: CalendarEvent[]): CalendarMonth[] => {
  const months: CalendarMonth[] = [];
  for (const event of events) {
    const key = monthKeyFormatter.format(event.start);
    const last = months.at(-1);
    if (last?.key === key) {
      last.events.push(event);
      continue;
    }
    months.push({
      key,
      label: monthLabelFormatter.format(event.start),
      events: [event],
    });
  }
  return months;
};

/** Der Rahmen — geteilt von Skelett, Fehlerfall und gefülltem Panel. */
function CalendarPanel({ children, werkbereich, compact = false }: { children: ReactNode; werkbereich?: string; compact?: boolean }) {
  const areaName = werkbereich
    ? findWerkbereich(werkbereich)?.name ?? findVereinsprojekt(werkbereich)?.name ?? werkbereich
    : null;
  return (
    <div className="knglmrt-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-[var(--knglmrt-dark-100)] px-3.5 py-4 text-white">
        <span className="font-[family-name:var(--font-display)] text-[17px] font-black leading-5">
          {compact ? "Nächste Termine" : "Kalender"}
        </span>
        {!compact && <span className="text-[var(--knglmrt-dark-30)]">
          {areaName ? `Termine · ${areaName}` : "Termine des Vereins"}
        </span>}
      </div>
      {children}
      <div className="knglmrt-border-t px-3.5 py-[11px]">
        <Link href="/calendar" className="text-primary hover:text-primary/80">
          {compact ? "Alle Termine →" : "Ganzer Kalender"}
        </Link>
      </div>
    </div>
  );
}

function MonthBand({ label, first }: { label: string; first: boolean }) {
  return (
    <div
      className={`knglmrt-caption bg-muted px-3.5 py-[7px] text-[var(--knglmrt-brown-100)]${
        first ? "" : " knglmrt-border-t"
      }`}
    >
      {label}
    </div>
  );
}

export function VereinCalendarSkeleton({ werkbereich, compact = false }: { werkbereich?: string; compact?: boolean } = {}) {
  return (
    <CalendarPanel werkbereich={werkbereich} compact={compact}>
      <MonthBand label="Wird geladen" first />
      <div aria-hidden="true" className="animate-pulse">
        {Array.from({ length: compact ? 2 : 4 }, (_, row) => (
          <div
            key={row}
            data-calendar-event
            className={`grid grid-cols-[0.72fr_1fr] gap-x-3 gap-y-1.5 px-3.5 py-2.5${
              row === 0 ? "" : " border-t border-border"
            }`}
          >
            <span className="block h-3.5 bg-muted" />
            <span className="block h-3.5 bg-muted" />
            <span className="block h-3 w-2/3 bg-muted" />
            <span className="block h-3 w-1/2 bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Termine werden geladen.</span>
    </CalendarPanel>
  );
}

export default async function VereinCalendar({ werkbereich, compact = false }: { werkbereich?: string; compact?: boolean } = {}) {
  let events: CalendarEvent[];
  try {
    events = await getUpcomingEvents(DAYS_AHEAD, {
      revalidateSeconds: REVALIDATE_SECONDS,
    });
  } catch {
    return (
      <CalendarPanel werkbereich={werkbereich} compact={compact}>
        <div className="px-3.5 py-4 text-muted-foreground">
          Die Termine sind gerade nicht abrufbar.{" "}
          <a
            href={CALENDAR_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary/80"
          >
            Google Kalender öffnen
          </a>
        </div>
      </CalendarPanel>
    );
  }

  const months = groupByMonth(filterWerkbereichEvents(events, werkbereich).slice(0, compact ? 2 : MAX_EVENTS));

  if (months.length === 0) {
    return (
      <CalendarPanel werkbereich={werkbereich} compact={compact}>
        <div className="px-3.5 py-4 text-muted-foreground">
          {werkbereich
            ? "Für diesen Werkbereich sind in den nächsten 60 Tagen keine Termine angekündigt."
            : "In den nächsten Wochen steht nichts im Kalender."}
        </div>
      </CalendarPanel>
    );
  }

  return (
    <CalendarPanel werkbereich={werkbereich} compact={compact}>
      {months.map((month, monthIndex) => (
        <div key={month.key}>
          <MonthBand label={month.label} first={monthIndex === 0} />
          {month.events.map((event, eventIndex) => (
            <div
              key={event.id}
              data-calendar-event
              className={`${compact ? "flex flex-col" : "grid grid-cols-[0.72fr_1fr]"} gap-x-3 gap-y-1 px-3.5 py-2.5${
                eventIndex === 0 ? "" : " border-t border-border"
              }`}
            >
              {compact ? <>
                <div className="flex flex-wrap gap-x-3 text-sm">
                  <span className="knglmrt-num text-primary">{formatDate(event.start)}</span>
                  <span className="knglmrt-num text-muted-foreground">{formatTimeRange(event)}</span>
                </div>
                <span className="min-w-0 [overflow-wrap:anywhere]">{event.summary}</span>
              </> : <><span className="knglmrt-num text-primary">
                {formatDate(event.start)}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{event.summary}</span>
              <span className="knglmrt-num text-muted-foreground">
                {formatTimeRange(event)}
              </span>
              <span
                className="min-w-0 truncate text-muted-foreground"
                title={event.location}
              >
                {shortenLocation(event.location)}
              </span></>}
            </div>
          ))}
        </div>
      ))}
    </CalendarPanel>
  );
}
