import "server-only";

import {
  formatEuro,
  getEffectiveVolkshausPrice,
  getRoomLabel,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";
import { addVolkshausBookingEvent } from "@/lib/volkshaus-booking-store";
import {
  sendSmtpMail,
  SmtpConfigurationError,
} from "@/lib/smtp-mail";
import {
  formatVolkshausRequestReceivedAt,
  getVolkshausRequestReply,
  VOLKSHAUS_WAITLIST_EMAIL,
} from "@/lib/volkshaus-request-messages";

type NotificationResult =
  | { sent: true; provider: "smtp" }
  | { sent: false; reason: "not_configured" | "provider_error"; error?: string };

// Room bookings are handled by the Volkshaus team, independently of the
// platform-wide SMTP_ADMIN_EMAIL setting.
const VOLKSHAUS_STAFF_EMAIL = "mitmachen@neuesvolkshaus.de";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<NotificationResult> => {
  try {
    await sendSmtpMail({
      subject,
      html,
      to,
      replyTo: VOLKSHAUS_STAFF_EMAIL,
    });
  } catch (error) {
    if (error instanceof SmtpConfigurationError) {
      return {
        sent: false,
        reason: "not_configured",
        error: error.message,
      };
    }
    return {
      sent: false,
      reason: "provider_error",
      error:
        error instanceof Error
          ? error.message
          : "E-Mail-Versand über SMTP fehlgeschlagen.",
    };
  }

  return { sent: true, provider: "smtp" };
};

const sendStaffNotification = async ({
  booking,
  trigger,
  subject,
  html,
}: {
  booking: VolkshausBooking;
  trigger: "request_submitted" | "contract_customer_signed";
  subject: string;
  html: string;
}) => {
  const result = await sendEmail({ to: VOLKSHAUS_STAFF_EMAIL, subject, html });
  if (!result.sent) {
    console.error("[volkshaus/notifications] Staff notification failed", {
      bookingId: booking.id,
      trigger,
      ...result,
    });
  }
  try {
    await addVolkshausBookingEvent({
      bookingId: booking.id,
      actorType: "system",
      eventType: result.sent
        ? "staff_notification_sent"
        : "staff_notification_failed",
      payload: { trigger, recipient: VOLKSHAUS_STAFF_EMAIL, ...result },
    });
  } catch (error) {
    console.error("[volkshaus/notifications] Could not record notification", {
      bookingId: booking.id,
      trigger,
      error,
    });
  }
  return result;
};

const bookingSummaryHtml = (booking: VolkshausBooking) => {
  const price = getEffectiveVolkshausPrice(booking);
  return `
    <ul>
      <li><strong>Referenz:</strong> ${escapeHtml(booking.referenceCode)}</li>
      <li><strong>Termin:</strong> ${escapeHtml(booking.bookingDate)}, ${escapeHtml(booking.startTime)}–${escapeHtml(booking.endTime)} Uhr</li>
      <li><strong>Räume:</strong> ${escapeHtml(booking.requestedRooms.map(getRoomLabel).join(", "))}</li>
      <li><strong>Veranstaltung:</strong> ${escapeHtml(booking.eventTitle)}</li>
      <li><strong>Vorläufiger Gesamtpreis:</strong> ${escapeHtml(formatEuro(price.grossCents))}</li>
    </ul>
  `;
};

export const notifyVolkshausRequestSubmitted = async ({
  booking,
  accessUrl,
  adminUrl,
}: {
  booking: VolkshausBooking;
  accessUrl: string;
  adminUrl: string;
}) => {
  const reply = getVolkshausRequestReply(booking.bookingDate);
  const replyHtml = reply.paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll(
      VOLKSHAUS_WAITLIST_EMAIL,
      `<a href="mailto:${VOLKSHAUS_WAITLIST_EMAIL}">${VOLKSHAUS_WAITLIST_EMAIL}</a>`,
    )}</p>`)
    .join("\n");
  const [customerResult] = await Promise.all([
    sendEmail({
      to: booking.email,
      subject: `Ihre Anfrage ${booking.referenceCode} im Volkshaus Cotta`,
      html: `
        <p>Guten Tag ${escapeHtml(booking.customerName)},</p>
        ${replyHtml}
        <p>${reply.closing}<br>das Team der Ehrenamtlichen am Neuen Volkshaus Cotta</p>
        <hr>
        <p>Ihre Anfrage ist noch keine verbindliche Reservierung.</p>
        ${bookingSummaryHtml(booking)}
        <p><a href="${escapeHtml(accessUrl)}">Anfrage ansehen</a></p>
      `,
    }),
    sendStaffNotification({
      booking,
      trigger: "request_submitted",
      subject: `Neue VHC-Raumanfrage ${booking.referenceCode}`,
      html: `
        <p>Eine neue Raumanfrage wurde eingereicht.</p>
        <p><strong>Eingegangen am:</strong> ${escapeHtml(formatVolkshausRequestReceivedAt(booking.createdAt))} (Berliner Zeit)</p>
        <p><strong>Angefragt von:</strong> ${escapeHtml(booking.customerName)} (${escapeHtml(booking.email)})</p>
        ${bookingSummaryHtml(booking)}
        <p><a href="${escapeHtml(adminUrl)}">Anfrage im KongloDigital-Adminbereich prüfen</a></p>
      `,
    }),
  ]);

  return customerResult;
};

export const notifyVolkshausContractReady = async ({
  booking,
  accessUrl,
}: {
  booking: VolkshausBooking;
  accessUrl: string;
}) =>
  sendEmail({
    to: booking.email,
    subject: `Nutzungsvereinbarung ${booking.referenceCode} ist bereit`,
    html: `
      <p>Hallo ${escapeHtml(booking.customerName)},</p>
      <p>deine Anfrage wurde geprüft. Über den folgenden persönlichen Link kannst du alle Angaben kontrollieren und die bereits von uns unterschriebene Nutzungsvereinbarung unterschreiben.</p>
      ${bookingSummaryHtml(booking)}
      <p><a href="${escapeHtml(accessUrl)}">Nutzungsvereinbarung öffnen</a></p>
      <p>Viele Grüße<br>Team Neues Volkshaus Cotta</p>
    `,
  });

export const notifyVolkshausCustomerSigned = async ({
  booking,
  adminUrl,
}: {
  booking: VolkshausBooking;
  adminUrl: string;
}) => {
  return sendStaffNotification({
    booking,
    trigger: "contract_customer_signed",
    subject: `${booking.referenceCode} ist vollständig unterschrieben`,
    html: `
      <p>Die Nutzungsvereinbarung wurde von ${escapeHtml(booking.customerName)} unterschrieben.</p>
      <p>Die Buchung ist bestätigt. Bitte prüfe die Rechnungsangaben und lege die Rechnung anschließend in der Verwaltung in Campai an.</p>
      ${bookingSummaryHtml(booking)}
      <p><a href="${escapeHtml(adminUrl)}">Buchung und Rechnung prüfen</a></p>
    `,
  });
};

export const notifyVolkshausContractCompleted = async ({
  booking,
  accessUrl,
}: {
  booking: VolkshausBooking;
  accessUrl: string;
}) =>
  sendEmail({
    to: booking.email,
    subject: `Buchung ${booking.referenceCode} ist bestätigt`,
    html: `
      <p>Hallo ${escapeHtml(booking.customerName)},</p>
      <p>die Nutzungsvereinbarung ist vollständig unterschrieben und deine Buchung ist bestätigt.</p>
      ${bookingSummaryHtml(booking)}
      <p><a href="${escapeHtml(accessUrl)}">Buchung und Vertrag öffnen</a></p>
      <p>Informationen zur Rechnung findest du nach der Anlage ebenfalls dort.</p>
      <p>Viele Grüße<br>Team Neues Volkshaus Cotta</p>
    `,
  });
