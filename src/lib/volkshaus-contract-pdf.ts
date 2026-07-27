import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  formatEuro,
  type VolkshausBooking,
  type VolkshausContractSnapshot,
} from "@/lib/volkshaus-booking";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 54;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 54;
const BODY_SIZE = 9.5;

const pdfSafeText = (value: string) =>
  value
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("×", "x")
    .replaceAll("„", '"')
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("…", "...")
    .replaceAll("\u00a0", " ");

const wrapText = (
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) => {
  const words = pdfSafeText(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
};

export const createVolkshausContractPdf = async (
  booking: VolkshausBooking,
) => {
  const snapshot = booking.contractSnapshot;
  if (!snapshot) {
    throw new Error("Für diese Anfrage wurde noch kein Vertrag erzeugt.");
  }

  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN_BOTTOM) {
      return;
    }
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const drawLines = (
    lines: string[],
    options?: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
    },
  ) => {
    const font = options?.font ?? regular;
    const size = options?.size ?? BODY_SIZE;
    const lineHeight = size * 1.42;
    ensureSpace(lines.length * lineHeight + (options?.gapAfter ?? 0));
    for (const line of lines) {
      page.drawText(pdfSafeText(line), {
        x: MARGIN_X,
        y,
        size,
        font,
        color: options?.color ?? rgb(0.12, 0.12, 0.14),
      });
      y -= lineHeight;
    }
    y -= options?.gapAfter ?? 0;
  };

  const drawParagraph = (
    text: string,
    options?: { font?: PDFFont; size?: number; gapAfter?: number },
  ) => {
    const font = options?.font ?? regular;
    const size = options?.size ?? BODY_SIZE;
    drawLines(
      wrapText(text, font, size, PAGE_WIDTH - MARGIN_X * 2),
      options,
    );
  };

  drawLines(["NUTZUNGSVEREINBARUNG"], {
    font: bold,
    size: 18,
    color: rgb(0.79, 0.04, 0.3),
    gapAfter: 4,
  });
  drawLines([`Neues Volkshaus Cotta · ${snapshot.referenceCode}`], {
    font: bold,
    size: 10,
    gapAfter: 18,
  });

  drawParagraph("Zwischen", { font: bold, gapAfter: 4 });
  drawLines([snapshot.provider.name, snapshot.provider.address], {
    gapAfter: 5,
  });
  drawParagraph('- nachfolgend "Anbieter" genannt -', { gapAfter: 8 });
  drawParagraph("und", { font: bold, gapAfter: 4 });
  drawLines(
    [
      snapshot.customer.organization || snapshot.customer.name,
      ...(snapshot.customer.organization ? [snapshot.customer.name] : []),
      snapshot.customer.address,
    ],
    { gapAfter: 5 },
  );
  drawParagraph('- nachfolgend "Nutzer" genannt -', { gapAfter: 16 });

  drawParagraph("wird nachfolgende Vereinbarung geschlossen:", {
    gapAfter: 14,
  });

  drawContractBody(snapshot, drawParagraph, bold, ensureSpace);

  ensureSpace(130);
  y -= 8;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.6,
    color: rgb(0.65, 0.65, 0.68),
  });
  y -= 20;
  drawParagraph("Elektronische Unterschriften", {
    font: bold,
    size: 11,
    gapAfter: 8,
  });

  const signatureLines = [
    booking.customerSignature
      ? `Nutzer: ${booking.customerSignature.name}, unterschrieben am ${formatDateTime(booking.customerSignature.signedAt)}`
      : "Nutzer: noch nicht unterschrieben",
    booking.staffSignature
      ? `Anbieter: ${booking.staffSignature.name}, gegengezeichnet am ${formatDateTime(booking.staffSignature.signedAt)}`
      : "Anbieter: noch nicht gegengezeichnet",
    `Vertrags-Prüfsumme: ${booking.contractHash ?? "nicht vorhanden"}`,
  ];
  drawLines(signatureLines, { size: 8.5, gapAfter: 6 });

  for (const [index, currentPage] of document.getPages().entries()) {
    currentPage.drawText(
      `Konglomerat e.V. · ${booking.referenceCode} · Seite ${index + 1} von ${document.getPageCount()}`,
      {
        x: MARGIN_X,
        y: 28,
        size: 7.5,
        font: regular,
        color: rgb(0.42, 0.42, 0.45),
      },
    );
  }

  document.setTitle(`Nutzungsvereinbarung ${booking.referenceCode}`);
  document.setAuthor("Konglomerat e.V.");
  document.setSubject("Nutzungsvereinbarung Neues Volkshaus Cotta");
  document.setCreator("KongloDigital");

  return document.save();
};

const drawContractBody = (
  snapshot: VolkshausContractSnapshot,
  drawParagraph: (
    text: string,
    options?: { font?: PDFFont; size?: number; gapAfter?: number },
  ) => void,
  headingFont: PDFFont,
  ensureSpace: (height: number) => void,
) => {
  for (const section of snapshot.terms) {
    if (section.heading.startsWith("4.")) {
      ensureSpace(90 + (snapshot.price.lines.length + 1) * 15);
    }
    drawParagraph(section.heading, {
      font: headingFont,
      size: 11,
      gapAfter: 5,
    });
    for (const paragraph of section.paragraphs) {
      drawParagraph(paragraph, { gapAfter: 6 });
    }

    if (section.heading.startsWith("1.")) {
      drawParagraph(`Nutzungszweck: ${snapshot.event.title}`, {
        gapAfter: 3,
      });
      drawParagraph(`Beschreibung: ${snapshot.event.description}`, {
        gapAfter: 3,
      });
      drawParagraph(`Räume: ${snapshot.event.rooms.join(", ")}`, {
        gapAfter: 3,
      });
      drawParagraph(
        `Zeitlicher Umfang: ${snapshot.event.date}, ${snapshot.event.startTime}-${snapshot.event.endTime} Uhr`,
        { gapAfter: 8 },
      );
    }

    if (section.heading.startsWith("4.")) {
      for (const line of snapshot.price.lines) {
        drawParagraph(
          `${line.description}: ${formatEuro(line.totalNetCents)} netto`,
          { size: 8.7, gapAfter: 2 },
        );
      }
      drawParagraph(
        `Gesamt: ${formatEuro(snapshot.price.netCents)} netto + ${formatEuro(snapshot.price.taxCents)} Umsatzsteuer = ${formatEuro(snapshot.price.grossCents)} brutto`,
        { gapAfter: 8 },
      );
    }
  }
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
