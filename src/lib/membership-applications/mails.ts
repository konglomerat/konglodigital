// Mitgliedsanträge — die Info an den Vorstand über einen neuen Antrag, per
// SMTP. Was an die antragstellende Person geht (Eingangsbestätigung,
// Rückfrage, Absage), schickt Campai an ihren Kontakt (messageApplicant in
// workflow.ts).
import "server-only";

import { sendSmtpMail } from "@/lib/smtp-mail";

import { NEW_APPLICATION_NOTIFY_EMAIL } from "./config";
import { describeAccess, describeFee, formatEuro, type MembershipApplication } from "./types";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("\n");

export const mailVorstandNewApplication = (
  application: MembershipApplication,
  inboxUrl: string,
) => {
  const { data } = application;
  const fee = describeFee(data);
  const text = [
    `Neuer Mitgliedsantrag ${application.number}:`,
    `${data.firstName} ${data.lastName} <${data.email}>`,
    `Jahresbeitrag: ${fee.label}${fee.euro === null ? "" : ` · ${formatEuro(fee.euro)}`}`,
    `Zugangskarte: ${describeAccess(data)}`,
    `Prüfen und annehmen: ${inboxUrl}`,
  ].join("\n");
  return sendSmtpMail({
    to: NEW_APPLICATION_NOTIFY_EMAIL,
    subject: `Neuer Mitgliedsantrag: ${data.firstName} ${data.lastName}`,
    text,
    html: textToHtml(text),
    replyTo: data.email,
  });
};
