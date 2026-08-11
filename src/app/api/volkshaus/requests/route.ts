import { NextResponse, type NextRequest } from "next/server";

import {
  calculateVolkshausPrice,
  findBusySlotConflicts,
  type BusySlot,
} from "@/lib/volkshaus-booking";
import {
  berlinDateTimeToIso,
  createVolkshausAccessToken,
  createVolkshausReferenceCode,
  parseVolkshausBookingRequest,
  VolkshausValidationError,
} from "@/lib/volkshaus-booking-server";
import {
  addVolkshausBookingEvent,
  createVolkshausBooking,
  listVolkshausBookings,
  updateVolkshausBooking,
} from "@/lib/volkshaus-booking-store";
import { notifyVolkshausRequestSubmitted } from "@/lib/volkshaus-notifications";
import {
  getInactiveVolkshausTeamupRemoteIds,
  getTeamupBusySlots,
} from "@/lib/volkshaus-teamup";

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 5;

declare global {
  var __volkshausRequestRateLimits:
    | Map<string, { count: number; expiresAt: number }>
    | undefined;
}

const rateLimits =
  globalThis.__volkshausRequestRateLimits ??
  new Map<string, { count: number; expiresAt: number }>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__volkshausRequestRateLimits = rateLimits;
}

const getClientAddress = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip")?.trim() ||
  "unknown";

const isRateLimited = (key: string) => {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.expiresAt <= now) {
    rateLimits.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  rateLimits.set(key, current);
  return current.count > MAX_REQUESTS_PER_WINDOW;
};

const resolvePublicOrigin = (request: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
};

const getStoredBusySlots = (
  bookings: Awaited<ReturnType<typeof listVolkshausBookings>>,
  date: string,
): BusySlot[] => {
  const now = Date.now();
  return bookings
    .filter(
      (booking) =>
        booking.bookingDate === date &&
        (booking.reservationStatus === "confirmed" ||
          (booking.reservationStatus === "held" &&
            (!booking.holdExpiresAt ||
              new Date(booking.holdExpiresAt).getTime() > now))),
    )
    .flatMap((booking) =>
      booking.requestedRooms.map((roomId) => ({
        id: `booking-${booking.id}-${roomId}`,
        date,
        roomId,
        startTime: booking.setupStartTime ?? booking.startTime,
        endTime: booking.teardownEndTime ?? booking.endTime,
        source: "booking" as const,
      })),
    );
};

export const POST = async (request: NextRequest) => {
  const clientAddress = getClientAddress(request);
  if (isRateLimited(clientAddress)) {
    return NextResponse.json(
      {
        error:
          "Zu viele Anfragen in kurzer Zeit. Bitte versuche es in einigen Minuten erneut.",
      },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const input = parseVolkshausBookingRequest(body);

    if (input.website) {
      return NextResponse.json({
        referenceCode: createVolkshausReferenceCode(),
        accessUrl: `${resolvePublicOrigin(request)}/volkshaus/buchen`,
        notificationSent: true,
      });
    }

    const requestedStart = input.setupStartTime ?? input.startTime;
    const requestedEnd = input.teardownEndTime ?? input.endTime;
    const bookings = await listVolkshausBookings();
    const now = Date.now();
    const teamupSlots = await getTeamupBusySlots(input.bookingDate, {
      excludeRemoteIds: getInactiveVolkshausTeamupRemoteIds(
        bookings,
        input.bookingDate,
        now,
      ),
    });
    const storedSlots = getStoredBusySlots(bookings, input.bookingDate);
    const busySlots = [...teamupSlots, ...storedSlots];
    const conflicts = findBusySlotConflicts({
      slots: busySlots,
      requestedRooms: input.requestedRooms,
      startTime: requestedStart,
      endTime: requestedEnd,
    });

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error:
            "Der gewählte Zeitraum überschneidet sich mit einer vorhandenen Belegung. Bitte wähle einen anderen Termin.",
          conflicts,
        },
        { status: 409 },
      );
    }

    const accessToken = createVolkshausAccessToken();
    const priceSnapshot = calculateVolkshausPrice(input);
    const booking = await createVolkshausBooking({
      referenceCode: createVolkshausReferenceCode(),
      accessToken,
      customerName: input.customerName,
      organization: input.organization ?? null,
      email: input.email,
      phone: input.phone ?? null,
      billingAddressLine: input.billingAddressLine,
      billingZip: input.billingZip,
      billingCity: input.billingCity,
      eventTitle: input.eventTitle,
      eventDescription: input.eventDescription,
      usageType: input.usageType,
      frequency: input.frequency,
      recurringOccurrences: input.recurringOccurrences,
      expectedAttendees: input.expectedAttendees,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime: input.endTime,
      setupStartTime: input.setupStartTime ?? null,
      teardownEndTime: input.teardownEndTime ?? null,
      startAt: berlinDateTimeToIso(input.bookingDate, input.startTime),
      endAt: berlinDateTimeToIso(input.bookingDate, input.endTime),
      setupStartAt: input.setupStartTime
        ? berlinDateTimeToIso(input.bookingDate, input.setupStartTime)
        : null,
      teardownEndAt: input.teardownEndTime
        ? berlinDateTimeToIso(input.bookingDate, input.teardownEndTime)
        : null,
      requestedRooms: input.requestedRooms,
      equipment: input.equipment,
      specialRequirements: input.specialRequirements ?? null,
      priceSnapshot,
    });

    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "customer",
      eventType: "request_submitted",
      payload: {
        tariffVersion: priceSnapshot.tariffVersion,
      },
    });

    const accessUrl = `${resolvePublicOrigin(request)}/volkshaus/anfrage/${accessToken}`;
    const notification = await notifyVolkshausRequestSubmitted({
      booking,
      accessUrl,
    }).catch((error) => ({
      sent: false as const,
      reason: "provider_error" as const,
      error: error instanceof Error ? error.message : "E-Mail-Versand fehlgeschlagen.",
    }));

    await updateVolkshausBooking(booking.id, {
      notificationStatus: notification.sent ? "request_sent" : "pending",
      notificationError: notification.sent
        ? null
        : notification.error ??
          (notification.reason === "not_configured"
            ? "E-Mail-Versand ist noch nicht konfiguriert."
            : "E-Mail-Versand fehlgeschlagen."),
    });

    return NextResponse.json(
      {
        referenceCode: booking.referenceCode,
        accessUrl,
        notificationSent: notification.sent,
        price: priceSnapshot,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof VolkshausValidationError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 },
      );
    }

    console.error(
      "[volkshaus/requests] Request creation failed",
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : JSON.stringify(error),
    );
    return NextResponse.json(
      {
        error:
          "Die Anfrage konnte gerade nicht gespeichert werden. Bitte versuche es später erneut.",
      },
      { status: 500 },
    );
  }
};
