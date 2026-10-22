import { prepareVolkshausAdminEdit } from "@/lib/volkshaus-admin-edit-server";
import { VolkshausValidationError } from "@/lib/volkshaus-booking-server";
import { NextResponse, type NextRequest } from "next/server";

import { loadCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import {
  buildVolkshausContractSnapshot,
  getEffectiveVolkshausPrice,
  findBusySlotConflicts,
  type BusySlot,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";
import {
  berlinDateTimeToIso,
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
import { createVolkshausInvoice } from "@/lib/volkshaus-invoice";
import {
  deleteVolkshausBookingFromTeamup,
  getInactiveVolkshausTeamupRemoteIds,
  getTeamupBusySlots,
  getVolkshausTeamupRemoteId,
  syncVolkshausBookingToTeamup,
} from "@/lib/volkshaus-teamup";
import { notifyVolkshausContractReady } from "@/lib/volkshaus-notifications";
import { can } from "@/lib/access/access";
import { VOLKSHAUS_SCOPE_ID } from "@/lib/access/scopes";
import { loadAccessOf, loadUserAccess } from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type AdminAction =
  | "save_booking"
  | "resolve_invoice_correction"
  | "start_review"
  | "needs_info"
  | "hold"
  | "reject"
  | "save_assignees"
  | "save_notes"
  | "send_contract"
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

const getConflictsForHold = async (
  booking: VolkshausBooking,
): Promise<BusySlot[]> => {
  const bookings = await listVolkshausBookings();
  const now = Date.now();
  const teamupSlots = await getTeamupBusySlots(booking.bookingDate, {
    excludeRemoteIds: [
      getVolkshausTeamupRemoteId(booking.id),
      ...getInactiveVolkshausTeamupRemoteIds(
        bookings,
        booking.bookingDate,
        now,
      ),
    ],
  });
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
    slots: [...teamupSlots, ...storedSlots],
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
  if (
    !can(
      await loadUserAccess(supabase, data.user),
      "volkshaus.bookings.manage",
      { scope: VOLKSHAUS_SCOPE_ID },
    )
  ) {
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
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== booking.updatedAt)
    return NextResponse.json(
      { error: "Die Buchung wurde inzwischen geändert. Bitte neu laden." },
      { status: 409 },
    );
  const origin = resolvePublicOrigin(request);
  const accessUrl = `${origin}/volkshaus/anfrage/${booking.accessToken}`;
  const actorName =
    (await loadCampaiBookingDisplayName(data.user)) ||
    data.user.email ||
    "Konglomerat e.V.";
  try {
    let updated = booking;
    let warning: string | null = null;
    let patch: VolkshausBookingPatch | null = null;
    let eventPayload: Record<string, unknown> = {};

    switch (action) {
      case "save_booking": {
        if (body.expectedUpdatedAt !== booking.updatedAt) {
          return NextResponse.json(
            {
              error: "Die Buchung wurde inzwischen geändert. Bitte neu laden.",
            },
            { status: 409 },
          );
        }
        let edit;
        try {
          edit = prepareVolkshausAdminEdit(booking, body, actorName);
        } catch (error) {
          const message =
            error instanceof VolkshausValidationError
              ? Object.values(error.details).join(" ")
              : error instanceof Error
                ? error.message
                : "Ungültige Änderungen.";
          return NextResponse.json({ error: message }, { status: 400 });
        }
        if (
          edit.scheduleChanged &&
          ["held", "confirmed"].includes(booking.reservationStatus)
        ) {
          const conflicts = await getConflictsForHold({
            ...booking,
            ...edit.patch,
          });
          if (conflicts.length)
            return NextResponse.json(
              {
                error:
                  "Der geänderte Termin überschneidet sich mit einer anderen Reservierung.",
                conflicts,
              },
              { status: 409 },
            );
        }
        patch = edit.patch;
        eventPayload = {
          actorName,
          changes: edit.changes,
          reason: body.reason,
        };
        warning = booking.campaiInvoiceId
          ? "Gespeichert. Die bestehende Rechnung muss separat in Campai geprüft und korrigiert werden."
          : edit.needsRevision
            ? "Gespeichert. Bitte die neue Vertragsversion prüfen und erneut freigeben. Die vorherige Version bleibt im Verlauf erhalten."
            : null;
        break;
      }
      case "resolve_invoice_correction": {
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (body.expectedUpdatedAt !== booking.updatedAt)
          return NextResponse.json(
            {
              error: "Die Buchung wurde inzwischen geändert. Bitte neu laden.",
            },
            { status: 409 },
          );
        if (
          !booking.priceSnapshot.admin?.invoiceCorrection?.required ||
          !note ||
          note.length > 1000
        )
          return NextResponse.json(
            {
              error:
                "Bitte die in Campai ausgeführte Korrektur mit Belegreferenz dokumentieren.",
            },
            { status: 400 },
          );
        const admin = booking.priceSnapshot.admin;
        patch = {
          priceSnapshot: {
            ...booking.priceSnapshot,
            admin: {
              ...admin,
              invoiceCorrection: {
                invoiceId: admin.invoiceCorrection!.invoiceId,
                required: false,
                note,
              },
              changes: [
                ...(admin.changes ?? []),
                {
                  at: new Date().toISOString(),
                  by: actorName,
                  reason: note,
                  changes: [
                    {
                      label: "Rechnungsprüfung in Campai",
                      before: "Offen",
                      after: "Manuell als erledigt dokumentiert",
                    },
                  ],
                },
              ],
            },
          },
        };
        eventPayload = { actorName, note };
        break;
      }
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
        const holdExpiresAt =
          body.holdUntil && typeof body.holdUntil === "string"
            ? new Date(berlinDateTimeToIso(body.holdUntil, "23:59"))
            : new Date(Date.now() + 7 * 86400000);
        if (
          !Number.isFinite(holdExpiresAt.getTime()) ||
          holdExpiresAt.getTime() <= Date.now() ||
          holdExpiresAt.getTime() > Date.now() + 366 * 86400000
        ) {
          return NextResponse.json(
            {
              error:
                "Bitte ein Reservierungsende innerhalb des nächsten Jahres wählen.",
            },
            { status: 400 },
          );
        }
        const holdPatch: VolkshausBookingPatch = {
          requestStatus: "approved",
          reservationStatus: "held",
          holdExpiresAt: holdExpiresAt.toISOString(),
          assignedUserId: booking.assignedUserId ?? data.user.id,
        };
        const teamupResult = await syncVolkshausBookingToTeamup(
          { ...booking, ...holdPatch },
          "held",
        );
        eventPayload = {
          teamupSync: teamupResult.action,
          teamupEventId: teamupResult.eventId,
        };
        patch = holdPatch;
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
            {
              error: "Bitte zuerst eine verantwortliche Person auswählen.",
            },
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
        const selectedUserAccess = await Promise.all(
          userLookups.map(({ data: userData }) =>
            loadAccessOf(adminClient, userData.user),
          ),
        );
        if (
          selectedUserAccess.some(
            (access) =>
              !can(access, "volkshaus.bookings.manage", {
                scope: VOLKSHAUS_SCOPE_ID,
              }),
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Ausgewählte Personen brauchen die Rolle Tools im Bereich VHC.",
            },
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
      case "send_contract": {
        if (
          booking.requestStatus !== "approved" ||
          !["held", "confirmed", "completed"].includes(
            booking.reservationStatus,
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Vor dem Vertragsversand muss die Anfrage freigegeben und vorläufig reserviert werden.",
            },
            { status: 409 },
          );
        }
        if (booking.contractStatus !== "draft")
          return NextResponse.json(
            {
              error:
                "Der Vertrag wurde bereits freigegeben. Zum Bearbeiten eine neue Version vorbereiten.",
            },
            { status: 409 },
          );
        const snapshot = buildVolkshausContractSnapshot(booking);
        const contractHash = hashVolkshausValue(stableVolkshausJson(snapshot));
        const signedAt = new Date().toISOString();
        updated = await updateVolkshausBooking(
          booking.id,
          {
            contractStatus: "sent",
            contractVersion: booking.contractVersion + 1,
            contractSnapshot: snapshot,
            contractHash,
            customerSignature: null,
            customerSignedAt: null,
            staffSignature: {
              name: actorName,
              signedAt,
              contractHash,
              ipHash: null,
              userAgent: null,
            },
            staffSignedAt: signedAt,
            staffSignedBy: data.user.id,
            notificationStatus: "contract_pending",
            notificationError: null,
          },
          booking.updatedAt,
        );
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
            : (notification.error ??
              "E-Mail-Versand ist noch nicht konfiguriert."),
        });
        warning = notification.sent
          ? null
          : "Der Vertrag wurde freigegeben, aber nicht per E-Mail versendet. Nutze den persönlichen Link.";
        break;
      }
      case "retry_invoice": {
        if (getEffectiveVolkshausPrice(booking).netCents <= 0)
          return NextResponse.json(
            {
              error:
                "Für eine kostenfreie Nutzung ist keine Rechnung erforderlich.",
            },
            { status: 400 },
          );
        if (booking.contractStatus !== "fully_signed") {
          return NextResponse.json(
            {
              error:
                "Die Vereinbarung ist noch nicht vollständig unterschrieben.",
            },
            { status: 409 },
          );
        }
        const invoiceResult = await createVolkshausInvoice(booking);
        updated = invoiceResult.booking;
        warning = invoiceResult.warning;
        break;
      }
      case "mark_paid":
        if (booking.priceSnapshot.admin?.invoiceCorrection?.required)
          return NextResponse.json(
            {
              error:
                "Bitte zuerst die offene Rechnungskorrektur dokumentieren.",
            },
            { status: 409 },
          );
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
        if (booking.priceSnapshot.admin?.invoiceCorrection?.required)
          return NextResponse.json(
            {
              error:
                "Bitte zuerst die offene Rechnungskorrektur dokumentieren.",
            },
            { status: 409 },
          );
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
              error: "Nur eine bestätigte Buchung kann abgeschlossen werden.",
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
      case "reopen_contract": {
        if (!booking.contractSnapshot || booking.invoiceStatus === "creating")
          return NextResponse.json(
            {
              error:
                "Es gibt keinen Vertrag zum Neuaufsetzen oder die Rechnung wird gerade erstellt.",
            },
            { status: 409 },
          );
        const admin = booking.priceSnapshot.admin ?? {};
        patch = {
          priceSnapshot: {
            ...booking.priceSnapshot,
            admin: {
              ...admin,
              archivedContracts: [
                ...(admin.archivedContracts ?? []),
                {
                  version: booking.contractVersion,
                  archivedAt: new Date().toISOString(),
                  snapshot: booking.contractSnapshot,
                  hash: booking.contractHash,
                  customerSignature: booking.customerSignature,
                  staffSignature: booking.staffSignature,
                },
              ],
              changes: [
                ...(admin.changes ?? []),
                {
                  at: new Date().toISOString(),
                  by: actorName,
                  reason: "Neue Vertragsversion vorbereitet",
                  changes: [
                    {
                      label: "Vertrag",
                      before: `Version ${booking.contractVersion}`,
                      after: "Neuer Entwurf",
                    },
                  ],
                },
              ],
            },
          },
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
        };
        break;
      }
      default:
        return NextResponse.json(
          { error: "Unbekannte Aktion." },
          { status: 400 },
        );
    }

    if (patch) {
      updated = await updateVolkshausBooking(
        booking.id,
        patch,
        booking.updatedAt,
      );
    }

    const appendTeamupWarning = (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Teamup-Synchronisierung.";
      warning = [
        warning,
        `Die Buchung wurde gespeichert, aber Teamup konnte nicht synchronisiert werden: ${message}`,
      ]
        .filter(Boolean)
        .join(" ");
      eventPayload = {
        ...eventPayload,
        teamupSync: "error",
        teamupError: message,
      };
    };

    if (action === "reject" || action === "cancel") {
      try {
        const teamupResult = await deleteVolkshausBookingFromTeamup(updated);
        eventPayload = {
          ...eventPayload,
          teamupSync: teamupResult.action,
          teamupEventId: teamupResult.eventId,
        };
      } catch (error) {
        appendTeamupWarning(error);
      }
    } else if (
      (action === "save_booking" &&
        ["held", "confirmed"].includes(updated.reservationStatus)) ||
      action === "send_contract" ||
      action === "reopen_contract" ||
      action === "complete"
    ) {
      try {
        const teamupResult = await syncVolkshausBookingToTeamup(
          updated,
          action === "complete" || updated.reservationStatus === "completed"
            ? "completed"
            : updated.reservationStatus === "confirmed"
              ? "confirmed"
              : "held",
        );
        eventPayload = {
          ...eventPayload,
          teamupSync: teamupResult.action,
          teamupEventId: teamupResult.eventId,
        };
      } catch (error) {
        appendTeamupWarning(error);
      }
    }

    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "staff",
      actorUserId: data.user.id,
      eventType: `admin_${action}`,
      payload: warning ? { ...eventPayload, warning } : eventPayload,
    }).catch((error) => {
      console.error("[volkshaus] Audit event could not be saved", error);
      warning = [
        warning,
        "Die Änderung wurde gespeichert, aber das zusätzliche Systemprotokoll konnte nicht aktualisiert werden.",
      ]
        .filter(Boolean)
        .join(" ");
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
      {
        status:
          error instanceof Error &&
          error.message.includes("inzwischen geändert")
            ? 409
            : 500,
      },
    );
  }
};
