import "server-only";

import {
  VOLKSHAUS_ROOMS,
  VOLKSHAUS_TIME_ZONE,
  type BusySlot,
  type VolkshausBooking,
  type VolkshausRoomId,
} from "@/lib/volkshaus-booking";
import { berlinDateTimeToIso } from "@/lib/volkshaus-booking-server";

const TEAMUP_API_BASE_URL = "https://api.teamup.com";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export const VOLKSHAUS_TEAMUP_SUBCALENDARS = {
  saal: 11786455,
  stube: 11786456,
  garten: 11786506,
} satisfies Record<VolkshausRoomId, number>;

const ROOM_BY_SUBCALENDAR_ID = new Map<number, VolkshausRoomId>(
  Object.entries(VOLKSHAUS_TEAMUP_SUBCALENDARS).map(
    ([roomId, subcalendarId]) => [
      subcalendarId,
      roomId as VolkshausRoomId,
    ],
  ),
);

type TeamupEvent = {
  id?: string | number;
  remote_id?: string | null;
  all_day?: boolean;
  start_dt?: string;
  end_dt?: string;
  subcalendar_id?: number;
  subcalendar_ids?: number[];
  readonly?: boolean;
};

type TeamupEventsResponse = {
  events?: TeamupEvent[];
  event?: TeamupEvent;
  error?: {
    id?: string;
    title?: string;
    message?: string;
  };
};

type TeamupEventState = "held" | "confirmed" | "completed";

export type VolkshausTeamupSyncResult = {
  action: "created" | "updated" | "deleted" | "noop";
  eventId: string | null;
};

export class VolkshausTeamupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolkshausTeamupConfigurationError";
  }
}

export class VolkshausTeamupApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolkshausTeamupApiError";
  }
}

const getTeamupConfiguration = (mode: "read" | "write") => {
  const apiToken =
    process.env.TEAMUP_API_KEY?.trim() ||
    process.env.TEAMUP_API_TOKEN?.trim();
  const calendarKey =
    mode === "write"
      ? process.env.TEAMUP_WRITE_CALENDAR_KEY?.trim()
      : process.env.TEAMUP_READ_CALENDAR_KEY?.trim() ||
        process.env.TEAMUP_WRITE_CALENDAR_KEY?.trim();

  if (!apiToken || !calendarKey) {
    throw new VolkshausTeamupConfigurationError(
      mode === "write"
        ? "Der Teamup-Kalender hat noch keinen Schreibzugang."
        : "Der Teamup-Kalender ist noch nicht vollständig konfiguriert.",
    );
  }

  return { apiToken, calendarKey };
};

const nextIsoDate = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const parseTeamupDateTime = (value: string) => {
  if (OFFSET_PATTERN.test(value)) {
    return new Date(value);
  }

  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (!DATE_PATTERN.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return new Date(Number.NaN);
  }

  return new Date(berlinDateTimeToIso(date, time));
};

const berlinTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VOLKSHAUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatBerlinTime = (value: Date) => berlinTimeFormatter.format(value);

const getEventTimesForDate = (event: TeamupEvent, date: string) => {
  if (!event.start_dt || !event.end_dt) {
    return null;
  }

  if (event.all_day) {
    const startDate = event.start_dt.slice(0, 10);
    const endDate = event.end_dt.slice(0, 10);
    return startDate <= date && endDate >= date
      ? { startTime: "00:00", endTime: "23:59" }
      : null;
  }

  const eventStart = parseTeamupDateTime(event.start_dt);
  const eventEnd = parseTeamupDateTime(event.end_dt);
  const dayStart = new Date(berlinDateTimeToIso(date, "00:00"));
  const dayEnd = new Date(
    berlinDateTimeToIso(nextIsoDate(date), "00:00"),
  );

  if (
    Number.isNaN(eventStart.getTime()) ||
    Number.isNaN(eventEnd.getTime()) ||
    eventStart >= dayEnd ||
    eventEnd <= dayStart
  ) {
    return null;
  }

  const clippedStart = eventStart < dayStart ? dayStart : eventStart;
  const clippedEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
  return {
    startTime: formatBerlinTime(clippedStart),
    endTime:
      clippedEnd.getTime() === dayEnd.getTime()
        ? "23:59"
        : formatBerlinTime(clippedEnd),
  };
};

const getEventSubcalendarIds = (event: TeamupEvent) => {
  if (Array.isArray(event.subcalendar_ids)) {
    return event.subcalendar_ids;
  }
  return typeof event.subcalendar_id === "number"
    ? [event.subcalendar_id]
    : [];
};

const getTeamupEvents = async ({
  date,
  mode,
}: {
  date: string;
  mode: "read" | "write";
}) => {
  const { apiToken, calendarKey } = getTeamupConfiguration(mode);
  const url = new URL(
    `${TEAMUP_API_BASE_URL}/${encodeURIComponent(calendarKey)}/events`,
  );
  url.searchParams.set("startDate", date);
  url.searchParams.set("endDate", date);
  url.searchParams.set("tz", VOLKSHAUS_TIME_ZONE);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Teamup-Token": apiToken,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new VolkshausTeamupApiError(
      "Der Teamup-Kalender ist gerade nicht erreichbar.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as TeamupEventsResponse;
  if (!response.ok) {
    throw new VolkshausTeamupApiError(
      payload.error?.message ||
        "Der Teamup-Kalender konnte nicht gelesen werden.",
    );
  }

  return { apiToken, calendarKey, events: payload.events ?? [] };
};

export const getVolkshausTeamupRemoteId = (bookingId: string) =>
  `konglodigital-volkshaus-${bookingId}`;

export const getInactiveVolkshausTeamupRemoteIds = (
  bookings: VolkshausBooking[],
  date: string,
  now = Date.now(),
) =>
  bookings
    .filter(
      (booking) =>
        booking.bookingDate === date &&
        (booking.reservationStatus === "cancelled" ||
          booking.requestStatus === "rejected" ||
          (booking.reservationStatus === "held" &&
            booking.holdExpiresAt !== null &&
            new Date(booking.holdExpiresAt).getTime() <= now)),
    )
    .map((booking) => getVolkshausTeamupRemoteId(booking.id));

const getTeamupEventForBooking = (
  events: TeamupEvent[],
  bookingId: string,
) => {
  const remoteId = getVolkshausTeamupRemoteId(bookingId);
  return events.find((event) => event.remote_id === remoteId) ?? null;
};

const statusLabels: Record<TeamupEventState, string> = {
  held: "Vorläufig reserviert",
  confirmed: "Bestätigt",
  completed: "Abgeschlossen",
};

const statusTitlePrefixes: Record<TeamupEventState, string> = {
  held: "[VORLÄUFIG]",
  confirmed: "[BESTÄTIGT]",
  completed: "[ABGESCHLOSSEN]",
};

const compactText = (value: string) => value.replace(/\s+/g, " ").trim();

const getRoomLabels = (booking: VolkshausBooking) =>
  booking.requestedRooms.map(
    (roomId) =>
      VOLKSHAUS_ROOMS.find((room) => room.id === roomId)?.label ?? roomId,
  );

const buildTeamupEventPayload = (
  booking: VolkshausBooking,
  state: TeamupEventState,
) => {
  const roomLabels = getRoomLabels(booking);
  const notes = [
    `Status: ${statusLabels[state]}`,
    `Buchungsreferenz: ${booking.referenceCode}`,
    `Räume: ${roomLabels.join(", ")}`,
    `Teilnehmende: ${booking.expectedAttendees}`,
    booking.setupStartTime ? `Aufbau ab: ${booking.setupStartTime} Uhr` : null,
    booking.teardownEndTime
      ? `Abbau bis: ${booking.teardownEndTime} Uhr`
      : null,
    booking.frequency === "recurring"
      ? `Regelmäßiges Angebot: ${booking.recurringOccurrences} Termin(e) pro Monat; dieser Eintrag bildet den konkret angefragten Termin ab.`
      : null,
    "",
    "Kontaktdaten und weitere Angaben sind im Volkshaus-Buchungssystem hinterlegt.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .slice(0, 10_000);

  return {
    start_dt: booking.setupStartAt ?? booking.startAt,
    end_dt: booking.teardownEndAt ?? booking.endAt,
    all_day: false,
    subcalendar_ids: booking.requestedRooms.map(
      (roomId) => VOLKSHAUS_TEAMUP_SUBCALENDARS[roomId],
    ),
    title: compactText(
      `${statusTitlePrefixes[state]} ${booking.eventTitle} · ${booking.referenceCode}`,
    ).slice(0, 255),
    location: `Neues Volkshaus Cotta · ${roomLabels.join(", ")}`.slice(
      0,
      255,
    ),
    who: `Buchung ${booking.referenceCode}`.slice(0, 255),
    notes,
    rrule: "",
    remote_id: getVolkshausTeamupRemoteId(booking.id),
  };
};

const mutateTeamupEvent = async ({
  calendarKey,
  apiToken,
  method,
  eventId,
  body,
}: {
  calendarKey: string;
  apiToken: string;
  method: "POST" | "PUT";
  eventId?: string;
  body: Record<string, unknown>;
}) => {
  const path = eventId
    ? `/events/${encodeURIComponent(eventId)}`
    : "/events";
  const url = new URL(
    `${TEAMUP_API_BASE_URL}/${encodeURIComponent(calendarKey)}${path}`,
  );
  url.searchParams.set("tz", VOLKSHAUS_TIME_ZONE);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Teamup-Token": apiToken,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new VolkshausTeamupApiError(
      "Der Teamup-Termin konnte nicht gespeichert werden.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as TeamupEventsResponse;
  if (!response.ok) {
    throw new VolkshausTeamupApiError(
      payload.error?.message ||
        "Der Teamup-Termin konnte nicht gespeichert werden.",
    );
  }

  return payload.event ?? null;
};

export const syncVolkshausBookingToTeamup = async (
  booking: VolkshausBooking,
  state: TeamupEventState,
): Promise<VolkshausTeamupSyncResult> => {
  const { apiToken, calendarKey, events } = await getTeamupEvents({
    date: booking.bookingDate,
    mode: "write",
  });
  const existingEvent = getTeamupEventForBooking(events, booking.id);
  if (existingEvent?.readonly) {
    throw new VolkshausTeamupApiError(
      "Der vorhandene Teamup-Termin kann mit diesem Zugang nicht geändert werden.",
    );
  }

  const eventId =
    existingEvent?.id === undefined ? null : String(existingEvent.id);
  const payload = buildTeamupEventPayload(booking, state);
  const event = await mutateTeamupEvent({
    calendarKey,
    apiToken,
    method: eventId ? "PUT" : "POST",
    eventId: eventId ?? undefined,
    body: eventId ? { id: existingEvent?.id, ...payload } : payload,
  });

  return {
    action: eventId ? "updated" : "created",
    eventId: event?.id === undefined ? eventId : String(event.id),
  };
};

export const deleteVolkshausBookingFromTeamup = async (
  booking: VolkshausBooking,
): Promise<VolkshausTeamupSyncResult> => {
  const { apiToken, calendarKey, events } = await getTeamupEvents({
    date: booking.bookingDate,
    mode: "write",
  });
  const event = getTeamupEventForBooking(events, booking.id);
  if (!event || event.id === undefined) {
    return { action: "noop", eventId: null };
  }
  if (event.readonly) {
    throw new VolkshausTeamupApiError(
      "Der vorhandene Teamup-Termin kann mit diesem Zugang nicht gelöscht werden.",
    );
  }

  const eventId = String(event.id);
  const url = new URL(
    `${TEAMUP_API_BASE_URL}/${encodeURIComponent(calendarKey)}/events/${encodeURIComponent(eventId)}`,
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Teamup-Token": apiToken,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new VolkshausTeamupApiError(
      "Der Teamup-Termin konnte nicht gelöscht werden.",
    );
  }

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => ({}))) as TeamupEventsResponse;
    throw new VolkshausTeamupApiError(
      payload.error?.message ||
        "Der Teamup-Termin konnte nicht gelöscht werden.",
    );
  }

  return { action: response.status === 404 ? "noop" : "deleted", eventId };
};

export const getTeamupBusySlots = async (
  date: string,
  options: { excludeRemoteIds?: Iterable<string> } = {},
): Promise<BusySlot[]> => {
  if (!DATE_PATTERN.test(date)) {
    throw new VolkshausTeamupApiError(
      "Für die Teamup-Abfrage wurde ein ungültiges Datum übergeben.",
    );
  }

  const { events } = await getTeamupEvents({ date, mode: "read" });
  const excludedRemoteIds = new Set(options.excludeRemoteIds ?? []);

  return events.flatMap((event, eventIndex) => {
    if (event.remote_id && excludedRemoteIds.has(event.remote_id)) {
      return [];
    }
    const times = getEventTimesForDate(event, date);
    if (!times) {
      return [];
    }

    return getEventSubcalendarIds(event).flatMap((subcalendarId) => {
      const roomId = ROOM_BY_SUBCALENDAR_ID.get(subcalendarId);
      if (!roomId) {
        return [];
      }

      return [
        {
          id: `teamup-${event.id ?? eventIndex}-${roomId}`,
          date,
          roomId,
          ...times,
          source: "teamup" as const,
        },
      ];
    });
  });
};
