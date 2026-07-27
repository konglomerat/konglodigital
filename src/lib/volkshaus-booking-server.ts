import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  BOOKING_FREQUENCIES,
  EQUIPMENT_IDS,
  ROOM_IDS,
  USAGE_TYPES,
  VOLKSHAUS_EQUIPMENT,
  calculateDurationMinutes,
  calculateVolkshausPrice,
  type VolkshausBookingRequestInput,
  type VolkshausEquipmentId,
  type VolkshausRoomId,
} from "@/lib/volkshaus-booking";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class VolkshausValidationError extends Error {
  readonly details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = "VolkshausValidationError";
    this.details = details;
  }
}

const stringValue = (
  value: unknown,
  options: { max: number; required?: boolean },
) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (options.required && !normalized) {
    return null;
  }
  return normalized.slice(0, options.max);
};

const isValidDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

const isValidTime = (value: string) => {
  if (!TIME_PATTERN.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return (
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) - date.getTime()
  );
};

export const berlinDateTimeToIso = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let candidate = new Date(naiveUtc);
  const firstOffset = getTimeZoneOffsetMs(candidate, "Europe/Berlin");
  candidate = new Date(naiveUtc - firstOffset);
  const correctedOffset = getTimeZoneOffsetMs(candidate, "Europe/Berlin");
  return new Date(naiveUtc - correctedOffset).toISOString();
};

export const createVolkshausReferenceCode = () => {
  const year = new Date().getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `VHC-${year}-${suffix}`;
};

export const createVolkshausAccessToken = () =>
  randomBytes(32).toString("base64url");

export const hashVolkshausValue = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const sortForStableJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortForStableJson(nested)]),
    );
  }
  return value;
};

export const stableVolkshausJson = (value: unknown) =>
  JSON.stringify(sortForStableJson(value));

export const hashVolkshausAuditValue = (value: string) => {
  const salt =
    process.env.VOLKSHAUS_AUDIT_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    "konglodigital-volkshaus";
  return hashVolkshausValue(`${salt}:${value}`);
};

export const parseVolkshausBookingRequest = (
  body: Record<string, unknown>,
): VolkshausBookingRequestInput => {
  const details: Record<string, string> = {};

  const customerName = stringValue(body.customerName, {
    max: 160,
    required: true,
  });
  const organization = stringValue(body.organization, { max: 180 });
  const email = stringValue(body.email, { max: 254, required: true })?.toLowerCase();
  const phone = stringValue(body.phone, { max: 80 });
  const billingAddressLine = stringValue(body.billingAddressLine, {
    max: 220,
    required: true,
  });
  const billingZip = stringValue(body.billingZip, {
    max: 16,
    required: true,
  });
  const billingCity = stringValue(body.billingCity, {
    max: 120,
    required: true,
  });
  const eventTitle = stringValue(body.eventTitle, {
    max: 180,
    required: true,
  });
  const eventDescription = stringValue(body.eventDescription, {
    max: 4_000,
    required: true,
  });
  const specialRequirements = stringValue(body.specialRequirements, {
    max: 4_000,
  });
  const website = stringValue(body.website, { max: 200 });

  if (!customerName) details.customerName = "Bitte einen Namen angeben.";
  if (!email || !EMAIL_PATTERN.test(email)) {
    details.email = "Bitte eine gültige E-Mail-Adresse angeben.";
  }
  if (!billingAddressLine) {
    details.billingAddressLine = "Bitte Straße und Hausnummer angeben.";
  }
  if (!billingZip) details.billingZip = "Bitte eine Postleitzahl angeben.";
  if (!billingCity) details.billingCity = "Bitte einen Ort angeben.";
  if (!eventTitle) details.eventTitle = "Bitte einen Veranstaltungstitel angeben.";
  if (!eventDescription) {
    details.eventDescription = "Bitte die geplante Nutzung kurz beschreiben.";
  }

  const bookingDate =
    typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
  const startTime =
    typeof body.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
  const setupStartTime =
    typeof body.setupStartTime === "string" && body.setupStartTime.trim()
      ? body.setupStartTime.trim()
      : null;
  const teardownEndTime =
    typeof body.teardownEndTime === "string" && body.teardownEndTime.trim()
      ? body.teardownEndTime.trim()
      : null;

  if (!isValidDate(bookingDate)) {
    details.bookingDate = "Bitte ein gültiges Datum wählen.";
  } else {
    const requested = new Date(`${bookingDate}T23:59:59Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (requested < today) {
      details.bookingDate = "Das Datum darf nicht in der Vergangenheit liegen.";
    }
  }
  if (!isValidTime(startTime)) details.startTime = "Ungültige Startzeit.";
  if (!isValidTime(endTime)) details.endTime = "Ungültige Endzeit.";
  if (
    isValidTime(startTime) &&
    isValidTime(endTime) &&
    calculateDurationMinutes(startTime, endTime) < 60
  ) {
    details.endTime = "Die Nutzung muss mindestens eine Stunde dauern.";
  }
  if (setupStartTime && !isValidTime(setupStartTime)) {
    details.setupStartTime = "Ungültige Aufbauzeit.";
  }
  if (teardownEndTime && !isValidTime(teardownEndTime)) {
    details.teardownEndTime = "Ungültige Rückgabezeit.";
  }
  if (
    setupStartTime &&
    isValidTime(setupStartTime) &&
    isValidTime(startTime) &&
    calculateDurationMinutes(setupStartTime, startTime) === 0 &&
    setupStartTime !== startTime
  ) {
    details.setupStartTime = "Der Aufbau muss vor dem Veranstaltungsbeginn liegen.";
  }
  if (
    teardownEndTime &&
    isValidTime(teardownEndTime) &&
    isValidTime(endTime) &&
    calculateDurationMinutes(endTime, teardownEndTime) === 0 &&
    teardownEndTime !== endTime
  ) {
    details.teardownEndTime =
      "Die Rückgabe muss nach dem Veranstaltungsende liegen.";
  }

  const usageType = USAGE_TYPES.includes(
    body.usageType as (typeof USAGE_TYPES)[number],
  )
    ? (body.usageType as (typeof USAGE_TYPES)[number])
    : null;
  const frequency = BOOKING_FREQUENCIES.includes(
    body.frequency as (typeof BOOKING_FREQUENCIES)[number],
  )
    ? (body.frequency as (typeof BOOKING_FREQUENCIES)[number])
    : null;

  if (!usageType) details.usageType = "Bitte eine Tarifgruppe wählen.";
  if (!frequency) details.frequency = "Bitte die Nutzungshäufigkeit wählen.";

  const requestedRooms = Array.isArray(body.requestedRooms)
    ? Array.from(
        new Set(
          body.requestedRooms.filter((value): value is VolkshausRoomId =>
            ROOM_IDS.includes(value as VolkshausRoomId),
          ),
        ),
      )
    : [];
  if (requestedRooms.length === 0) {
    details.requestedRooms = "Bitte mindestens einen Raum wählen.";
  }

  const expectedAttendees = Math.trunc(Number(body.expectedAttendees));
  if (
    !Number.isFinite(expectedAttendees) ||
    expectedAttendees < 1 ||
    expectedAttendees > 500
  ) {
    details.expectedAttendees = "Bitte eine realistische Personenzahl angeben.";
  }

  const recurringOccurrences = Math.trunc(
    Number(body.recurringOccurrences ?? 1),
  );
  if (
    !Number.isFinite(recurringOccurrences) ||
    recurringOccurrences < 1 ||
    recurringOccurrences > 4
  ) {
    details.recurringOccurrences =
      "Regelmäßige Angebote können ein- bis viermal pro Monat angefragt werden.";
  }

  const rawEquipment =
    body.equipment && typeof body.equipment === "object"
      ? (body.equipment as Record<string, unknown>)
      : {};
  const equipment: Partial<Record<VolkshausEquipmentId, number>> = {};

  for (const equipmentId of EQUIPMENT_IDS) {
    const definition = VOLKSHAUS_EQUIPMENT.find(
      (item) => item.id === equipmentId,
    );
    const quantity = Math.trunc(Number(rawEquipment[equipmentId] ?? 0));
    if (
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      quantity > (definition?.maxQuantity ?? 0)
    ) {
      details[`equipment.${equipmentId}`] = "Ungültige Anzahl.";
      continue;
    }
    if (quantity > 0) {
      equipment[equipmentId] = quantity;
    }
  }

  const acceptedPrivacy = body.acceptedPrivacy === true;
  const acceptedHouseRules = body.acceptedHouseRules === true;
  if (!acceptedPrivacy) {
    details.acceptedPrivacy = "Die Datenschutzhinweise müssen bestätigt werden.";
  }
  if (!acceptedHouseRules) {
    details.acceptedHouseRules =
      "Leitbild sowie Haus- und Raumordnung müssen bestätigt werden.";
  }

  if (Object.keys(details).length > 0) {
    throw new VolkshausValidationError(
      "Bitte prüfe die markierten Angaben.",
      details,
    );
  }

  const normalized: VolkshausBookingRequestInput = {
    customerName: customerName!,
    organization: organization || null,
    email: email!,
    phone: phone || null,
    billingAddressLine: billingAddressLine!,
    billingZip: billingZip!,
    billingCity: billingCity!,
    eventTitle: eventTitle!,
    eventDescription: eventDescription!,
    usageType: usageType!,
    frequency: frequency!,
    recurringOccurrences:
      frequency === "recurring" ? recurringOccurrences : 1,
    expectedAttendees,
    bookingDate,
    startTime,
    endTime,
    setupStartTime,
    teardownEndTime,
    requestedRooms,
    equipment,
    specialRequirements: specialRequirements || null,
    acceptedPrivacy,
    acceptedHouseRules,
    website: website || "",
  };

  calculateVolkshausPrice(normalized);
  return normalized;
};
