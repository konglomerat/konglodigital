import {
  getEffectiveVolkshausPrice,
  type VolkshausBooking,
  type VolkshausInvoiceDetails,
  type VolkshausPriceLine,
  type VolkshausPriceSnapshot,
} from "./volkshaus-booking";

export const getVolkshausInvoiceDetails = (
  booking: VolkshausBooking,
): VolkshausInvoiceDetails => ({
  recipient: booking.organization || booking.customerName,
  title: `Raumnutzung Neues Volkshaus Cotta · ${booking.eventTitle}`,
  intro: "Vielen Dank für die Nutzung der Räume im Neuen Volkshaus Cotta.",
  serviceDate: booking.bookingDate,
  ...booking.priceSnapshot.admin?.invoice,
});

export type EditablePriceLine = {
  description: string;
  quantity: string;
  unitEuro: string;
};
export const editablePriceLines = (
  booking: VolkshausBooking,
): EditablePriceLine[] =>
  getEffectiveVolkshausPrice(booking).lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unitEuro: (line.unitNetCents / 100).toFixed(2),
  }));

export function euroToCents(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^-?\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())
  ) {
    throw new Error(
      "Bitte einen gültigen Eurobetrag mit höchstens zwei Nachkommastellen eingeben.",
    );
  }
  return Math.round(Number(value.trim().replace(",", ".")) * 100);
}

export function priceFromEditableLines(
  raw: unknown,
  base: VolkshausPriceSnapshot,
): VolkshausPriceSnapshot {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) {
    throw new Error("Bitte 1 bis 50 Preispositionen angeben.");
  }
  const lines: VolkshausPriceLine[] = raw.map((line, index) => {
    const description =
      typeof line?.description === "string" ? line.description.trim() : "";
    const quantity = Number(line?.quantity);
    const unitNetCents = euroToCents(line?.unitEuro);
    if (
      !description ||
      description.length > 500 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000 ||
      Math.abs(unitNetCents) > 1_000_000
    ) {
      throw new Error(
        "Jede Position braucht eine Bezeichnung, eine ganze Menge von 1 bis 1000 und einen Einzelpreis bis 10.000 €.",
      );
    }
    return {
      code: `manual-${index}`,
      description,
      quantity,
      unitNetCents,
      totalNetCents: quantity * unitNetCents,
      taxRate: 19,
    };
  });
  const netCents = lines.reduce((sum, line) => sum + line.totalNetCents, 0);
  if (netCents < 0 || netCents > 10_000_000)
    throw new Error(
      "Der Gesamtpreis muss zwischen 0 und 100.000 € netto liegen.",
    );
  const taxCents = Math.round(netCents * 0.19);
  return {
    tariffVersion: base.tariffVersion,
    currency: "EUR",
    lines,
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
    requiresManualReview: false,
    reviewReasons: [],
  };
}

export function linesForGrossTotal(
  value: string,
  lines: EditablePriceLine[],
): EditablePriceLine[] {
  const gross = euroToCents(value);
  if (gross < 0) throw new Error("Der Endpreis darf nicht negativ sein.");
  const net = Math.round(gross / 1.19);
  if (net + Math.round(net * 0.19) !== gross) {
    throw new Error(
      "Dieser Bruttobetrag ist mit 19 % USt. nicht centgenau darstellbar. Bitte den Betrag um einen Cent ändern.",
    );
  }
  const base = priceFromEditableLines(lines, {
    tariffVersion: "",
    currency: "EUR",
    lines: [],
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
    requiresManualReview: false,
    reviewReasons: [],
  });
  const delta = net - base.netCents;
  return delta === 0
    ? lines
    : [
        ...lines,
        {
          description:
            delta < 0 ? "Vereinbarter Nachlass" : "Vereinbarter Zuschlag",
          quantity: "1",
          unitEuro: (delta / 100).toFixed(2),
        },
      ];
}

export const EDITABLE_BOOKING_FIELDS = [
  "eventTitle",
  "eventDescription",
  "bookingDate",
  "startTime",
  "endTime",
  "setupStartTime",
  "teardownEndTime",
  "requestedRooms",
  "expectedAttendees",
  "usageType",
  "frequency",
  "recurringOccurrences",
  "equipment",
  "customerName",
  "organization",
  "email",
  "phone",
  "billingAddressLine",
  "billingZip",
  "billingCity",
  "specialRequirements",
] as const;

export const BOOKING_FIELD_LABELS: Record<
  (typeof EDITABLE_BOOKING_FIELDS)[number],
  string
> = {
  eventTitle: "Veranstaltung",
  eventDescription: "Nutzung",
  bookingDate: "Datum",
  startTime: "Beginn",
  endTime: "Ende",
  setupStartTime: "Aufbau ab",
  teardownEndTime: "Rückgabe bis",
  requestedRooms: "Räume",
  expectedAttendees: "Personenzahl",
  usageType: "Tarifgruppe",
  frequency: "Häufigkeit",
  recurringOccurrences: "Termine pro Monat",
  equipment: "Technik",
  customerName: "Kontaktperson",
  organization: "Organisation",
  email: "E-Mail",
  phone: "Telefon",
  billingAddressLine: "Rechnungsanschrift",
  billingZip: "PLZ",
  billingCity: "Ort",
  specialRequirements: "Nutzungsabsprachen",
};

export const bookingEditValues = (booking: VolkshausBooking) =>
  Object.fromEntries(
    EDITABLE_BOOKING_FIELDS.map((key) => [
      key,
      key.toLowerCase().endsWith("time")
        ? (booking[key]?.toString().slice(0, 5) ?? "")
        : (booking[key] ?? ""),
    ]),
  );
