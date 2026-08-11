import "server-only";

import type { VolkshausBooking } from "@/lib/volkshaus-booking";
import {
  createCampaiInvoiceForVolkshausBooking,
  VolkshausCampaiConfigurationError,
} from "@/lib/volkshaus-campai";
import {
  addVolkshausBookingEvent,
  updateVolkshausBooking,
} from "@/lib/volkshaus-booking-store";

export const createVolkshausInvoice = async (booking: VolkshausBooking) => {
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
    return { booking: creating, warning: null as string | null };
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
