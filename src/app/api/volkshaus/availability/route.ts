import { NextResponse, type NextRequest } from "next/server";

import { type BusySlot } from "@/lib/volkshaus-booking";
import { listVolkshausBookings } from "@/lib/volkshaus-booking-store";
import {
  getInactiveVolkshausTeamupRemoteIds,
  getTeamupBusySlots,
} from "@/lib/volkshaus-teamup";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  const date = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json(
      { error: "Bitte ein Datum im Format JJJJ-MM-TT angeben." },
      { status: 400 },
    );
  }

  try {
    const now = Date.now();
    const bookings = await listVolkshausBookings();
    const teamupSlots = await getTeamupBusySlots(date, {
      excludeRemoteIds: getInactiveVolkshausTeamupRemoteIds(
        bookings,
        date,
        now,
      ),
    });
    const bookingSlots: BusySlot[] = bookings
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

    return NextResponse.json({
      date,
      slots: [...teamupSlots, ...bookingSlots],
      calendarMode: "teamup",
      notice: "Verbindlich wird ein Termin erst nach interner Freigabe.",
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Die Verfügbarkeit konnte gerade nicht geladen werden. Bitte versuche es später erneut.",
      },
      { status: 500 },
    );
  }
};
