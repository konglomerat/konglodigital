import "server-only";
import {
  berlinDateTimeToIso,
  parseVolkshausBookingRequest,
} from "./volkshaus-booking-server";
import {
  calculateVolkshausPrice,
  formatEuro,
  getEffectiveVolkshausPrice,
  getRoomLabel,
  VOLKSHAUS_EQUIPMENT,
  type VolkshausBooking,
  type VolkshausAdminChange,
  type VolkshausInvoiceDetails,
} from "./volkshaus-booking";
import {
  BOOKING_FIELD_LABELS,
  EDITABLE_BOOKING_FIELDS,
  bookingEditValues,
  getVolkshausInvoiceDetails,
  priceFromEditableLines,
} from "./volkshaus-admin-edit";
import type { VolkshausBookingPatch } from "./volkshaus-booking-store";

const display = (key: string, value: unknown): string => {
  if (key === "requestedRooms" && Array.isArray(value))
    return value.map(getRoomLabel).join(", ");
  if (key === "equipment" && value && typeof value === "object")
    return (
      VOLKSHAUS_EQUIPMENT.flatMap((item) => {
        const count = (value as Record<string, number>)[item.id];
        return count ? [`${count} × ${item.label}`] : [];
      }).join(", ") || "Keine"
    );
  if (value === "commercial") return "Privat / gewerblich";
  if (value === "neighborhood") return "Nachbarschaftlich";
  if (value === "one_time") return "Einmalig";
  if (value === "recurring") return "Regelmäßig";
  return String(value ?? "").trim() || "–";
};

export function prepareVolkshausAdminEdit(
  booking: VolkshausBooking,
  body: Record<string, unknown>,
  actor: string,
) {
  if (!body.booking || typeof body.booking !== "object")
    throw new Error("Buchungsdaten fehlen.");
  const parsed = parseVolkshausBookingRequest(
    body.booking as Record<string, unknown>,
    { admin: true },
  );
  const patch: VolkshausBookingPatch = Object.fromEntries(
    EDITABLE_BOOKING_FIELDS.map((key) => [key, parsed[key]]),
  );
  const before = bookingEditValues(booking);
  const changes: VolkshausAdminChange["changes"] =
    EDITABLE_BOOKING_FIELDS.flatMap((key) =>
      display(key, before[key]) === display(key, parsed[key])
        ? []
        : [
            {
              label: BOOKING_FIELD_LABELS[key],
              before: display(key, before[key]),
              after: display(key, parsed[key]),
            },
          ],
    );
  const scheduleChanged = [
    "bookingDate",
    "startTime",
    "endTime",
    "setupStartTime",
    "teardownEndTime",
    "requestedRooms",
  ].some(
    (key) =>
      display(key, before[key]) !==
      display(key, patch[key as keyof VolkshausBookingPatch]),
  );
  patch.startAt = berlinDateTimeToIso(parsed.bookingDate, parsed.startTime);
  patch.endAt = berlinDateTimeToIso(parsed.bookingDate, parsed.endTime);
  patch.setupStartAt = parsed.setupStartTime
    ? berlinDateTimeToIso(parsed.bookingDate, parsed.setupStartTime)
    : null;
  patch.teardownEndAt = parsed.teardownEndTime
    ? berlinDateTimeToIso(parsed.bookingDate, parsed.teardownEndTime)
    : null;
  const oldPrice = getEffectiveVolkshausPrice(booking);
  const price =
    body.recalculate === true
      ? calculateVolkshausPrice(parsed)
      : priceFromEditableLines(body.lines, oldPrice);
  const publicLines = (lines: typeof price.lines) =>
    lines.map(({ description, quantity, unitNetCents }) => ({
      description,
      quantity,
      unitNetCents,
    }));
  if (
    JSON.stringify(publicLines(price.lines)) !==
    JSON.stringify(publicLines(oldPrice.lines))
  ) {
    changes.push({
      label: "Preispositionen",
      before: oldPrice.lines
        .map(
          (l) =>
            `${l.quantity} × ${l.description}: ${formatEuro(l.totalNetCents)} netto`,
        )
        .join("; "),
      after: price.lines
        .map(
          (l) =>
            `${l.quantity} × ${l.description}: ${formatEuro(l.totalNetCents)} netto`,
        )
        .join("; "),
    });
  }
  if (price.grossCents !== oldPrice.grossCents)
    changes.push({
      label: "Gesamtpreis brutto",
      before: formatEuro(oldPrice.grossCents),
      after: formatEuro(price.grossCents),
    });
  const rawInvoice = body.invoice as Record<string, unknown> | undefined;
  const invoice = {} as VolkshausInvoiceDetails;
  const previousInvoice = getVolkshausInvoiceDetails(booking);
  for (const [key, label, max] of [
    ["recipient", "Rechnungsempfänger", 180],
    ["title", "Rechnungstext", 500],
    ["intro", "Einleitung Rechnung", 2000],
    ["serviceDate", "Leistungsdatum", 10],
  ] as const) {
    const value =
      typeof rawInvoice?.[key] === "string" ? rawInvoice[key].trim() : "";
    if ((!value && key !== "intro") || value.length > max)
      throw new Error(`${label} fehlt oder ist zu lang.`);
    invoice[key] = value;
    if (value !== previousInvoice[key])
      changes.push({ label, before: previousInvoice[key], after: value });
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(invoice.serviceDate) ||
    new Date(`${invoice.serviceDate}T12:00:00Z`).toISOString().slice(0, 10) !==
      invoice.serviceDate
  )
    throw new Error("Ungültiges Leistungsdatum.");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 1000)
    throw new Error(
      "Bitte eine kurze interne Änderungsnotiz angeben (max. 1000 Zeichen).",
    );
  if (!changes.length)
    throw new Error("Es gibt keine Änderungen zu speichern.");
  const invoiceOnlyLabels = [
    "Rechnungsempfänger",
    "Rechnungstext",
    "Einleitung Rechnung",
    "Leistungsdatum",
  ];
  const needsRevision =
    Boolean(booking.contractSnapshot) &&
    changes.some((change) => !invoiceOnlyLabels.includes(change.label));
  if (needsRevision && body.confirmRevision !== true)
    throw new Error("Bitte die neue Vertragsversion bestätigen.");
  if (booking.invoiceStatus === "creating")
    throw new Error(
      "Die Rechnung wird gerade angelegt. Bitte kurz warten und neu laden.",
    );
  const now = new Date().toISOString();
  const admin = { ...booking.priceSnapshot.admin };
  admin.originalPrice ??= oldPrice;
  admin.invoice = invoice;
  admin.changes = [
    ...(admin.changes ?? []),
    { at: now, by: actor, reason, changes },
  ];
  if (needsRevision) {
    admin.archivedContracts = [
      ...(admin.archivedContracts ?? []),
      {
        version: booking.contractVersion,
        archivedAt: now,
        snapshot: booking.contractSnapshot!,
        hash: booking.contractHash,
        customerSignature: booking.customerSignature,
        staffSignature: booking.staffSignature,
      },
    ];
    Object.assign(patch, {
      contractStatus: "draft",
      contractSnapshot: null,
      contractHash: null,
      customerSignature: null,
      customerSignedAt: null,
      staffSignature: null,
      staffSignedAt: null,
      staffSignedBy: null,
      notificationStatus: null,
      notificationError: null,
    });
  }
  const invoiceRelevantLabels = [
    "Kontaktperson",
    "Organisation",
    "E-Mail",
    "Rechnungsanschrift",
    "PLZ",
    "Ort",
    "Preispositionen",
    "Gesamtpreis brutto",
    ...invoiceOnlyLabels,
  ];
  if (
    booking.campaiInvoiceId &&
    changes.some((change) => invoiceRelevantLabels.includes(change.label))
  )
    admin.invoiceCorrection = {
      required: true,
      invoiceId: booking.campaiInvoiceId,
      note: "Buchung geändert. Bestehende Rechnung in Campai prüfen und korrigieren.",
    };
  patch.priceSnapshot = { ...price, admin };
  patch.priceAdjustmentCents = 0;
  patch.priceAdjustmentReason = null;
  // A changed recipient must not silently reuse the previous debtor account.
  if (
    invoice.recipient !== previousInvoice.recipient ||
    parsed.email !== booking.email
  )
    patch.campaiDebtorAccount = null;
  return { patch, changes, scheduleChanged, needsRevision };
}
