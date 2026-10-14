// Mitgliedsanträge — Mails per SMTP. Vor dem Annehmen gibt es noch keinen
// Campai-Kontakt, deshalb gehen Eingangsbestätigung, Rückfrage, Absage und
// die Info an den Vorstand nicht über Campai.
import "server-only";

import { sendSmtpMail } from "@/lib/smtp-mail";

import { VORSTAND_EMAIL } from "./config";
import { receiptConfirmation } from "./mail-texts";
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

/** Schickt Text an die antragstellende Person; Antworten gehen an den Vorstand. */
export const mailApplicant = (
  application: MembershipApplication,
  subject: string,
  text: string,
) =>
  sendSmtpMail({
    to: application.data.email,
    subject,
    text,
    html: textToHtml(text),
    replyTo: VORSTAND_EMAIL,
  });

export const mailReceiptConfirmation = (application: MembershipApplication) => {
  const { subject, text } = receiptConfirmation(
    application.data.firstName,
    application.number,
  );
  return mailApplicant(application, subject, text);
};

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
    to: VORSTAND_EMAIL,
    subject: `Neuer Mitgliedsantrag: ${data.firstName} ${data.lastName}`,
    text,
    html: textToHtml(text),
    replyTo: data.email,
  });
};
