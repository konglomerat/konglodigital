import { NextResponse, type NextRequest } from "next/server";

import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import {
  buildVolkshausContractSnapshot,
  findBusySlotConflicts,
  getMockBusySlots,
  type BusySlot,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";
import {
  hashVolkshausValue,
  stableVolkshausJson,
} from "@/lib/volkshaus-booking-server";
import {
  addVolkshausBookingEvent,
  getVolkshausBookingById,
  listVolkshausBookings,
  updateVolkshausBooking,
  type VolkshausBookingPatch,
} from "@/lib/volkshaus-booking-store";
import {
  createCampaiInvoiceForVolkshausBooking,
  VolkshausCampaiConfigurationError,
} from "@/lib/volkshaus-campai";
import {
  notifyVolkshausContractCompleted,
  notifyVolkshausContractReady,
} from "@/lib/volkshaus-notifications";
import { getUserRoles, userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type AdminAction =
  | "start_review"
  | "needs_info"
  | "hold"
  | "reject"
  | "save_assignees"
  | "save_notes"
  | "save_price_adjustment"
  | "send_contract"
  | "countersign"
  | "retry_invoice"
  | "mark_paid"
  | "mark_overdue"
  | "complete"
  | "cancel"
  | "reopen_contract";

const resolvePublicOrigin = (request: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseAssignedUserId = (value: unknown) => {
  if (value === null || value === "") {
    return { valid: true as const, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false as const, value: null };
  }
  const userId = value.trim();
  return UUID_PATTERN.test(userId)
    ? { valid: true as const, value: userId }
    : { valid: false as const, value: null };
};

const createInvoice = async (booking: VolkshausBooking) => {
  if (booking.campaiInvoiceId) {
    return { booking, warning: null as string | null };
  }

  let creating = await updateVolkshausBooking(booking.id, {
    invoiceStatus: "creating",
    campaiError: null,
  });

  try {
    const result = await createCampaiInvoiceForVolkshausBooking(creating);
    creating = await updateVolkshausBooking(booking.id, {
      invoiceStatus: result.status,
      paymentStatus: "open",
      campaiDebtorAccount: result.debtorAccount,
      campaiInvoiceId: result.invoiceId,
      campaiError: null,
    });
    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "system",
      eventType: "campai_invoice_created",
      payload: {
        invoiceId: result.invoiceId,
        debtorAccount: result.debtorAccount,
        status: result.status,
      },
    });
    return { booking: creating, warning: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Campai-Rechnung konnte nicht angelegt werden.";
    const configurationError =
      error instanceof VolkshausCampaiConfigurationError;
    creating = await updateVolkshausBooking(booking.id, {
      invoiceStatus: configurationError
        ? "configuration_required"
        : "error",
      campaiError: message,
    });
    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "system",
      eventType: "campai_invoice_failed",
      payload: { error: message, configurationError },
    });
    return { booking: creating, warning: message };
  }
};

const getConflictsForHold = async (
  booking: VolkshausBooking,
): Promise<BusySlot[]> => {
  const bookings = await listVolkshausBookings();
  const now = Date.now();
  const storedSlots: BusySlot[] = bookings
    .filter(
      (entry) =>
        entry.id !== booking.id &&
        entry.bookingDate === booking.bookingDate &&
        (entry.reservationStatus === "confirmed" ||
          (entry.reservationStatus === "held" &&
            (!entry.holdExpiresAt ||
              new Date(entry.holdExpiresAt).getTime() > now))),
    )
    .flatMap((entry) =>
      entry.requestedRooms.map((roomId) => ({
        id: `booking-${entry.id}-${roomId}`,
        date: entry.bookingDate,
        roomId,
        startTime: entry.setupStartTime ?? entry.startTime,
        endTime: entry.teardownEndTime ?? entry.endTime,
        source: "booking" as const,
      })),
    );

  return findBusySlotConflicts({
    slots: [...getMockBusySlots(booking.bookingDate), ...storedSlots],
    requestedRooms: booking.requestedRooms,
    startTime: booking.setupStartTime ?? booking.startTime,
    endTime: booking.teardownEndTime ?? booking.endTime,
  });
};

export const PATCH = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanAccessModule(supabase, data.user, "volkshaus"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const booking = await getVolkshausBookingById(id);
  if (!booking) {
    return NextResponse.json(
      { error: "Buchungsanfrage wurde nicht gefunden." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const action = body.action as AdminAction;
  const origin = resolvePublicOrigin(request);
  const accessUrl = `${origin}/volkshaus/anfrage/${booking.accessToken}`;
  const actorName =
    getCampaiBookingDisplayName(data.user) ||
    data.user.email ||
    "Konglomerat e.V.";

  try {
    let updated = booking;
    let warning: string | null = null;
    let patch: VolkshausBookingPatch | null = null;
    let eventPayload: Record<string, unknown> = {};

    switch (action) {
      case "start_review":
        patch = {
          requestStatus: "in_review",
          assignedUserId: booking.assignedUserId ?? data.user.id,
        };
        break;
      case "needs_info":
        patch = {
          requestStatus: "needs_info",
          assignedUserId: booking.assignedUserId ?? data.user.id,
        };
        break;
      case "hold": {
        const conflicts = await getConflictsForHold(booking);
        if (conflicts.length > 0) {
          return NextResponse.json(
            {
              error:
                "Die Anfrage kann wegen einer Terminüberschneidung nicht reserviert werden.",
              conflicts,
            },
            { status: 409 },
          );
        }
        const holdExpiresAt = new Date();
        holdExpiresAt.setDate(holdExpiresAt.getDate() + 7);
        patch = {
          requestStatus: "approved",
          reservationStatus: "held",
          holdExpiresAt: holdExpiresAt.toISOString(),
          assignedUserId: booking.assignedUserId ?? data.user.id,
        };
        break;
      }
      case "reject":
        patch = {
          requestStatus: "rejected",
          reservationStatus: "cancelled",
          contractStatus: "cancelled",
          holdExpiresAt: null,
          assignedUserId: booking.assignedUserId ?? data.user.id,
        };
        break;
      case "save_assignees": {
        const assignedUser = parseAssignedUserId(body.assignedUserId);
        const backupAssignedUser = parseAssignedUserId(
          body.backupAssignedUserId,
        );
        if (!assignedUser.valid || !backupAssignedUser.valid) {
          return NextResponse.json(
            { error: "Ungültige Personenauswahl." },
            { status: 400 },
          );
        }
        if (backupAssignedUser.value && !assignedUser.value) {
          return NextResponse.json(
            { error: "Bitte zuerst eine verantwortliche Person auswählen." },
            { status: 400 },
          );
        }
        if (
          assignedUser.value &&
          assignedUser.value === backupAssignedUser.value
        ) {
          return NextResponse.json(
            {
              error:
                "Verantwortliche Person und Ersatz müssen verschieden sein.",
            },
            { status: 400 },
          );
        }

        const selectedUserIds = [
          assignedUser.value,
          backupAssignedUser.value,
        ].filter((userId): userId is string => Boolean(userId));
        const adminClient = createSupabaseAdminClient();
        const userLookups = await Promise.all(
          selectedUserIds.map((userId) =>
            adminClient.auth.admin.getUserById(userId),
          ),
        );
        if (
          userLookups.some(
            ({ data: userData, error }) => error || !userData.user,
          )
        ) {
          return NextResponse.json(
            { error: "Eine ausgewählte Person wurde nicht gefunden." },
            { status: 400 },
          );
        }
        const selectedUserRoles = await Promise.all(
          userLookups.map(({ data: userData }) =>
            getUserRoles(adminClient, userData.user),
          ),
        );
        if (
          selectedUserRoles.some(
            (roles) => !roles.includes("admin") && !roles.includes("vhc"),
          )
        ) {
          return NextResponse.json(
            { error: "Ausgewählte Personen benötigen die Rolle VHC." },
            { status: 400 },
          );
        }

        patch = {
          assignedUserId: assignedUser.value,
          backupAssignedUserId: backupAssignedUser.value,
        };
        eventPayload = {
          assignedUserId: assignedUser.value,
          backupAssignedUserId: backupAssignedUser.value,
        };
        break;
      }
      case "save_notes":
        patch = {
          internalNotes:
            typeof body.internalNotes === "string"
              ? body.internalNotes.trim().slice(0, 10_000) || null
              : null,
        };
        break;
      case "save_price_adjustment": {
        if (booking.contractStatus !== "draft") {
          return NextResponse.json(
            {
              error:
                "Nach Versand des Vertrags kann der Preis nicht mehr verändert werden. Öffne den Vertrag zuerst erneut.",
            },
            { status: 409 },
          );
        }
        const adjustmentEuro = Number(body.adjustmentEuro ?? 0);
        if (!Number.isFinite(adjustmentEuro) || Math.abs(adjustmentEuro) > 10_000) {
          return NextResponse.json(
            { error: "Ungültige Preisanpassung." },
            { status: 400 },
          );
        }
        const reason =
          typeof body.reason === "string"
            ? body.reason.trim().slice(0, 500)
            : "";
        if (adjustmentEuro !== 0 && !reason) {
          return NextResponse.json(
            { error: "Bitte die Preisanpassung begründen." },
            { status: 400 },
          );
        }
        patch = {
          priceAdjustmentCents: Math.round(adjustmentEuro * 100),
          priceAdjustmentReason: reason || null,
        };
        break;
      }
      case "send_contract": {
        if (
          booking.requestStatus !== "approved" ||
          booking.reservationStatus !== "held"
        ) {
          return NextResponse.json(
            {
              error:
                "Vor dem Vertragsversand muss die Anfrage freigegeben und vorläufig reserviert werden.",
            },
            { status: 409 },
          );
        }
        const snapshot = buildVolkshausContractSnapshot(booking);
        const contractHash = hashVolkshausValue(
          stableVolkshausJson(snapshot),
        );
        updated = await updateVolkshausBooking(booking.id, {
          contractStatus: "sent",
          contractVersion: booking.contractVersion + 1,
          contractSnapshot: snapshot,
          contractHash,
          customerSignature: null,
          customerSignedAt: null,
          staffSignature: null,
          staffSignedAt: null,
          staffSignedBy: null,
          notificationStatus: "contract_pending",
          notificationError: null,
        });
        const notification = await notifyVolkshausContractReady({
          booking: updated,
          accessUrl,
        }).catch((error) => ({
          sent: false as const,
          reason: "provider_error" as const,
          error:
            error instanceof Error
              ? error.message
              : "E-Mail-Versand fehlgeschlagen.",
        }));
        updated = await updateVolkshausBooking(booking.id, {
          notificationStatus: notification.sent
            ? "contract_sent"
            : "contract_pending",
          notificationError: notification.sent
            ? null
            : notification.error ??
              "E-Mail-Versand ist noch nicht konfiguriert.",
        });
        warning = notification.sent
          ? null
          : "Der Vertrag wurde freigegeben, aber nicht per E-Mail versendet. Nutze den persönlichen Link.";
        break;
      }
      case "countersign": {
        if (
          booking.contractStatus !== "customer_signed" ||
          !booking.contractHash
        ) {
          return NextResponse.json(
            {
              error:
                "Der Vertrag muss zuerst von der anfragenden Person unterschrieben werden.",
            },
            { status: 409 },
          );
        }
        const signedAt = new Date().toISOString();
        updated = await updateVolkshausBooking(booking.id, {
          contractStatus: "fully_signed",
          reservationStatus: "confirmed",
          holdExpiresAt: null,
          staffSignature: {
            name: actorName,
            signedAt,
            contractHash: booking.contractHash,
            ipHash: null,
            userAgent: null,
          },
          staffSignedAt: signedAt,
          staffSignedBy: data.user.id,
        });
        const invoiceResult = await createInvoice(updated);
        updated = invoiceResult.booking;
        warning = invoiceResult.warning;
        await notifyVolkshausContractCompleted({
          booking: updated,
          accessUrl,
        }).catch(() => undefined);
        break;
      }
      case "retry_invoice": {
        if (booking.contractStatus !== "fully_signed") {
          return NextResponse.json(
            { error: "Die Vereinbarung ist noch nicht vollständig unterschrieben." },
            { status: 409 },
          );
        }
        const invoiceResult = await createInvoice(booking);
        updated = invoiceResult.booking;
        warning = invoiceResult.warning;
        break;
      }
      case "mark_paid":
        if (
          !booking.campaiInvoiceId ||
          !["draft_created", "created"].includes(booking.invoiceStatus)
        ) {
          return NextResponse.json(
            {
              error:
                "Die Zahlung kann erst nach erfolgreicher Campai-Anlage markiert werden.",
            },
            { status: 409 },
          );
        }
        patch = { paymentStatus: "paid" };
        break;
      case "mark_overdue":
        if (
          !booking.campaiInvoiceId ||
          !["draft_created", "created"].includes(booking.invoiceStatus)
        ) {
          return NextResponse.json(
            {
              error:
                "Eine überfällige Zahlung setzt eine angelegte Campai-Rechnung voraus.",
            },
            { status: 409 },
          );
        }
        patch = { paymentStatus: "overdue" };
        break;
      case "complete":
        if (booking.reservationStatus !== "confirmed") {
          return NextResponse.json(
            {
              error:
                "Nur eine bestätigte Buchung kann abgeschlossen werden.",
            },
            { status: 409 },
          );
        }
        patch = { reservationStatus: "completed" };
        break;
      case "cancel":
        patch = {
          reservationStatus: "cancelled",
          contractStatus: "cancelled",
          holdExpiresAt: null,
        };
        if (booking.campaiInvoiceId) {
          warning =
            "Die Buchung wurde storniert. Die bestehende Campai-Rechnung muss separat geprüft oder gutgeschrieben werden.";
        }
        break;
      case "reopen_contract":
        if (
          booking.contractStatus === "fully_signed" ||
          Boolean(booking.campaiInvoiceId)
        ) {
          return NextResponse.json(
            {
              error:
                "Ein vollständig unterschriebener oder bereits abgerechneter Vertrag kann nicht neu aufgesetzt werden.",
            },
            { status: 409 },
          );
        }
        patch = {
          contractStatus: "draft",
          contractSnapshot: null,
          contractHash: null,
          customerSignature: null,
          customerSignedAt: null,
          staffSignature: null,
          staffSignedAt: null,
          staffSignedBy: null,
        };
        break;
      default:
        return NextResponse.json(
          { error: "Unbekannte Aktion." },
          { status: 400 },
        );
    }

    if (patch) {
      updated = await updateVolkshausBooking(booking.id, patch);
    }

    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "staff",
      actorUserId: data.user.id,
      eventType: `admin_${action}`,
      payload: warning ? { ...eventPayload, warning } : eventPayload,
    });

    return NextResponse.json({
      booking: { ...updated, accessUrl },
      warning,
    });
  } catch (error) {
    console.error(`[admin/volkshaus/${id}] Action failed`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Aktion konnte nicht ausgeführt werden.",
      },
      { status: 500 },
    );
  }
};
