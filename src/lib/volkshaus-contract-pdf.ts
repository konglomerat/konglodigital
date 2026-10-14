import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  formatEuro,
  VOLKSHAUS_TAX_RATE,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 54;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 9.2;
const SURFACE_MARGIN_TOP = 6;
const SURFACE_MARGIN_BOTTOM = 14;

const COLOR_BLUE = rgb(0, 98 / 255, 174 / 255);
const COLOR_ORANGE = rgb(243 / 255, 146 / 255, 0);
const COLOR_TEXT = rgb(34 / 255, 34 / 255, 34 / 255);
const COLOR_MUTED = rgb(92 / 255, 103 / 255, 112 / 255);
const COLOR_BORDER = rgb(218 / 255, 228 / 255, 235 / 255);
const COLOR_SURFACE = rgb(238 / 255, 248 / 255, 255 / 255);

const VOLKSHAUS_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "branding",
  "logo",
  "vhc-bildmarke.png",
);

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
  const logo = await document.embedPng(await readFile(VOLKSHAUS_LOGO_PATH));
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
      lineHeight?: number;
      x?: number;
    },
  ) => {
    const font = options?.font ?? regular;
    const size = options?.size ?? BODY_SIZE;
    const lineHeight = options?.lineHeight ?? size * 1.42;
    ensureSpace(lines.length * lineHeight + (options?.gapAfter ?? 0));
    for (const line of lines) {
      page.drawText(pdfSafeText(line), {
        x: options?.x ?? MARGIN_X,
        y,
        size,
        font,
        color: options?.color ?? COLOR_TEXT,
      });
      y -= lineHeight;
    }
    y -= options?.gapAfter ?? 0;
  };

  const drawParagraph = (
    text: string,
    options?: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
      maxWidth?: number;
      x?: number;
    },
  ) => {
    const font = options?.font ?? regular;
    const size = options?.size ?? BODY_SIZE;
    drawLines(wrapText(text, font, size, options?.maxWidth ?? CONTENT_WIDTH), {
      ...options,
      font,
      size,
    });
  };

  const drawSectionHeading = (heading: string) => {
    ensureSpace(28);
    const hasAccent =
      heading !== "1. Vertragsgegenstand und Nutzungszweck" &&
      heading !== "2. Übergabe";
    if (hasAccent) {
      page.drawRectangle({
        x: MARGIN_X,
        y: y - 2,
        width: 3,
        height: 13,
        color: COLOR_ORANGE,
      });
    }
    page.drawText(pdfSafeText(heading), {
      x: MARGIN_X + (hasAccent ? 10 : 0),
      y,
      size: 11,
      font: bold,
      color: COLOR_BLUE,
    });
    y -= 20;
  };

  type Card = {
    eyebrow: string;
    title: string;
    lines: string[];
  };

  const drawTwoCards = (left: Card, right: Card) => {
    const gap = 12;
    const width = (CONTENT_WIDTH - gap) / 2;
    const innerWidth = width - 22;
    const titleSize = 9.2;
    const detailSize = 8.2;
    const measure = (card: Card) => {
      const titleLines = wrapText(card.title, bold, titleSize, innerWidth);
      const detailLines = card.lines.flatMap((line) =>
        wrapText(line, regular, detailSize, innerWidth),
      );
      return {
        titleLines,
        detailLines,
        height:
          12 +
          9 +
          5 +
          titleLines.length * 11.5 +
          detailLines.length * 10.5 +
          10,
      };
    };
    const leftLayout = measure(left);
    const rightLayout = measure(right);
    const height = Math.max(leftLayout.height, rightLayout.height, 78);
    ensureSpace(height + SURFACE_MARGIN_TOP + SURFACE_MARGIN_BOTTOM);
    y -= SURFACE_MARGIN_TOP;
    const top = y;

    const drawCard = (
      x: number,
      card: Card,
      layout: ReturnType<typeof measure>,
    ) => {
      page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        color: COLOR_SURFACE,
      });
      page.drawRectangle({
        x,
        y: top - 3,
        width,
        height: 3,
        color: COLOR_BLUE,
      });

      let cardY = top - 16;
      page.drawText(pdfSafeText(card.eyebrow.toUpperCase()), {
        x: x + 11,
        y: cardY,
        size: 7.2,
        font: bold,
        color: COLOR_BLUE,
      });
      cardY -= 14;
      for (const line of layout.titleLines) {
        page.drawText(line, {
          x: x + 11,
          y: cardY,
          size: titleSize,
          font: bold,
          color: COLOR_TEXT,
        });
        cardY -= 11.5;
      }
      cardY -= 1;
      for (const line of layout.detailLines) {
        page.drawText(line, {
          x: x + 11,
          y: cardY,
          size: detailSize,
          font: regular,
          color: COLOR_MUTED,
        });
        cardY -= 10.5;
      }
    };

    drawCard(MARGIN_X, left, leftLayout);
    drawCard(MARGIN_X + width + gap, right, rightLayout);
    y = top - height - SURFACE_MARGIN_BOTTOM;
  };

  const drawInfoBlock = (
    title: string,
    items: Array<{ label: string; value: string }>,
  ) => {
    const padding = 12;
    const labelWidth = 90;
    const valueWidth = CONTENT_WIDTH - padding * 2 - labelWidth;
    const valueSize = 8.6;
    const rowLayouts = items.map((item) => ({
      ...item,
      lines: wrapText(item.value, regular, valueSize, valueWidth),
    }));
    const height =
      37 +
      rowLayouts.reduce(
        (sum, item) => sum + Math.max(11, item.lines.length * 10.8) + 4,
        0,
      ) +
      6;
    ensureSpace(height + SURFACE_MARGIN_TOP + SURFACE_MARGIN_BOTTOM);
    y -= SURFACE_MARGIN_TOP;
    const top = y;
    page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: COLOR_SURFACE,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: 3,
      height,
      color: COLOR_BLUE,
    });
    page.drawText(pdfSafeText(title), {
      x: MARGIN_X + padding,
      y: top - 18,
      size: 9.2,
      font: bold,
      color: COLOR_BLUE,
    });

    let rowY = top - 36;
    for (const item of rowLayouts) {
      page.drawText(pdfSafeText(item.label), {
        x: MARGIN_X + padding,
        y: rowY,
        size: 8.1,
        font: bold,
        color: COLOR_MUTED,
      });
      for (const line of item.lines) {
        page.drawText(line, {
          x: MARGIN_X + padding + labelWidth,
          y: rowY,
          size: valueSize,
          font: regular,
          color: COLOR_TEXT,
        });
        rowY -= 10.8;
      }
      rowY -= 4;
    }
    y = top - height - SURFACE_MARGIN_BOTTOM;
  };

  const drawPriceBlock = () => {
    const padding = 12;
    const amountWidth = 92;
    const descriptionWidth = CONTENT_WIDTH - padding * 2 - amountWidth;
    const lineSize = 8.5;
    const rows = snapshot.price.lines.map((line) => ({
      lines: wrapText(line.description, regular, lineSize, descriptionWidth),
      amount: `${formatEuro(line.totalNetCents)} netto`,
    }));
    const lineRowsHeight = rows.reduce(
      (sum, row) => sum + Math.max(11, row.lines.length * 10.8) + 3,
      0,
    );
    const height = 38 + lineRowsHeight + 55;
    if (
      y - height - SURFACE_MARGIN_TOP - SURFACE_MARGIN_BOTTOM <
      MARGIN_BOTTOM
    ) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
      drawSectionHeading("4. Nutzungsentgelt (Fortsetzung)");
    }
    ensureSpace(height + SURFACE_MARGIN_TOP + SURFACE_MARGIN_BOTTOM);
    y -= SURFACE_MARGIN_TOP;
    const top = y;
    const right = MARGIN_X + CONTENT_WIDTH - padding;

    page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: COLOR_SURFACE,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: top - height,
      width: 3,
      height,
      color: COLOR_BLUE,
    });
    page.drawText("Entgeltübersicht", {
      x: MARGIN_X + padding,
      y: top - 18,
      size: 9.2,
      font: bold,
      color: COLOR_BLUE,
    });

    let rowY = top - 37;
    for (const row of rows) {
      const rowTop = rowY;
      for (const line of row.lines) {
        page.drawText(line, {
          x: MARGIN_X + padding,
          y: rowY,
          size: lineSize,
          font: regular,
          color: COLOR_TEXT,
        });
        rowY -= 10.8;
      }
      page.drawText(row.amount, {
        x: right - regular.widthOfTextAtSize(row.amount, lineSize),
        y: rowTop,
        size: lineSize,
        font: regular,
        color: COLOR_TEXT,
      });
      rowY -= 3;
    }

    rowY -= 1;
    page.drawLine({
      start: { x: MARGIN_X + padding, y: rowY },
      end: { x: right, y: rowY },
      thickness: 0.6,
      color: COLOR_BORDER,
    });
    rowY -= 13;

    const totals = [
      ["Nettosumme", formatEuro(snapshot.price.netCents)],
      [
        `Umsatzsteuer (${VOLKSHAUS_TAX_RATE} %)`,
        formatEuro(snapshot.price.taxCents),
      ],
      ["Gesamtbetrag", formatEuro(snapshot.price.grossCents)],
    ] as const;
    for (const [label, value] of totals) {
      const isTotal = label === "Gesamtbetrag";
      const font = isTotal ? bold : regular;
      const color = isTotal ? COLOR_BLUE : COLOR_TEXT;
      page.drawText(label, {
        x: MARGIN_X + padding,
        y: rowY,
        size: isTotal ? 9.2 : 8.4,
        font,
        color,
      });
      page.drawText(value, {
        x: right - font.widthOfTextAtSize(value, isTotal ? 9.2 : 8.4),
        y: rowY,
        size: isTotal ? 9.2 : 8.4,
        font,
        color,
      });
      rowY -= isTotal ? 12 : 10.5;
    }
    y = top - height - SURFACE_MARGIN_BOTTOM;
  };

  const drawListItem = (
    text: string,
    marker: { type: "bullet" } | { type: "number"; value: number },
  ) => {
    const textX = MARGIN_X + 17;
    const lines = wrapText(text, regular, BODY_SIZE, CONTENT_WIDTH - 17);
    const lineHeight = BODY_SIZE * 1.38;
    ensureSpace(lines.length * lineHeight + 5);
    const top = y;
    if (marker.type === "bullet") {
      page.drawCircle({
        x: MARGIN_X + 4,
        y: top + 3,
        size: 1.6,
        color: COLOR_BLUE,
      });
    } else {
      page.drawText(`${marker.value}.`, {
        x: MARGIN_X,
        y: top,
        size: 8.5,
        font: bold,
        color: COLOR_BLUE,
      });
    }
    for (const line of lines) {
      page.drawText(line, {
        x: textX,
        y,
        size: BODY_SIZE,
        font: regular,
        color: COLOR_TEXT,
      });
      y -= lineHeight;
    }
    y -= 4;
  };

  const logoSize = 62;
  page.drawImage(logo, {
    x: PAGE_WIDTH - MARGIN_X - logoSize,
    y: PAGE_HEIGHT - MARGIN_TOP - logoSize + 5,
    width: logoSize,
    height: logoSize,
  });
  page.drawText("NUTZUNGSVEREINBARUNG", {
    x: MARGIN_X,
    y: y - 7,
    size: 17.5,
    font: bold,
    color: COLOR_BLUE,
  });
  page.drawText(`Neues Volkshaus Cotta · ${snapshot.referenceCode}`, {
    x: MARGIN_X,
    y: y - 27,
    size: 9.7,
    font: bold,
    color: COLOR_TEXT,
  });
  y -= 66;

  drawParagraph(
    "Zwischen den folgenden Vertragsparteien wird diese Nutzungsvereinbarung geschlossen:",
    { gapAfter: 10 },
  );

  const customerTitle = snapshot.customer.organization || snapshot.customer.name;
  const customerLines = [
    ...(snapshot.customer.organization
      ? [`Vertreten durch: ${snapshot.customer.name}`]
      : []),
    snapshot.customer.address,
    ...(snapshot.customer.email ? [snapshot.customer.email] : []),
    ...(snapshot.customer.phone ? [snapshot.customer.phone] : []),
  ];
  drawTwoCards(
    {
      eyebrow: "Anbieter",
      title: snapshot.provider.name,
      lines: [
        snapshot.provider.address,
        `Vertreten durch: ${snapshot.provider.representedBy ?? "Projekt #VHC"}`,
      ],
    },
    {
      eyebrow: "Nutzende Partei",
      title: customerTitle,
      lines: customerLines,
    },
  );

  for (const section of snapshot.terms) {
    drawSectionHeading(section.heading);

    if (section.heading.startsWith("2.")) {
      section.paragraphs.forEach((paragraph, index) =>
        drawListItem(paragraph, { type: "number", value: index + 1 }),
      );
    } else if (section.heading.startsWith("5.")) {
      section.paragraphs.forEach((paragraph) =>
        drawListItem(paragraph, { type: "bullet" }),
      );
    } else {
      for (const paragraph of section.paragraphs) {
        drawParagraph(paragraph, { gapAfter: 4 });
      }
    }

    if (section.heading.startsWith("1.")) {
      drawInfoBlock("Nutzungsdaten", [
        { label: "Nutzungszweck", value: snapshot.event.title },
        { label: "Beschreibung", value: snapshot.event.description },
        { label: "Räume", value: snapshot.event.rooms.join(", ") },
        {
          label: "Umfang",
          value:
            snapshot.event.frequency === "recurring"
              ? `${snapshot.event.recurringOccurrences} Termin(e) pro Monat`
              : "Einmalige Nutzung",
        },
      ]);
    }

    if (section.heading.startsWith("4.")) {
      drawPriceBlock();
      drawInfoBlock("Zahlungsinformationen", [
        { label: "Empfänger", value: "Konglomerat e.V." },
        { label: "Bank", value: "Skatbank Altenburg" },
        { label: "IBAN", value: "DE02 8306 5408 0004 7788 12" },
        {
          label: "Verwendungszweck",
          value: `Raummiete #VHC · ${snapshot.referenceCode}`,
        },
      ]);
    }
  }

  ensureSpace(65);
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.7,
    color: COLOR_BORDER,
  });
  y -= 12;
  page.drawText("Elektronische Unterschriften", {
    x: MARGIN_X,
    y,
    size: 10.5,
    font: bold,
    color: COLOR_BLUE,
  });
  const checksumLabel = `Vertrags-Prüfsumme: ${booking.contractHash ?? "nicht vorhanden"}`;
  const checksumSize = 6.2;
  page.drawText(checksumLabel, {
    x:
      PAGE_WIDTH -
      MARGIN_X -
      regular.widthOfTextAtSize(checksumLabel, checksumSize),
    y: y + 1,
    size: checksumSize,
    font: regular,
    color: COLOR_MUTED,
  });
  y -= 13;
  const customerSignature = booking.customerSignature;
  const staffSignature = booking.staffSignature;
  y -= SURFACE_MARGIN_TOP;
  const signatureTop = y;
  const signatureHeight = 40;
  const signatureColumnWidth = CONTENT_WIDTH / 2;
  page.drawRectangle({
    x: MARGIN_X,
    y: signatureTop - signatureHeight,
    width: CONTENT_WIDTH,
    height: signatureHeight,
    color: COLOR_SURFACE,
  });
  page.drawLine({
    start: { x: MARGIN_X + signatureColumnWidth, y: signatureTop },
    end: {
      x: MARGIN_X + signatureColumnWidth,
      y: signatureTop - signatureHeight,
    },
    thickness: 0.7,
    color: COLOR_BORDER,
  });

  const drawSignatureColumn = (
    x: number,
    role: string,
    signature: typeof customerSignature,
  ) => {
    page.drawText(role.toUpperCase(), {
      x: x + 11,
      y: signatureTop - 10,
      size: 6.8,
      font: bold,
      color: COLOR_BLUE,
    });
    page.drawText(signature?.name ?? "Noch nicht unterschrieben", {
      x: x + 11,
      y: signatureTop - 22,
      size: 8.8,
      font: bold,
      color: COLOR_TEXT,
    });
    page.drawText(
      signature
        ? `Unterschrieben am ${formatDateTime(signature.signedAt)}`
        : "Status: ausstehend",
      {
        x: x + 11,
        y: signatureTop - 33,
        size: 7.3,
        font: regular,
        color: COLOR_MUTED,
      },
    );
  };

  drawSignatureColumn(MARGIN_X, "Nutzende Partei", customerSignature);
  drawSignatureColumn(
    MARGIN_X + signatureColumnWidth,
    "Anbieter",
    staffSignature,
  );
  y = signatureTop - signatureHeight - SURFACE_MARGIN_BOTTOM;

  for (const [index, currentPage] of document.getPages().entries()) {
    currentPage.drawLine({
      start: { x: MARGIN_X, y: 40 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 40 },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
    currentPage.drawText(
      `Konglomerat e.V. · Neues Volkshaus Cotta · ${booking.referenceCode}`,
      {
        x: MARGIN_X,
        y: 26,
        size: 7.2,
        font: regular,
        color: COLOR_MUTED,
      },
    );
    const pageLabel = `Seite ${index + 1} von ${document.getPageCount()}`;
    currentPage.drawText(pageLabel, {
      x:
        PAGE_WIDTH -
        MARGIN_X -
        regular.widthOfTextAtSize(pageLabel, 7.2),
      y: 26,
      size: 7.2,
      font: regular,
      color: COLOR_MUTED,
    });
  }

  document.setTitle(`Nutzungsvereinbarung ${booking.referenceCode}`);
  document.setAuthor("Konglomerat e.V.");
  document.setSubject("Nutzungsvereinbarung Neues Volkshaus Cotta");
  document.setCreator("KongloDigital");

  return document.save();
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
