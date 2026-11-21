// Export der Belegtabelle als CSV, XLSX oder PDF. Die Bibliotheken für XLSX
// und PDF werden erst beim Export geladen.
import type { SheetData } from "write-excel-file/browser";

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type ExportColumn = {
  label: string;
  /** amount: Cent-Beträge, date: ISO-Zeitstempel, text: alles andere. */
  kind: "text" | "amount" | "date";
  /** Ungefähre Breite in Zeichen (XLSX) bzw. Gewicht (PDF). */
  width?: number;
};

// Cent-Betrag als Zahl, Datum als ISO-String, sonst Text.
export type ExportCell = string | number | null;

export type ExportTable = {
  /** Dateiname ohne Endung. */
  fileName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  /** Saldo-Zeile unter der Tabelle, z. B. Einnahmen / Ausgaben / Guthaben. */
  summary?: { label: string; value: string }[];
};

const formatCentsPlain = (cents: number): string =>
  (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCentsWithEuro = (cents: number): string =>
  `${formatCentsPlain(cents)} €`;

const parseDate = (value: string): Date | null => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
};

const formatDate = (value: string): string => {
  const date = parseDate(value);
  if (!date) {
    return value;
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
};

const formatCellText = (
  cell: ExportCell,
  column: ExportColumn,
  formatAmount: (cents: number) => string,
): string => {
  if (cell === null) {
    return "";
  }
  if (typeof cell === "number") {
    return column.kind === "amount" ? formatAmount(cell) : String(cell);
  }
  return column.kind === "date" ? formatDate(cell) : cell;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

// Semikolon und Dezimalkomma, mit BOM — so öffnet ein deutsches Excel die
// Datei direkt richtig.
const exportCsv = (table: ExportTable) => {
  const escape = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [
    table.columns.map((column) => escape(column.label)).join(";"),
    ...table.rows.map((row) =>
      row
        .map((cell, index) =>
          escape(formatCellText(cell, table.columns[index], formatCentsPlain)),
        )
        .join(";"),
    ),
  ];

  downloadBlob(
    new Blob([`﻿${lines.join("\r\n")}\r\n`], {
      type: "text/csv;charset=utf-8",
    }),
    `${table.fileName}.csv`,
  );
};

const exportXlsx = async (table: ExportTable) => {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const header = table.columns.map((column) => ({
    value: column.label,
    fontWeight: "bold" as const,
    backgroundColor: "#EEEEEE",
  }));

  const body: SheetData = table.rows.map((row) =>
    row.map((cell, index) => {
      const column = table.columns[index];
      if (cell === null) {
        return null;
      }
      if (column.kind === "amount" && typeof cell === "number") {
        return { value: cell / 100, type: Number, format: "#,##0.00 €" };
      }
      if (column.kind === "date" && typeof cell === "string") {
        // Nur der Kalendertag in Ortszeit, wie in der Tabelle — Excel kennt
        // keine Zeitzonen und würde sonst den UTC-Zeitpunkt zeigen.
        const date = parseDate(cell);
        return date
          ? {
              value: new Date(
                Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
              ),
              type: Date,
              format: "dd.mm.yyyy",
            }
          : { value: cell, type: String };
      }
      return { value: String(cell), type: String };
    }),
  );

  const blob = await writeXlsxFile([header, ...body], {
    sheet: "Belege",
    stickyRowsCount: 1,
    columns: table.columns.map((column) => ({
      width: column.width ?? (column.kind === "text" ? 20 : 13),
    })),
  }).toBlob();

  downloadBlob(blob, `${table.fileName}.xlsx`);
};

const fontCache = new Map<string, string>();

const loadFontAsBase64 = async (url: string): Promise<string> => {
  const cached = fontCache.get(url);
  if (cached) {
    return cached;
  }
  const buffer = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const base64 = btoa(binary);
  fontCache.set(url, base64);
  return base64;
};

const exportPdf = async (table: ExportTable) => {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Fira Sans wie im Eigenbeleg; ohne Schrift bleibt es bei Helvetica.
  let fontFamily = "helvetica";
  try {
    await Promise.all(
      [
        { file: "FiraSans-Regular.ttf", style: "normal" },
        { file: "FiraSans-Bold.ttf", style: "bold" },
      ].map(async ({ file, style }) => {
        doc.addFileToVFS(file, await loadFontAsBase64(`/fonts/${file}`));
        doc.addFont(file, "FiraSans", style);
      }),
    );
    fontFamily = "FiraSans";
  } catch {
    // Helvetica reicht für Umlaute und €.
  }

  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont(fontFamily, "bold");
  doc.setFontSize(14);
  doc.text(table.title, margin, margin + 5);

  let startY = margin + 9;
  if (table.subtitle) {
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(table.subtitle, margin, margin + 10);
    doc.setTextColor(0);
    startY = margin + 14;
  }

  const totalWeight = table.columns.reduce(
    (sum, column) => sum + (column.width ?? (column.kind === "text" ? 20 : 13)),
    0,
  );
  const usableWidth = pageWidth - margin * 2;

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin, bottom: margin + 4 },
    head: [table.columns.map((column) => column.label)],
    body: table.rows.map((row) =>
      row.map((cell, index) =>
        formatCellText(cell, table.columns[index], formatCentsWithEuro),
      ),
    ),
    styles: {
      font: fontFamily,
      fontSize: 7.5,
      cellPadding: 1.5,
      overflow: "linebreak",
      lineColor: 220,
      lineWidth: 0.1,
      textColor: 20,
    },
    headStyles: {
      fillColor: [238, 238, 238],
      textColor: 0,
      fontStyle: "bold",
    },
    columnStyles: Object.fromEntries(
      table.columns.map((column, index) => [
        index,
        {
          cellWidth:
            ((column.width ?? (column.kind === "text" ? 20 : 13)) /
              totalWeight) *
            usableWidth,
          halign: column.kind === "amount" ? "right" : "left",
        },
      ]),
    ),
    // columnStyles gelten nur für den Tabellenkörper.
    didParseCell: (data) => {
      if (
        data.section === "head" &&
        table.columns[data.column.index]?.kind === "amount"
      ) {
        data.cell.styles.halign = "right";
      }
    },
  });

  if (table.summary && table.summary.length > 0) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? startY;
    let summaryY = finalY + 7;
    if (summaryY > pageHeight - margin - 4) {
      doc.addPage();
      summaryY = margin + 5;
    }

    doc.setFontSize(9);
    let x = pageWidth - margin;
    for (const item of [...table.summary].reverse()) {
      doc.setFont(fontFamily, "bold");
      doc.text(item.value, x, summaryY, { align: "right" });
      x -= doc.getTextWidth(item.value) + 1.5;
      doc.setFont(fontFamily, "normal");
      doc.text(item.label, x, summaryY, { align: "right" });
      x -= doc.getTextWidth(item.label) + 8;
    }
  }

  // Seitenzahlen erst am Ende, wenn die Gesamtzahl feststeht.
  const pageCount = doc.getNumberOfPages();
  const createdLabel = `Erstellt am ${formatDate(new Date().toISOString())}`;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.text(createdLabel, margin, pageHeight - margin / 2);
    doc.text(`Seite ${page} von ${pageCount}`, pageWidth - margin, pageHeight - margin / 2, {
      align: "right",
    });
  }

  doc.save(`${table.fileName}.pdf`);
};

export const exportTable = async (
  table: ExportTable,
  format: ExportFormat,
): Promise<void> => {
  if (format === "csv") {
    exportCsv(table);
    return;
  }
  if (format === "xlsx") {
    await exportXlsx(table);
    return;
  }
  await exportPdf(table);
};
