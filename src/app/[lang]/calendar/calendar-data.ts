import ICAL from "ical.js";
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

export const getUpcomingEvents = async () => {
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(
    rangeStart.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000,
  );

  const response = await fetch(ICAL_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Kalender konnte nicht geladen werden.");
  }

  const icsText = await response.text();
  const jcalData = ICAL.parse(icsText);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents("vevent");

  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
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
