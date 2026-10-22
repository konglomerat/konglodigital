// Workshops: Typen und reine Helfer, die Server (Campai) und Client
// (Übersicht, Buchungsseite) gemeinsam nutzen. Der Campai-Zugriff selbst
// liegt in campai-events.ts.
import { WERKBEREICHE, type Werkbereich } from "@/lib/werkbereiche";

export type WorkshopPaymentMethod = "sepaCreditTransfer" | "cash" | "online";

export type WorkshopRate = {
  id: string;
  name: string;
  description: string;
  /** Bruttopreis in Cent; null = kostenlos. */
  priceCents: number | null;
  memberOnly: boolean;
  standard: boolean;
};

export type WorkshopInfoBlock = { title: string; content: string };

export type WorkshopEvent = {
  id: string;
  seriesId: string | null;
  seriesTotal: number;
  title: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  /** Slug aus WERKBEREICHE oder null, wenn kein Bereich passt. */
  area: string | null;
  start: string;
  end: string;
  placeName: string | null;
  placeAddress: string | null;
  maxAttendees: number | null;
  minAttendees: number | null;
  taken: number;
  /** null = unbegrenzt. */
  free: number | null;
  /** Ab wie vielen freien Plätzen Campai „Plätze frei“ statt der Zahl zeigt. */
  seatsThreshold: number;
  /** Ausgebucht heißt: Anmeldung landet auf der Warteliste. */
  waitlistEnabled: boolean;
  /** Anmeldefenster offen und Termin nicht abgesagt. */
  bookingOpen: boolean;
  bookingOpensAt: string | null;
  attendeeMode: "single" | "multiple";
  rates: WorkshopRate[];
  paymentMethods: WorkshopPaymentMethod[];
  paymentNotes: Partial<Record<WorkshopPaymentMethod, string>>;
  paymentDueDays: number | null;
  addressMode: "none" | "optional" | "required";
  requirePhone: boolean;
  infoBlocks: WorkshopInfoBlock[];
  refundText: string;
  refundPolicies: string[];
};

export const MAX_SEATS_PER_BOOKING = 10;

/** Gruppen-Anfragen und formlose Mails (Adresse aus dem Entwurf). */
export const WORKSHOP_REQUEST_EMAIL = "workshops@konglomerat.org";
/** Fragen zu Buchung und Stornierung (Adresse aus dem Entwurf). */
export const WORKSHOP_BOOKING_EMAIL = "kurse@konglomerat.org";

export const isSoldOut = (event: WorkshopEvent) => event.free === 0;

/** Plätze, die eine Buchung höchstens umfassen darf — Warteliste eingerechnet. */
export const maxSeatsFor = (event: WorkshopEvent) => {
  if (event.attendeeMode === "single") return 1;
  if (event.free === null || event.free === 0) return MAX_SEATS_PER_BOOKING;
  return Math.min(event.free, MAX_SEATS_PER_BOOKING);
};

/** Mitgliedertarife sieht nur, wer mit Campai-Kontakt angemeldet ist. */
export const ratesFor = (event: WorkshopEvent, isMember: boolean) =>
  event.rates.filter((rate) => isMember || !rate.memberOnly);

/** Der Preis, der auf der Karte steht: der reguläre Tarif. */
export const listPriceCents = (event: WorkshopEvent) => {
  const publicRates = event.rates.filter((rate) => !rate.memberOnly);
  const rate =
    publicRates.find((entry) => entry.standard) ?? publicRates[0] ?? null;
  return rate?.priceCents ?? null;
};

/** Gibt es für Mitglieder einen günstigeren Tarif? */
export const memberPriceCents = (event: WorkshopEvent) => {
  const memberRates = event.rates.filter((rate) => rate.memberOnly);
  if (memberRates.length === 0) return null;
  return Math.min(...memberRates.map((rate) => rate.priceCents ?? 0));
};

export const PAYMENT_METHOD_LABEL: Record<WorkshopPaymentMethod, string> = {
  sepaCreditTransfer: "Überweisung",
  cash: "Bar vor Ort",
  online: "Online (PayPal)",
};

// Campai nimmt nur internationale Nummern an („+49351…“); „0351 …“ lehnt
// es mit „Ungültige Telefonnummer“ ab. Deutsche Schreibweisen umrechnen.
export const normalizePhone = (value: string) => {
  const compact = value.replace(/[\s()/.-]/g, "");
  if (!compact) return "";
  const international = compact.startsWith("+")
    ? compact
    : compact.startsWith("00")
      ? `+${compact.slice(2)}`
      : compact.startsWith("0")
        ? `+49${compact.slice(1)}`
        : `+${compact}`;
  return /^\+[1-9]\d{6,14}$/.test(international) ? international : "";
};

// ------------------------------------------------------------------
// Formatierung — immer in Dresdner Zeit, egal wo der Server läuft
// ------------------------------------------------------------------

const TIME_ZONE = "Europe/Berlin";

const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, ...options }).format(
    date,
  );

export const formatEuro = (cents: number) =>
  `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export const formatPrice = (cents: number | null) =>
  cents ? formatEuro(cents) : "kostenlos";

/** „25.10.“ */
export const formatDayMonth = (iso: string) =>
  part(new Date(iso), { day: "2-digit", month: "2-digit" }).replace(/\.?$/, ".");

/** „25.10.2026“ */
export const formatDate = (iso: string) =>
  part(new Date(iso), { day: "2-digit", month: "2-digit", year: "numeric" });

/** „Sa“ */
export const formatWeekdayShort = (iso: string) =>
  part(new Date(iso), { weekday: "short" }).replace(".", "");

/** „Samstag“ */
export const formatWeekday = (iso: string) =>
  part(new Date(iso), { weekday: "long" });

// Allein formatiert hängt de-DE an die Stunde „Uhr“ an — deshalb die Teile
// aus einem Stunde-Minute-Format ziehen.
const formatClock = (iso: string) => {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((entry) => entry.type === "hour")?.value);
  const minute = parts.find((entry) => entry.type === "minute")?.value ?? "00";
  return minute === "00" ? String(hour) : `${hour}:${minute}`;
};

/** „14–16:30 Uhr“ */
export const formatTimeRange = (startIso: string, endIso: string) => {
  const sameDay = formatDate(startIso) === formatDate(endIso);
  const end = sameDay
    ? formatClock(endIso)
    : `${formatDayMonth(endIso)} ${formatClock(endIso)}`;
  return `${formatClock(startIso)}–${end} Uhr`;
};

/** „2,5 h“ */
export const formatDuration = (startIso: string, endIso: string) => {
  const hours = (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000;
  if (!(hours > 0)) return null;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const rounded = Math.round(hours * 2) / 2;
  return `${String(rounded).replace(".", ",")} h`;
};

// ------------------------------------------------------------------
// Status auf Karte und Buchungsseite
// ------------------------------------------------------------------

export type SeatStatus = {
  label: string;
  tone: "offen" | "wartet" | "neutral" | "gebucht";
};

export const seatStatus = (event: WorkshopEvent): SeatStatus => {
  if (!event.bookingOpen) {
    return event.bookingOpensAt
      ? { label: `Anmeldung ab ${formatDate(event.bookingOpensAt)}`, tone: "neutral" }
      : { label: "Anmeldung geschlossen", tone: "neutral" };
  }
  if (event.free === null || event.free > event.seatsThreshold) {
    return { label: "Plätze frei", tone: "offen" };
  }
  if (event.free === 0) {
    return { label: event.waitlistEnabled ? "Warteliste" : "Ausgebucht", tone: "neutral" };
  }
  if (event.free <= 2) {
    return {
      label: `Noch ${event.free} ${event.free === 1 ? "Platz" : "Plätze"}`,
      tone: "wartet",
    };
  }
  return { label: `${event.free} von ${event.maxAttendees} frei`, tone: "offen" };
};

export type BookingAction = "book" | "waitlist" | "closed";

export const bookingAction = (event: WorkshopEvent): BookingAction => {
  if (!event.bookingOpen) return "closed";
  if (event.free === 0) return event.waitlistEnabled ? "waitlist" : "closed";
  return "book";
};

// ------------------------------------------------------------------
// Werkbereiche als Filter
// ------------------------------------------------------------------

export const OTHER_AREA = "sonstiges";

export const findArea = (slug: string | null): Werkbereich | null =>
  (slug && WERKBEREICHE.find((entry) => entry.slug === slug)) || null;

export const areaLabel = (slug: string | null) => {
  const area = findArea(slug);
  return area ? (area.shortLabel ?? area.name) : "Konglomerat";
};

/** Filter in der Reihenfolge der Werkbereiche, „Sonstiges“ zuletzt. */
export const areaFilters = (events: WorkshopEvent[]) => {
  const present = new Set(events.map((event) => event.area ?? OTHER_AREA));
  const filters = WERKBEREICHE.filter((area) => present.has(area.slug)).map(
    (area) => ({ value: area.slug, label: area.shortLabel ?? area.name }),
  );
  if (present.has(OTHER_AREA)) {
    filters.push({ value: OTHER_AREA, label: "Sonstiges" });
  }
  return filters;
};

// ------------------------------------------------------------------
// Serien: eine Karte pro Reihe, der nächste buchbare Termin vorn
// ------------------------------------------------------------------

export type WorkshopListEntry = {
  event: WorkshopEvent;
  /** Weitere kommende Termine derselben Reihe (ohne `event`). */
  moreDates: number;
};

export const collapseSeries = (events: WorkshopEvent[]) => {
  const bySeries = new Map<string, WorkshopEvent[]>();
  const entries: WorkshopListEntry[] = [];
  for (const event of events) {
    if (!event.seriesId) {
      entries.push({ event, moreDates: 0 });
      continue;
    }
    const list = bySeries.get(event.seriesId);
    if (list) {
      list.push(event);
    } else {
      const fresh = [event];
      bySeries.set(event.seriesId, fresh);
      // Platzhalter in Reihenfolge des ersten Termins; unten ersetzt.
      entries.push({ event, moreDates: -1 });
    }
  }
  return entries
    .map((entry) => {
      if (entry.moreDates !== -1 || !entry.event.seriesId) return entry;
      const dates = bySeries.get(entry.event.seriesId) ?? [entry.event];
      const next =
        dates.find((event) => bookingAction(event) === "book") ?? dates[0];
      return { event: next, moreDates: dates.length - 1 };
    })
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
};
