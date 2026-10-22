import ICAL from "ical.js";
import { unstable_cache } from "next/cache";
import {
  faBolt,
  faBoxesStacked,
  faDoorOpen,
  faGears,
  faHandshake,
  faHouse,
  faIndustry,
  faMicrochip,
  faTree,
} from "@fortawesome/free-solid-svg-icons";

const CALENDAR_CID =
  "Ymo4NWQ3NDJnMzFtZ2tibGJhaXVzbWszczhAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ";
export const CALENDAR_URL = `https://calendar.google.com/calendar/u/4?cid=${CALENDAR_CID}`;
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/bj85d742g31mgkblbaiusmk3s8%40group.calendar.google.com/public/basic.ics";
export const TIME_ZONE = "Europe/Berlin";
const DAYS_AHEAD = 7;

export type CalendarEvent = {
  id: string;
  summary: string;
  location?: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
};

export type CalendarDay = {
  key: string;
  label: string;
  date: Date;
  events: CalendarEvent[];
};

export type TagKey =
  | "CNC"
  | "HOLZ"
  | "BETON"
  | "LASER"
  | "ELEKTRONIK"
  | "MATERIALVERMITTLUNG"
  | "INTRO"
  | "VHC"
  | "OFFENE_WS";

export const tagIconMap: Record<
  TagKey,
  { icon: typeof faGears; label: string; colorClassName: string }
> = {
  CNC: {
    icon: faGears,
    label: "CNC",
    colorClassName: "text-muted-foreground",
  },
  HOLZ: {
    icon: faTree,
    label: "Holz",
    colorClassName: "text-muted-foreground",
  },
  BETON: {
    icon: faIndustry,
    label: "Beton",
    colorClassName: "text-muted-foreground",
  },
  LASER: {
    icon: faBolt,
    label: "Laser",
    colorClassName: "text-muted-foreground",
  },
  ELEKTRONIK: {
    icon: faMicrochip,
    label: "Elektronik",
    colorClassName: "text-muted-foreground",
  },
  MATERIALVERMITTLUNG: {
    icon: faBoxesStacked,
    label: "Materialvermittlung",
    colorClassName: "text-muted-foreground",
  },
  INTRO: {
    icon: faHandshake,
    label: "Intro",
    colorClassName: "text-primary",
  },
  VHC: {
    icon: faHouse,
    label: "VHC",
    colorClassName: "text-destructive",
  },
  OFFENE_WS: {
    icon: faDoorOpen,
    label: "Offene WS",
    colorClassName: "text-success",
  },
};

export const extractTags = (description?: string) => {
  if (!description) {
    return [] as TagKey[];
  }
  const matches = description.match(/#([\p{L}\p{N}_-]+)/giu) ?? [];
  const normalized = matches
    .map((tag) => tag.replace("#", "").toUpperCase())
    .map((tag) => (tag === "OFFENE_WS" ? "OFFENE_WS" : tag));

  const allowed = new Set<TagKey>([
    "CNC",
    "HOLZ",
    "BETON",
    "LASER",
    "ELEKTRONIK",
    "MATERIALVERMITTLUNG",
    "INTRO",
    "VHC",
    "OFFENE_WS",
  ]);

  return Array.from(new Set(normalized))
    .filter((tag): tag is TagKey => allowed.has(tag as TagKey))
    .sort((a, b) => a.localeCompare(b));
};

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export const getDayKey = (date: Date) => dayKeyFormatter.format(date);

export const getTimeRange = (start: Date, end?: Date) => {
  if (!end) {
    return timeFormatter.format(start);
  }
  return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
};

export const buildDays = (now: Date): CalendarDay[] =>
  Array.from({ length: DAYS_AHEAD }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return {
      key: getDayKey(date),
      label: dayLabelFormatter.format(date),
      date,
      events: [] as CalendarEvent[],
    };
  });

const normalizeEvent = (
  event: ICAL.Event,
  startDate: ICAL.Time,
  endDate?: ICAL.Time | null,
): CalendarEvent => {
  const summary = event.summary?.toString().trim() || "(Ohne Titel)";
  const start = startDate.toJSDate();
  const end = endDate ? endDate.toJSDate() : undefined;
  const allDay = startDate.isDate;

  return {
    id: `${event.uid}-${start.toISOString()}`,
    summary,
    location: event.location?.toString(),
    description: event.description?.toString(),
    start,
    end,
    allDay,
  } satisfies CalendarEvent;
};

/** So weit reicht der gecachte Ausschnitt; Aufrufer schneiden daraus zu. */
const CACHED_DAYS = 90;
/** Der Google-Feed (gut 1 MB) wird höchstens alle fünf Minuten neu geholt. */
const CALENDAR_REVALIDATE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

type SerializedCalendarEvent = Omit<CalendarEvent, "start" | "end"> & {
  start: string;
  end?: string;
};

/**
 * Serien, deren letzte Wiederholung vor dem Fenster liegt, können nichts
 * mehr beitragen. Der Iterator liefe sonst jede einzelne Wiederholung
 * seit dem Serienstart ab.
 */
const seriesEndedBefore = (vevent: ICAL.Component, rangeStart: Date) => {
  if (vevent.getAllProperties("rdate").length > 0) return false;
  const rrules = vevent
    .getAllProperties("rrule")
    .map((property) => property.getFirstValue() as ICAL.Recur);
  return (
    rrules.length > 0 &&
    rrules.every((rule) => rule.until && rule.until.toJSDate() < rangeStart)
  );
};

const parseEvents = (icsText: string, rangeStart: Date, rangeEnd: Date) => {
  const component = new ICAL.Component(ICAL.parse(icsText));
  const vevents = component.getAllSubcomponents("vevent");

  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
      if (seriesEndedBefore(vevent, rangeStart)) continue;

      const iterator = event.iterator();
      let next = iterator.next();

      while (next) {
        const occurrenceStart = next.toJSDate();
        if (occurrenceStart > rangeEnd) {
          break;
        }
        if (occurrenceStart >= rangeStart) {
          const details = event.getOccurrenceDetails(next);
          events.push(
            normalizeEvent(event, details.startDate, details.endDate ?? null),
          );
        }
        next = iterator.next();
      }
      continue;
    }

    if (!event.startDate) {
      continue;
    }

    const start = event.startDate.toJSDate();
    if (start < rangeStart || start > rangeEnd) {
      continue;
    }

    events.push(normalizeEvent(event, event.startDate, event.endDate));
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
};

/**
 * Abruf und Auflösen der Serien kosten zusammen gut eine halbe Sekunde
 * Rechenzeit. Deshalb liegt das fertige Ergebnis im Cache, nicht nur die
 * Antwort von Google. Der Schlüssel ist der Tagesbeginn: mit jedem neuen Tag
 * entsteht ein neuer Eintrag.
 */
const loadCachedEvents = unstable_cache(
  async (rangeStartIso: string): Promise<SerializedCalendarEvent[]> => {
    const rangeStart = new Date(rangeStartIso);
    const rangeEnd = new Date(rangeStart.getTime() + CACHED_DAYS * DAY_MS);

    const response = await fetch(ICAL_URL, {
      next: { revalidate: CALENDAR_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error("Kalender konnte nicht geladen werden.");
    }

    return parseEvents(await response.text(), rangeStart, rangeEnd).map(
      (event) => ({
        ...event,
        start: event.start.toISOString(),
        end: event.end?.toISOString(),
      }),
    );
  },
  ["calendar-upcoming-events-v1"],
  { revalidate: CALENDAR_REVALIDATE_SECONDS, tags: ["calendar"] },
);

/**
 * Termine ab heute. `daysAhead` weitet das Fenster (die Vereinsseite zeigt
 * die nächsten Wochen, die Kalenderseite nur eine Woche).
 */
export const getUpcomingEvents = async (
  daysAhead: number = DAYS_AHEAD,
): Promise<CalendarEvent[]> => {
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(
    rangeStart.getTime() + Math.min(daysAhead, CACHED_DAYS) * DAY_MS,
  );

  const events = await loadCachedEvents(rangeStart.toISOString());

  return events
    .map((event) => ({
      ...event,
      start: new Date(event.start),
      end: event.end ? new Date(event.end) : undefined,
    }))
    .filter((event) => event.start <= rangeEnd);
};
