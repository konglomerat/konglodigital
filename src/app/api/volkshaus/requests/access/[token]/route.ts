import { NextResponse, type NextRequest } from "next/server";

import {
  STATUS_LABELS,
  getEffectiveVolkshausPrice,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";
import {
  hashVolkshausAuditValue,
  hashVolkshausValue,
  stableVolkshausJson,
} from "@/lib/volkshaus-booking-server";
import {
  addVolkshausBookingEvent,
  getVolkshausBookingByToken,
  updateVolkshausBooking,
} from "@/lib/volkshaus-booking-store";
import { createVolkshausInvoice } from "@/lib/volkshaus-invoice";
import { syncVolkshausBookingToTeamup } from "@/lib/volkshaus-teamup";
import {
  notifyVolkshausContractCompleted,
  notifyVolkshausCustomerSigned,
} from "@/lib/volkshaus-notifications";

const toCustomerView = (booking: VolkshausBooking) => ({
  id: booking.id,
  referenceCode: booking.referenceCode,
  requestStatus: booking.requestStatus,
  requestStatusLabel: STATUS_LABELS.request[booking.requestStatus],
  reservationStatus: booking.reservationStatus,
  reservationStatusLabel:
    STATUS_LABELS.reservation[booking.reservationStatus],
  contractStatus: booking.contractStatus,
  contractStatusLabel: STATUS_LABELS.contract[booking.contractStatus],
  invoiceStatus: booking.invoiceStatus,
  invoiceStatusLabel: STATUS_LABELS.invoice[booking.invoiceStatus],
  paymentStatus: booking.paymentStatus,
  paymentStatusLabel: STATUS_LABELS.payment[booking.paymentStatus],
  customerName: booking.customerName,
  organization: booking.organization,
  email: booking.email,
  eventTitle: booking.eventTitle,
  eventDescription: booking.eventDescription,
  usageType: booking.usageType,
  frequency: booking.frequency,
  recurringOccurrences: booking.recurringOccurrences,
  expectedAttendees: booking.expectedAttendees,
  bookingDate: booking.bookingDate,
  startTime: booking.startTime,
  endTime: booking.endTime,
  setupStartTime: booking.setupStartTime,
  teardownEndTime: booking.teardownEndTime,
  requestedRooms: booking.requestedRooms,
  equipment: booking.equipment,
  specialRequirements: booking.specialRequirements,
  price: getEffectiveVolkshausPrice(booking),
  contractSnapshot: booking.contractSnapshot,
  contractHash: booking.contractHash,
  customerSignature: booking.customerSignature,
  staffSignature: booking.staffSignature,
  holdExpiresAt: booking.holdExpiresAt,
  campaiInvoiceId: booking.campaiInvoiceId,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
});

const resolvePublicOrigin = (request: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
};

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const booking = await getVolkshausBookingByToken(token);
  if (!booking) {
    return NextResponse.json(
      { error: "Dieser Zugangslink ist ungültig oder abgelaufen." },
      { status: 404 },
    );
  }

  return NextResponse.json({ booking: toCustomerView(booking) });
};

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const booking = await getVolkshausBookingByToken(token);
  if (!booking) {
    return NextResponse.json(
      { error: "Dieser Zugangslink ist ungültig oder abgelaufen." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (body.action !== "sign_contract") {
    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  }

  if (booking.contractStatus !== "sent") {
    return NextResponse.json(
      {
        error:
          booking.contractStatus === "customer_signed" ||
          booking.contractStatus === "fully_signed"
            ? "Der Vertrag wurde bereits unterschrieben."
            : "Der Vertrag ist noch nicht zur Unterschrift freigegeben.",
      },
      { status: 409 },
    );
  }

  if (!booking.contractSnapshot || !booking.contractHash) {
    return NextResponse.json(
      { error: "Die Vertragsdaten sind unvollständig." },
      { status: 409 },
    );
  }

  if (
    booking.reservationStatus !== "held" ||
    (booking.holdExpiresAt &&
      new Date(booking.holdExpiresAt).getTime() <= Date.now())
  ) {
    return NextResponse.json(
      {
        error:
          "Die vorläufige Reservierung ist abgelaufen. Bitte wende dich an das Volkshaus-Team, damit der Termin erneut geprüft wird.",
      },
      { status: 409 },
    );
  }

  const currentHash = hashVolkshausValue(
    stableVolkshausJson(booking.contractSnapshot),
  );
  if (currentHash !== booking.contractHash) {
    return NextResponse.json(
      {
        error:
          "Die Vertragsversion konnte nicht verifiziert werden. Bitte wende dich an das Volkshaus-Team.",
      },
      { status: 409 },
    );
  }

  const signerName =
    typeof body.signerName === "string" ? body.signerName.trim().slice(0, 160) : "";
  if (signerName.length < 2 || body.accepted !== true) {
    return NextResponse.json(
      {
        error:
          "Bitte den vollständigen Namen eingeben und die verbindliche Unterschrift bestätigen.",
      },
      { status: 400 },
    );
  }

  const signedAt = new Date().toISOString();
  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const signature = {
    name: signerName,
    signedAt,
    contractHash: booking.contractHash,
    ipHash: hashVolkshausAuditValue(clientAddress),
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  };

  let updated = await updateVolkshausBooking(booking.id, {
    contractStatus: "fully_signed",
    reservationStatus: "confirmed",
    holdExpiresAt: null,
    customerSignature: signature,
    customerSignedAt: signedAt,
  });
  await addVolkshausBookingEvent({
    bookingId: booking.id,
    actorType: "customer",
    eventType: "contract_customer_signed",
    payload: { contractHash: booking.contractHash },
  });

  try {
    const teamupResult = await syncVolkshausBookingToTeamup(
      updated,
      "confirmed",
    );
    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "system",
      eventType: "teamup_synced",
      payload: {
        action: teamupResult.action,
        eventId: teamupResult.eventId,
        reservationStatus: "confirmed",
      },
    });
  } catch (error) {
    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "system",
      eventType: "teamup_sync_failed",
      payload: {
        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler bei der Teamup-Synchronisierung.",
        reservationStatus: "confirmed",
      },
    }).catch(() => undefined);
  }

  const invoiceResult = await createVolkshausInvoice(updated);
  updated = invoiceResult.booking;

  const adminUrl = `${resolvePublicOrigin(request)}/admin/volkshaus`;
  await notifyVolkshausCustomerSigned({
    booking: updated,
    adminUrl,
  }).catch(() => undefined);
  await notifyVolkshausContractCompleted({
    booking: updated,
    accessUrl: `${resolvePublicOrigin(request)}/volkshaus/anfrage/${token}`,
  }).catch(() => undefined);

  return NextResponse.json({ booking: toCustomerView(updated) });
};
