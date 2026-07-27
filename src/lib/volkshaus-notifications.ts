import "server-only";

import {
  formatEuro,
  getEffectiveVolkshausPrice,
  getRoomLabel,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";

type NotificationResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: "not_configured" | "provider_error"; error?: string };

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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.VOLKSHAUS_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return { sent: false, reason: "not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      sent: false,
      reason: "provider_error",
      error: body || `E-Mail-Versand fehlgeschlagen (HTTP ${response.status}).`,
    };
  }

  return { sent: true, provider: "resend" };
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
}: {
  booking: VolkshausBooking;
  accessUrl: string;
}) => {
  const customerResult = await sendEmail({
    to: booking.email,
    subject: `Deine Anfrage ${booking.referenceCode} im Volkshaus Cotta`,
    html: `
      <p>Hallo ${escapeHtml(booking.customerName)},</p>
      <p>wir haben deine Raumanfrage erhalten. Sie ist noch keine verbindliche Reservierung.</p>
      ${bookingSummaryHtml(booking)}
      <p><a href="${escapeHtml(accessUrl)}">Anfrage ansehen</a></p>
      <p>Wir melden uns nach der internen Prüfung.</p>
      <p>Viele Grüße<br>Team Neues Volkshaus Cotta</p>
    `,
  });

  const staffAddress = process.env.VOLKSHAUS_STAFF_EMAIL?.trim();
  if (staffAddress) {
    await sendEmail({
      to: staffAddress,
      subject: `Neue VHC-Raumanfrage ${booking.referenceCode}`,
      html: `
        <p>Eine neue Raumanfrage wurde eingereicht.</p>
        ${bookingSummaryHtml(booking)}
        <p>Bitte im KongloDigital-Adminbereich prüfen.</p>
      `,
    });
  }

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
      <p>deine Anfrage wurde geprüft. Über den folgenden persönlichen Link kannst du alle Angaben kontrollieren und die Nutzungsvereinbarung unterschreiben.</p>
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
  const staffAddress = process.env.VOLKSHAUS_STAFF_EMAIL?.trim();
  if (!staffAddress) {
    return { sent: false, reason: "not_configured" } as const;
  }

  return sendEmail({
    to: staffAddress,
    subject: `${booking.referenceCode} wurde kundenseitig unterschrieben`,
    html: `
      <p>Die Nutzungsvereinbarung wurde von ${escapeHtml(booking.customerName)} unterschrieben.</p>
      <p><a href="${escapeHtml(adminUrl)}">Anfrage gegenzeichnen und Rechnung anlegen</a></p>
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

