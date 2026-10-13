// Mitgliedsanträge — der ausgefüllte Antrag als PDF. Er hängt nach dem
// Annehmen als Dokument am Campai-Kontakt; vorher zeigt ihn die Inbox.
//
// Gedruckt wird der korrigierte Stand. Hat der Vorstand etwas geändert, steht
// am Ende, was die antragstellende Person ursprünglich angegeben hatte — die
// Unterschrift gilt der Einreichung, nicht der Korrektur.
import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  changedFields,
  describeAccess,
  describeFee,
  describePayment,
  formatDate,
  formatEuro,
  type MembershipApplication,
} from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const LABEL_WIDTH = 150;
const BODY_SIZE = 10;

const COLOR_TEXT = rgb(0.13, 0.13, 0.13);
const COLOR_MUTED = rgb(0.36, 0.4, 0.44);

/**
 * Helvetica kennt nur WinAnsi — typografische Zeichen ersetzen. Das €-Zeichen
 * gibt es zwar, pdf-lib setzt danach aber zu wenig Abstand.
 */
const pdfSafeText = (value: string) =>
  value
    .replaceAll("\u00a0€", " EUR")
    .replaceAll("€", "EUR")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("„", '"')
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("…", "...")
    .replaceAll(" ", " ");

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const lines: string[] = [];
  let current = "";
  for (const word of pdfSafeText(text).split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
};

const pngBytes = (dataUrl: string | undefined) =>
  dataUrl?.startsWith("data:image/png;base64,")
    ? Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64")
    : null;

export const applicationPdfFileName = (application: MembershipApplication) =>
  `Mitgliedsantrag ${application.number} ${application.firstName} ${application.lastName}.pdf`;

export const createApplicationPdf = async (application: MembershipApplication) => {
  const { data } = application;
  const document = await PDFDocument.create();
  document.setTitle(`Mitgliedsantrag ${application.number}`);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN_BOTTOM) return;
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const write = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? BODY_SIZE;
    const lines = wrapText(text, font, size, options.width ?? CONTENT_WIDTH);
    ensureSpace(lines.length * size * 1.45);
    for (const line of lines) {
      page.drawText(line, {
        x: options.x ?? MARGIN_X,
        y,
        size,
        font,
        color: options.color ?? COLOR_TEXT,
      });
      y -= size * 1.45;
    }
  };

  const heading = (text: string) => {
    y -= 10;
    ensureSpace(40);
    write(text.toUpperCase(), { font: bold, size: 9, color: COLOR_MUTED });
    y -= 2;
  };

  const row = (label: string, value: string) => {
    const valueLines = wrapText(value || "—", regular, BODY_SIZE, CONTENT_WIDTH - LABEL_WIDTH);
    ensureSpace(valueLines.length * BODY_SIZE * 1.45);
    page.drawText(pdfSafeText(label), {
      x: MARGIN_X,
      y,
      size: BODY_SIZE,
      font: regular,
      color: COLOR_MUTED,
    });
    for (const line of valueLines) {
      page.drawText(line, { x: MARGIN_X + LABEL_WIDTH, y, size: BODY_SIZE, font: regular, color: COLOR_TEXT });
      y -= BODY_SIZE * 1.45;
    }
  };

  const signature = async (label: string, dataUrl: string | undefined) => {
    const bytes = pngBytes(dataUrl);
    heading(label);
    if (!bytes) {
      write("Liegt in Campai bzw. wurde nach der Übernahme gelöscht.", { color: COLOR_MUTED });
      return;
    }
    const image = await document.embedPng(bytes);
    const scale = Math.min(220 / image.width, 70 / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    ensureSpace(height + 30);
    page.drawImage(image, { x: MARGIN_X, y: y - height, width, height });
    y -= height + 6;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: MARGIN_X + 240, y },
      thickness: 0.5,
      color: COLOR_MUTED,
    });
    y -= 14;
    write(
      `${data.firstName} ${data.lastName} · digital unterschrieben am ${formatDate(application.createdAt)}`,
      { size: 9, color: COLOR_MUTED },
    );
  };

  write("Mitgliedsantrag Konglomerat e.V.", { font: bold, size: 18 });
  y -= 2;
  write(`${application.number} · eingegangen am ${formatDate(application.createdAt)}`, {
    color: COLOR_MUTED,
  });

  heading("Persönliche Daten");
  row("Name", `${data.firstName} ${data.lastName}`);
  row("E-Mail", data.email);
  row("Telefon", data.phone);
  row("Mobil", data.mobilePhone);
  row("Anschrift", `${data.street}, ${data.zip} ${data.city}`);

  const fee = describeFee(data);
  heading("Mitgliedschaft");
  row("Eintritt", formatDate(data.entryAt));
  row(
    "Jahresbeitrag",
    fee.euro === null ? "—" : `${fee.label} · ${formatEuro(fee.euro)}`,
  );
  if (data.trialRate && data.annualFee !== null) {
    row("Danach", `${formatEuro(data.annualFee)} pro Jahr`);
  }
  row("Zugangskarte", describeAccess(data));
  row("Zahlungsmittel", describePayment(data));
  if (data.paymentMethod === "sepaDirectDebit") {
    row("Kontoinhaber:in", data.accountHolder);
    row("IBAN", data.iban);
  }

  heading("Erklärungen");
  row("Satzung", data.statutesAccepted ? "gelesen und akzeptiert" : "nicht bestätigt");
  row("Beitragsordnung", data.feeRulesAccepted ? "gelesen und akzeptiert" : "nicht bestätigt");

  await signature("Unterschrift", application.signatures?.signature);
  if (data.paymentMethod === "sepaDirectDebit") {
    await signature("Unterschrift SEPA-Lastschriftmandat", application.signatures?.sepaSignature);
  }

  const changes = changedFields(application.submittedData, data);
  if (changes.length > 0) {
    heading("Vom Vorstand korrigiert");
    write("Oben steht der korrigierte Stand. Ursprünglich angegeben war:", {
      size: 9,
      color: COLOR_MUTED,
    });
    y -= 2;
    for (const change of changes) {
      row(change.label, `${change.from} (jetzt: ${change.to})`);
    }
  }

  return document.save();
};
