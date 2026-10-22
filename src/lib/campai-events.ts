// Workshops und Kurse aus dem Campai-Veranstaltungsmodul (booking/events).
// Liest öffentliche Termine, rechnet freie Plätze und Tarife in eine
// schlanke, serialisierbare Form um und legt Buchungen direkt in Campai an.
//
// Campai-Eigenheiten (Stand 2026-10):
// - `statistics.attendees` zählt auch Warteliste und Stornos; belegt sind
//   nur confirmed + pending + offered.
// - `offer.rates[].charge.price.price` ist der Bruttopreis in Cent, `null`
//   heißt kostenlos. Ein Tarif mit `member` gilt nur für Mitglieder.
// - `offer.attendeeMode` "single" = die anmeldende Person ist der einzige
//   Teilnehmer; "multiple" = mehrere Namen pro Buchung.
// - `offer.bookingRestriction` "requireConfirmation" („Bestätigung
//   erforderlich“) schickt jede Anmeldung auf die Warteliste, auch bei
//   freien Plätzen. So laufen Workshops ohne festen Termin („Termin offen“).
import "server-only";

import { unstable_cache } from "next/cache";

import {
  compareWorkshops,
  maxSeatsFor,
  normalizePhone,
  ratesFor,
  type WorkshopEvent,
  type WorkshopInfoBlock,
  type WorkshopPaymentMethod,
} from "@/lib/workshops";

type CampaiPrice = { price?: number | null } | null;

type CampaiRate = {
  id?: string;
  name?: string;
  description?: string;
  member?: unknown;
  standard?: boolean;
  availableFrom?: string | null;
  availableTo?: string | null;
  charge?: { type?: string; price?: CampaiPrice } | null;
};

type CampaiFormField = {
  id?: string;
  type?: string;
  title?: string;
  content?: string;
  fields?: CampaiFormField[];
};

type CampaiRefundPolicy = {
  refundUntil?: { value?: number; unit?: string } | null;
  priceModifier?: { value?: number; type?: string } | null;
};

type CampaiEvent = {
  _id: string;
  statistics?: Record<string, number | undefined> | null;
  series?: { id?: string; total?: number } | null;
  info?: {
    title?: string;
    description?: string;
    image?: { resource?: string } | string | null;
    place?: {
      type?: string;
      address?: CampaiAddress | null;
      resource?: { siteName?: string; siteAddress?: CampaiAddress | null } | null;
    } | null;
    categories?: Array<{ name?: string; bookingCategoryId?: string }>;
  } | null;
  settings?: {
    maxAttendees?: number | null;
    minAttendees?: { count?: number } | null;
  } | null;
  offer?: {
    mode?: string;
    attendeeMode?: string;
    availability?: { from?: string | null; to?: string | null } | null;
    rates?: CampaiRate[];
    bookingRestriction?: string;
    displaySettings?: { seatsAvailableThreshold?: number } | null;
    paymentMethods?: Partial<
      Record<WorkshopPaymentMethod | "sepaDirectDebit", { note?: string } | null>
    > | null;
    paymentDueDate?: { payUntil?: { value?: number; unit?: string } } | null;
    form?: { groups?: Array<{ fields?: CampaiFormField[] }> } | null;
    formSettings?: { addressMode?: string; requirePhone?: boolean } | null;
    refundText?: string;
    refundPolicies?: CampaiRefundPolicy[];
  } | null;
  period?: { from?: string; to?: string; status?: string } | null;
  cancelation?: unknown;
};

type CampaiAddress = {
  zip?: string;
  city?: string;
  addressLine?: string;
};

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const campaiBaseUrl = () =>
  `https://cloud.campai.com/api/${requiredEnv("CAMPAI_ORGANIZATION_ID")}/${requiredEnv("CAMPAI_MANDATE_ID")}`;

// Campai antwortet bei Validierungsfehlern nur „Input validation failed“;
// die eigentlichen Gründe stehen in data.validation.
const campaiErrorMessage = (raw: string, fallback: string) => {
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      data?: { validation?: Record<string, string> };
    };
    const details = Object.values(parsed.data?.validation ?? {}).filter(Boolean);
    if (details.length > 0) return details.join(" · ");
    if (parsed.message?.trim()) return parsed.message.trim();
  } catch {
    // kein JSON — Rohtext unten
  }
  return raw.trim() || fallback;
};

const campaiFetch = async <T>(path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${campaiBaseUrl()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": requiredEnv("CAMPAI_API_KEY"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error(
      campaiErrorMessage(text, `Campai request failed for ${path}.`),
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (text.trim() ? JSON.parse(text) : null) as T;
};

// ------------------------------------------------------------------
// Normalisierung
// ------------------------------------------------------------------

const formatAddress = (address: CampaiAddress | null | undefined) => {
  if (!address) return null;
  const line = address.addressLine?.trim();
  const city = [address.zip?.trim(), address.city?.trim()]
    .filter(Boolean)
    .join(" ");
  return [line, city].filter(Boolean).join(", ") || null;
};

const collectInfoBlocks = (fields: CampaiFormField[] | undefined) => {
  const blocks: WorkshopInfoBlock[] = [];
  for (const field of fields ?? []) {
    if (field.type === "row") blocks.push(...collectInfoBlocks(field.fields));
    if (field.type === "info" && (field.title || field.content)) {
      blocks.push({
        title: field.title?.trim() ?? "",
        // Campai liefert Markdown mit „\\\n“ als Zeilenumbruch.
        content: (field.content ?? "")
          .replace(/\\\\?\n/g, "\n")
          .replace(/^\/{6,}$/gm, "")
          .trim(),
      });
    }
  }
  return blocks;
};

const UNIT_LABEL: Record<string, [string, string]> = {
  hours: ["Stunde", "Stunden"],
  days: ["Tag", "Tagen"],
  weeks: ["Woche", "Wochen"],
};

const describeRefundPolicy = (policy: CampaiRefundPolicy) => {
  const value = policy.refundUntil?.value;
  const unit = policy.refundUntil?.unit ?? "";
  const percent =
    policy.priceModifier?.type === "%" &&
    typeof policy.priceModifier.value === "number"
      ? Math.round(policy.priceModifier.value / 100)
      : null;
  if (typeof value !== "number" || percent === null) return null;
  const [one, many] = UNIT_LABEL[unit] ?? [unit, unit];
  return `Bis ${value} ${value === 1 ? one : many} vor Beginn: ${percent} % zurück`;
};

const toDays = (span: { value?: number; unit?: string } | undefined) => {
  if (!span || typeof span.value !== "number") return null;
  if (span.unit === "hours") return Math.max(1, Math.round(span.value / 24));
  if (span.unit === "weeks") return span.value * 7;
  return span.value;
};

const isRateAvailableNow = (rate: CampaiRate, now: number) => {
  const from = rate.availableFrom ? Date.parse(rate.availableFrom) : null;
  const to = rate.availableTo ? Date.parse(rate.availableTo) : null;
  return (from === null || from <= now) && (to === null || to >= now);
};

export const normalizeCampaiEvent = (
  event: CampaiEvent,
  now = Date.now(),
): WorkshopEvent => {
  const info = event.info ?? {};
  const offer = event.offer ?? {};
  const stats = event.statistics ?? {};
  // Campai legt Name und ID der Kategorie direkt am Termin ab.
  const categories = (info.categories ?? []).flatMap((category) =>
    category?.bookingCategoryId && category.name?.trim()
      ? [{ id: category.bookingCategoryId, name: category.name.trim() }]
      : [],
  );
  const title = info.title?.trim() || "Workshop";
  const maxAttendees =
    typeof event.settings?.maxAttendees === "number" &&
    event.settings.maxAttendees > 0
      ? event.settings.maxAttendees
      : null;
  const taken =
    (stats.confirmed ?? 0) + (stats.pending ?? 0) + (stats.offered ?? 0);
  const free = maxAttendees === null ? null : Math.max(0, maxAttendees - taken);

  const start = event.period?.from ?? "";
  const availabilityFrom = offer.availability?.from ?? null;
  const availabilityTo = offer.availability?.to ?? start;
  const opensAt = availabilityFrom ? Date.parse(availabilityFrom) : null;
  const closesAt = availabilityTo ? Date.parse(availabilityTo) : null;
  const bookingOpen =
    offer.mode === "public" &&
    !event.cancelation &&
    event.period?.status !== "canceled" &&
    (opensAt === null || opensAt <= now) &&
    (closesAt === null || closesAt > now);

  const image = info.image;
  const imageUrl =
    image && typeof image === "object" && image.resource ? image.resource : null;

  const place = info.place;
  const placeName =
    place?.type === "resource" ? place.resource?.siteName?.trim() || null : null;
  const placeAddress =
    place?.type === "resource"
      ? formatAddress(place.resource?.siteAddress)
      : formatAddress(place?.address);

  const paymentMethods = (["sepaCreditTransfer", "cash", "online"] as const).filter(
    (method) => Boolean(offer.paymentMethods?.[method]),
  );
  const paymentNotes: WorkshopEvent["paymentNotes"] = {};
  for (const method of paymentMethods) {
    const note = offer.paymentMethods?.[method]?.note?.trim();
    if (note) paymentNotes[method] = note;
  }

  const addressMode = offer.formSettings?.addressMode;

  return {
    id: event._id,
    seriesId:
      event.series?.id && (event.series.total ?? 1) > 1 ? event.series.id : null,
    seriesTotal: event.series?.total ?? 1,
    title,
    description: info.description?.trim() ?? "",
    imageUrl,
    categories,
    start,
    end: event.period?.to ?? start,
    placeName,
    placeAddress,
    maxAttendees,
    minAttendees: event.settings?.minAttendees?.count ?? null,
    taken,
    free,
    seatsThreshold: offer.displaySettings?.seatsAvailableThreshold ?? 10,
    waitlistEnabled: offer.bookingRestriction === "bookIntoWaitlist",
    published: offer.mode === "public",
    dateOpen: offer.bookingRestriction === "requireConfirmation",
    bookingOpen,
    bookingOpensAt: opensAt !== null && opensAt > now ? availabilityFrom : null,
    attendeeMode: offer.attendeeMode === "single" ? "single" : "multiple",
    rates: (offer.rates ?? [])
      .filter((rate) => rate.id && isRateAvailableNow(rate, now))
      .map((rate) => ({
        id: rate.id as string,
        name: rate.name?.trim() || "Ticket",
        description: rate.description?.trim() ?? "",
        priceCents:
          typeof rate.charge?.price?.price === "number" &&
          rate.charge.price.price > 0
            ? rate.charge.price.price
            : null,
        memberOnly: Boolean(rate.member),
        standard: Boolean(rate.standard),
      })),
    paymentMethods,
    paymentNotes,
    paymentDueDays: toDays(offer.paymentDueDate?.payUntil),
    addressMode:
      addressMode === "required" || addressMode === "optional"
        ? addressMode
        : "none",
    requirePhone: Boolean(offer.formSettings?.requirePhone),
    infoBlocks: (offer.form?.groups ?? []).flatMap((group) =>
      collectInfoBlocks(group.fields),
    ),
    refundText: offer.refundText?.trim() ?? "",
    refundPolicies: (offer.refundPolicies ?? [])
      .map(describeRefundPolicy)
      .filter((line): line is string => Boolean(line)),
  };
};

// ------------------------------------------------------------------
// Lesen
// ------------------------------------------------------------------

const VISIBLE_OFFER_MODES = ["public", "protected"];

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 5;

const fetchUpcomingEvents = async (): Promise<WorkshopEvent[]> => {
  const now = Date.now();
  const fromDate = new Date(now).toISOString();
  const events: CampaiEvent[] = [];

  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const result = await campaiFetch<{ events?: CampaiEvent[]; count?: number }>(
      "/booking/events/list",
      {
        fromDate,
        canceled: false,
        // Geschützte Termine erscheinen als Vorschau (nicht buchbar).
        offerModes: VISIBLE_OFFER_MODES,
        sort: { "period.from": "asc" },
        limit: LIST_PAGE_SIZE,
        offset: page * LIST_PAGE_SIZE,
        returnCount: true,
      },
    );
    const batch = result?.events ?? [];
    events.push(...batch);
    if (batch.length < LIST_PAGE_SIZE) break;
    if (typeof result?.count === "number" && events.length >= result.count) break;
  }

  return events
    .map((event) => normalizeCampaiEvent(event, now))
    .filter((event) => event.start && Date.parse(event.start) > now)
    .sort(compareWorkshops);
};

/** Alle kommenden öffentlichen und geschützten Termine, eine Minute zwischengespeichert. */
export const listUpcomingWorkshops = unstable_cache(
  fetchUpcomingEvents,
  ["campai-events-upcoming-v2"],
  { revalidate: 60, tags: ["campai-events"] },
);

/** Ein Termin, frisch aus Campai — für Buchungsseite und Buchung selbst. */
export const getWorkshop = async (eventId: string) => {
  if (!/^[a-f0-9]{24}$/i.test(eventId)) return null;
  try {
    const event = await campaiFetch<CampaiEvent>(`/booking/events/${eventId}`);
    if (!event?._id || !VISIBLE_OFFER_MODES.includes(event.offer?.mode ?? "")) {
      return null;
    }
    return normalizeCampaiEvent(event);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 400) return null;
    throw error;
  }
};

// ------------------------------------------------------------------
// Buchen
// ------------------------------------------------------------------

export type WorkshopBookingInput = {
  rateId: string | null;
  seats: number;
  applicant: { name: string; email: string; phone: string };
  attendeeNames: string[];
  address: { addressLine: string; zip: string; city: string } | null;
  paymentMethod: WorkshopPaymentMethod | null;
  contactId: string | null;
  membershipNumber: string | null;
  isMember: boolean;
};

export class WorkshopBookingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "WorkshopBookingError";
  }
}

// Bei offenem Termin („Bestätigung erforderlich“) setzt Campai jede
// Anmeldung auf die Warteliste, egal wie viele Plätze frei sind.
const isWaitlisted = (event: WorkshopEvent, seats: number) =>
  event.dateOpen || (event.free !== null && event.free < seats);

export const buildCampaiBookingPayload = (
  event: WorkshopEvent,
  input: WorkshopBookingInput,
) => {
  if (!event.bookingOpen) {
    throw new WorkshopBookingError("Die Anmeldung für diesen Termin ist geschlossen.");
  }

  const seats = input.seats;
  if (!Number.isInteger(seats) || seats < 1 || seats > maxSeatsFor(event)) {
    throw new WorkshopBookingError("Bitte wähle eine gültige Anzahl an Plätzen.");
  }

  const waitlisted = isWaitlisted(event, seats);
  if (waitlisted && !event.dateOpen && !event.waitlistEnabled) {
    throw new WorkshopBookingError(
      event.free === 0
        ? "Der Termin ist ausgebucht."
        : `Es sind nur noch ${event.free} Plätze frei.`,
      409,
    );
  }

  const allowedRates = ratesFor(event, input.isMember);
  let rateId: string | undefined;
  if (allowedRates.length > 0) {
    const rate = allowedRates.find((entry) => entry.id === input.rateId);
    if (!rate) throw new WorkshopBookingError("Bitte wähle einen Tarif.");
    rateId = rate.id;
  }
  const rate = event.rates.find((entry) => entry.id === rateId) ?? null;
  const isPaid = Boolean(rate?.priceCents);

  const name = input.applicant.name.trim().slice(0, 81);
  const email = input.applicant.email.trim().slice(0, 100);
  const rawPhone = input.applicant.phone.trim();
  const phone = normalizePhone(rawPhone);
  if (!name) throw new WorkshopBookingError("Bitte gib deinen Namen an.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new WorkshopBookingError("Bitte gib eine gültige E-Mail-Adresse an.");
  }
  if (event.requirePhone && !rawPhone) {
    throw new WorkshopBookingError("Bitte gib eine Telefonnummer an.");
  }
  if (rawPhone && !phone) {
    throw new WorkshopBookingError(
      "Die Telefonnummer sieht nicht gültig aus — etwa 0351 1234567.",
    );
  }

  const address = input.address
    ? {
        country: "DE",
        addressLine: input.address.addressLine.trim(),
        zip: input.address.zip.trim(),
        city: input.address.city.trim(),
      }
    : null;
  const hasAddress = Boolean(
    address && (address.addressLine || address.zip || address.city),
  );
  if (
    event.addressMode === "required" &&
    !(address?.addressLine && address.zip && address.city)
  ) {
    throw new WorkshopBookingError("Bitte gib deine Adresse an.");
  }

  let paymentMethod: WorkshopPaymentMethod | null = null;
  // Auf der Warteliste wird noch nichts fällig — bezahlt wird erst, wenn
  // ein Platz angenommen ist; Campai fragt dann selbst nach.
  if (isPaid && !waitlisted) {
    // Online-Zahlung braucht einen Campai-Checkout (Payment Intent) — die
    // bieten wir hier nicht an. Bleibt nur sie, kommt die Rechnung per Mail.
    const offline: WorkshopPaymentMethod[] = event.paymentMethods.filter(
      (method) => method !== "online",
    );
    if (offline.length > 0) {
      if (!input.paymentMethod || !offline.includes(input.paymentMethod)) {
        throw new WorkshopBookingError("Bitte wähle, wie du bezahlen möchtest.");
      }
      paymentMethod = input.paymentMethod;
    }
  }

  const attendeeNames =
    event.attendeeMode === "single"
      ? [name]
      : Array.from({ length: seats }, (_, index) =>
          // Der erste Platz ist ohne eigenen Namen die buchende Person.
          (input.attendeeNames[index]?.trim() || (index === 0 ? name : ""))
            .trim()
            .slice(0, 81),
        );
  if (attendeeNames.some((entry) => !entry)) {
    throw new WorkshopBookingError("Bitte trag für jeden Platz einen Namen ein.");
  }

  const contactId = input.contactId?.trim() || undefined;

  return {
    buyer: {
      type: "person" as const,
      name,
      personName: name,
      email,
      ...(phone ? { phone } : {}),
      ...(hasAddress ? { address } : {}),
      ...(paymentMethod
        ? {
            payment: {
              paymentMethod,
              sepaDirectDebit: null,
              online: null,
            },
          }
        : {}),
      ...(contactId ? { contactId } : {}),
    },
    attendees: attendeeNames.map((attendeeName, index) => ({
      type: "person" as const,
      name: attendeeName,
      ...(rateId ? { rateId } : {}),
      // Die eigene Mitgliedschaft hängt am ersten Platz — sie entscheidet
      // in Campai, ob ein Mitgliedertarif greift.
      ...(index === 0 && contactId ? { contactId } : {}),
      ...(index === 0 && input.membershipNumber
        ? { membershipNumber: input.membershipNumber }
        : {}),
    })),
    notifyBuyer: true,
  };
};

export const createWorkshopBooking = async (
  event: WorkshopEvent,
  input: WorkshopBookingInput,
) => {
  const payload = buildCampaiBookingPayload(event, input);
  const waitlisted = isWaitlisted(event, input.seats);

  // Zum Ausprobieren ohne echte Buchung in Campai.
  if (process.env.CAMPAI_EVENT_BOOKING_DRY_RUN === "1") {
    console.info("[workshops] dry run booking", JSON.stringify(payload));
    return { bookingId: "dry-run", waitlisted };
  }

  try {
    const result = await campaiFetch<{ _id?: string }>(
      `/booking/events/${event.id}/bookings`,
      payload,
    );
    return { bookingId: result?._id ?? null, waitlisted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/booking\.insert|attendee\.insert|permission/i.test(message)) {
      throw new WorkshopBookingError(
        "Die Buchung ist gerade technisch nicht möglich. Bitte schreib uns kurz.",
        502,
      );
    }
    throw new WorkshopBookingError(
      message || "Campai hat die Buchung nicht angenommen.",
      502,
    );
  }
};
