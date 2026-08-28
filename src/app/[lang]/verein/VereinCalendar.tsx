// src/app/[lang]/verein/VereinCalendar.tsx — das Kalender-Panel der
// Vereinsseite. Der Abruf liegt bewusst in einer eigenen async-Komponente:
// die Seite streamt zuerst ihren Text, das Panel füllt sich nach.
// Optik aus dem Prototyp: dunkler Kopf, Monatsband in paper-grey,
// je Termin zwei Zeilen (Datum/Titel, Zeit/Ort), Fuß mit Link.
import Link from "next/link";
import type { ReactNode } from "react";

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
function CalendarPanel({ children }: { children: ReactNode }) {
  return (
    <div className="knglmrt-border bg-card">
      <div className="flex items-baseline gap-2.5 bg-[var(--knglmrt-dark-100)] px-3.5 py-3 text-white">
        <span className="font-[family-name:var(--font-display)] text-[17px] font-black leading-5">
          Kalender
        </span>
        <span className="text-[var(--knglmrt-dark-30)]">
          Termine des Vereins
        </span>
      </div>
      {children}
      <div className="knglmrt-border-t px-3.5 py-[11px]">
        <Link href="/calendar" className="text-primary hover:text-primary/80">
          Ganzer Kalender
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

export function VereinCalendarSkeleton() {
  return (
    <CalendarPanel>
      <MonthBand label="Wird geladen" first />
      <div aria-hidden="true" className="animate-pulse">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
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

export default async function VereinCalendar() {
  let events: CalendarEvent[];
  try {
    events = await getUpcomingEvents(DAYS_AHEAD, {
      revalidateSeconds: REVALIDATE_SECONDS,
    });
  } catch {
    return (
      <CalendarPanel>
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

  const months = groupByMonth(events.slice(0, MAX_EVENTS));

  if (months.length === 0) {
    return (
      <CalendarPanel>
        <div className="px-3.5 py-4 text-muted-foreground">
          In den nächsten Wochen steht nichts im Kalender.
        </div>
      </CalendarPanel>
    );
  }

  return (
    <CalendarPanel>
      {months.map((month, monthIndex) => (
        <div key={month.key}>
          <MonthBand label={month.label} first={monthIndex === 0} />
          {month.events.map((event, eventIndex) => (
            <div
              key={event.id}
              className={`grid grid-cols-[0.72fr_1fr] gap-x-3 gap-y-1 px-3.5 py-2.5${
                eventIndex === 0 ? "" : " border-t border-border"
              }`}
            >
              <span className="knglmrt-num text-primary">
                {formatDate(event.start)}
              </span>
              <span className="min-w-0">{event.summary}</span>
              <span className="knglmrt-num text-muted-foreground">
                {formatTimeRange(event)}
              </span>
              <span
                className="min-w-0 truncate text-muted-foreground"
                title={event.location}
              >
                {shortenLocation(event.location)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </CalendarPanel>
  );
}
