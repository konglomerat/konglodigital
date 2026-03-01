"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faCartShopping,
  faFolderOpen,
  faRightToBracket,
  faRightFromBracket,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import {
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "../components/ui/form";

const reasonOptions = [
  "Umbuchung",
  "Mitgliedsbeitrag",
  "Ehrenamtspauschale",
  "Eingang Fördermittel",
  "Mietkosten Raum",
  "Nebenkosten Raum",
  "Einzahlung von Kasse",
  "Barabhebung",
  "Lohnzahlungen",
  "Krankenkassenbeitrag",
  "Sonstiges",
] as const;

type ReasonOption = (typeof reasonOptions)[number];

type FormValues = {
  email: string;
  reason: ReasonOption;
  reasonOther?: string;
  occasion: string;
  documentReference?: string;
  transactionDate: string;
  evidence?: FileList;
  income?: string;
  expense?: string;
  transferAmount?: string;
  senderName: string;
  senderAdditional?: string;
  senderAccount?: string;
  senderArea?: string;
  senderProject?: string;
  senderSplit?: string;
  receiverName: string;
  receiverAdditional?: string;
  receiverAccount?: string;
  receiverArea?: string;
  receiverProject?: string;
  receiverSplit?: string;
  invoiceStatus: "offen" | "bezahlt";
  notes?: string;
};

const testFormData: Omit<FormValues, "evidence"> = {
  email: "test@konglomerat.org",
  reason: "Umbuchung",
  reasonOther: "",
  occasion: "Umbuchung zwischen Bereichskonten für Materialkosten.",
  documentReference: "Beschluss Plenum 2026-02 / interne Notiz 14",
  transactionDate: "2026-02-26",
  income: "1200,00",
  expense: "350,00",
  transferAmount: "75,00",
  senderName: "Konglomerat e.V.",
  senderAdditional: "Kopenhagener Str. 46, 10437 Berlin",
  senderAccount: "K0004 B",
  senderArea: "_Holz",
  senderProject: "#Foerderprojekt2026",
  senderSplit: "Materialbudget Q1",
  receiverName: "Konglomerat e.V.",
  receiverAdditional: "Werkbereich Metall",
  receiverAccount: "K0104 A",
  receiverArea: "_Metall",
  receiverProject: "#Vereinsprojekt",
  receiverSplit: "Unterkonto Verbrauchsmaterial",
  invoiceStatus: "bezahlt",
  notes: "Testdatensatz für interne Formularprüfung.",
};

const amountPattern = /^\d+(?:[.,]\d{1,2})?$/;

function getFormattedDate(value: string) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString("de-DE");
}

function normalizeValue(value?: string) {
  if (!value) {
    return "-";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "-";
}

function generateBelegnummer(date: string) {
  const d = date ? new Date(date) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `EGB${yy}${mm}${dd}${hh}${mi}${ss}`;
}

function formatAmount(value?: string) {
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num)) return value.trim();
  return num.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildSenderLine(values: FormValues) {
  const parts = [values.senderName];
  if (values.senderAccount?.trim()) parts.push(`– ${values.senderAccount.trim()} –`);
  if (values.senderArea?.trim()) parts.push(`– ${values.senderArea.trim()} –`);
  if (values.senderProject?.trim()) parts.push(values.senderProject.trim());
  if (values.senderSplit?.trim()) parts.push(`(${values.senderSplit.trim()})`);
  return parts.join(" ");
}

function buildReceiverLine(values: FormValues) {
  const parts = [values.receiverName];
  if (values.receiverAccount?.trim()) parts.push(`– ${values.receiverAccount.trim()} –`);
  if (values.receiverArea?.trim()) parts.push(`– ${values.receiverArea.trim()} –`);
  if (values.receiverProject?.trim()) parts.push(values.receiverProject.trim());
  if (values.receiverSplit?.trim()) parts.push(`(${values.receiverSplit.trim()})`);
  return parts.join(" ");
}

async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const response = await fetch("/konglodigital-logo.svg");
    const svgText = await response.text();
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = "anonymous";

    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const fontCache = new Map<string, string>();

async function loadFontAsBase64(url: string): Promise<string> {
  if (fontCache.has(url)) return fontCache.get(url)!;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  fontCache.set(url, base64);
  return base64;
}

async function registerFiraSansFonts(doc: jsPDF) {
  const fonts = [
    { file: "FiraSans-Regular.ttf", family: "FiraSans", style: "normal" },
    { file: "FiraSans-Bold.ttf", family: "FiraSans", style: "bold" },
    { file: "FiraSans-ExtraBold.ttf", family: "FiraSansExtraBold", style: "bold" },
    { file: "FiraSansCondensed-Regular.ttf", family: "FiraSansCondensed", style: "normal" },
    { file: "FiraSansCondensed-Bold.ttf", family: "FiraSansCondensed", style: "bold" },
  ];

  await Promise.all(
    fonts.map(async ({ file, family, style }) => {
      const base64 = await loadFontAsBase64(`/fonts/${file}`);
      doc.addFileToVFS(file, base64);
      doc.addFont(file, family, style);
    }),
  );
}

async function createEigenbelegPdf(values: FormValues) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a5",
  });

  // ── Register Fira Sans fonts ──
  await registerFiraSansFonts(doc);

  const pageW = doc.internal.pageSize.getWidth(); // ~210
  const pageH = doc.internal.pageSize.getHeight(); // ~148
  const margin = 16;
  const contentW = pageW - margin * 2; // ~178
  const leftColW = contentW * 0.634; // ~113 – matches template 326.2/514.4
  const rightColX = margin + leftColW + 3;
  const rightColW = contentW - leftColW - 3; // ~62
  const belegnummer = generateBelegnummer(values.transactionDate);

  // ── colours (from template HTML) ──
  const dark: [number, number, number] = [34, 34, 34]; // #222222
  const dashColor: [number, number, number] = [67, 67, 67]; // #434343
  const muted: [number, number, number] = [102, 102, 102]; // #666666

  // ── helper: dashed separator line ──
  const drawDashedLine = (yPos: number, x1 = margin, x2 = margin + leftColW) => {
    doc.setDrawColor(...dashColor);
    doc.setLineWidth(0.5);
    const dashLen = 2;
    const gapLen = 1.5;
    let x = x1;
    while (x < x2) {
      const end = Math.min(x + dashLen, x2);
      doc.line(x, yPos, end, yPos);
      x = end + gapLen;
    }
  };

  // ── Row 1: Title "Eigenbeleg" (right-aligned in left column) ──
  let y = margin + 3;
  doc.setFont("FiraSansExtraBold", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...dark);
  doc.text("Eigenbeleg", margin + leftColW, y, { align: "right" });

  // ── Logo (top-right, spanning rows 1+2) ──
  const logoDataUrl = await loadLogoAsDataUrl();
  const logoW = 55;
  const logoH = 18;
  if (logoDataUrl) {
    doc.addImage(
      logoDataUrl,
      "PNG",
      pageW - margin - logoW,
      margin - 2,
      logoW,
      logoH,
    );
  }

  // ── Dashed line below title ──
  y += 3;
  drawDashedLine(y);

  // ── Row 2: Beleg für / Von / An ──
  y += 6;
  const reasonText =
    values.reason === "Sonstiges" && values.reasonOther?.trim()
      ? values.reasonOther.trim()
      : values.reason;
  doc.setFont("FiraSans", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(`Beleg für: ${reasonText.toUpperCase()}`, margin, y);

  // Von:
  y += 8;
  doc.setFont("FiraSansCondensed", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text("Von:", margin, y);
  doc.setFont("FiraSansCondensed", "normal");
  doc.setFontSize(10);
  const senderText = buildSenderLine(values);
  const senderLines = doc.splitTextToSize(senderText, leftColW - 18);
  doc.text(senderLines, margin + 14, y);
  y += senderLines.length * 4.5 + 2;

  // An:
  doc.setFont("FiraSansCondensed", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text("An:", margin, y);
  doc.setFont("FiraSansCondensed", "normal");
  doc.setFontSize(10);
  const receiverText = buildReceiverLine(values);
  const receiverLines = doc.splitTextToSize(receiverText, leftColW - 18);
  doc.text(receiverLines, margin + 14, y);
  y += receiverLines.length * 4.5 + 4;

  // ── Row 3: Anlass (left) | Gesamtbetrag + Datum (right) ──
  const row3Y = y + 2;

  // -- Left: Anlass --
  let leftY = row3Y;
  doc.setFont("FiraSansExtraBold", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text("Anlass:", margin, leftY);
  leftY += 6;

  doc.setFont("FiraSansCondensed", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  const occasionLines = doc.splitTextToSize(
    normalizeValue(values.occasion),
    leftColW - 2,
  );
  doc.text(occasionLines, margin, leftY);
  leftY += occasionLines.length * 4.5 + 3;

  // -- Verweis --
  if (values.documentReference?.trim()) {
    doc.setFont("FiraSans", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text("– Verweis –", margin, leftY);
    leftY += 4.5;

    doc.setFont("FiraSansCondensed", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    const refLines = doc.splitTextToSize(
      values.documentReference.trim(),
      leftColW - 2,
    );
    doc.text(refLines, margin, leftY);
    leftY += refLines.length * 4 + 2;
  }

  // additional amounts info
  const incomeFormatted = formatAmount(values.income);
  const expenseFormatted = formatAmount(values.expense);
  const transferFormatted = formatAmount(values.transferAmount);

  const secondaryParts: string[] = [];
  if (incomeFormatted) secondaryParts.push(`Einnahme: ${incomeFormatted} €`);
  if (expenseFormatted) secondaryParts.push(`Ausgabe: ${expenseFormatted} €`);
  if (transferFormatted) secondaryParts.push(`Umbuchung: ${transferFormatted} €`);

  if (secondaryParts.length > 1) {
    leftY += 2;
    doc.setFont("FiraSans", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(secondaryParts.join("  |  "), margin, leftY);
    leftY += 4;
  }

  // status
  if (values.invoiceStatus) {
    doc.setFont("FiraSans", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(
      `Status: ${values.invoiceStatus === "bezahlt" ? "bezahlt" : "offen"}`,
      margin,
      leftY,
    );
    leftY += 4;
  }

  // notes
  if (values.notes?.trim()) {
    leftY += 1;
    doc.setFont("FiraSans", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    const noteLines = doc.splitTextToSize(values.notes.trim(), leftColW - 2);
    doc.text(noteLines, margin, leftY);
  }

  // -- Right: Gesamtbetrag + Transaktionsdatum --
  let rightY = row3Y;
  const primaryAmount =
    transferFormatted ?? expenseFormatted ?? incomeFormatted ?? "-";

  doc.setFont("FiraSans", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text("Gesamtbetrag", rightColX, rightY);
  rightY += 5.5;

  doc.setFont("FiraSans", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text(`${primaryAmount} EURO`, rightColX, rightY);
  rightY += 9;

  doc.setFont("FiraSans", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text("Transaktionsdatum", rightColX, rightY);
  rightY += 5.5;

  doc.setFont("FiraSans", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text(getFormattedDate(values.transactionDate), rightColX, rightY);

  // ── Footer row: Belegnummer | Datum + Seite ──
  const footerRowY = pageH - margin - 14;
  const creationDate = new Date().toLocaleDateString("de-DE");

  // Belegnummer
  doc.setFont("FiraSansExtraBold", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text("Belegnummer:", margin, footerRowY);
  doc.setFont("FiraSans", "normal");
  doc.setFontSize(9);
  doc.text(` ${belegnummer}`, margin + 25, footerRowY);

  // Datum + Seite (right-aligned)
  doc.setFont("FiraSansExtraBold", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text("Datum:", pageW - margin - 32, footerRowY);
  doc.text("Seite:", pageW - margin - 32, footerRowY + 4.5);

  doc.setFont("FiraSans", "normal");
  doc.setFontSize(9);
  doc.text(creationDate, pageW - margin - 14, footerRowY);
  doc.text("1/1", pageW - margin - 14, footerRowY + 4.5);

  // ── Organisation line at very bottom ──
  const orgY = pageH - margin - 1;
  doc.setFont("FiraSans", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...muted);
  doc.text(
    "Konglomerat e.V. | Jagdweg 1–3, 01159 Dresden | vorstand@konglomerat.org",
    margin,
    orgY,
  );

  const fileDate =
    values.transactionDate || new Date().toISOString().slice(0, 10);
  const fileName = `eigenbeleg-${fileDate}.pdf`;
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  doc.save(fileName);
  return { fileName, bytes };
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function buildMergedPdfName(originalName: string) {
  const withoutExtension = originalName.replace(/\.pdf$/i, "");
  return `${withoutExtension}-mit-eigenbeleg.pdf`;
}

async function buildAttachmentForCampai(params: {
  evidenceFile: File | null;
  generatedPdfBytes: Uint8Array;
  generatedPdfFileName: string;
}) {
  const { evidenceFile, generatedPdfBytes, generatedPdfFileName } = params;

  if (!evidenceFile) {
    return {
      bytes: generatedPdfBytes,
      fileName: generatedPdfFileName,
      contentType: "application/pdf",
      warning: undefined as string | undefined,
    };
  }

  if (!isPdfFile(evidenceFile)) {
    const evidenceBytes = new Uint8Array(await evidenceFile.arrayBuffer());
    return {
      bytes: evidenceBytes,
      fileName: evidenceFile.name,
      contentType: evidenceFile.type || "application/octet-stream",
      warning:
        "Nachweis ist kein PDF. Der generierte Eigenbeleg wurde nicht angehängt.",
    };
  }

  const evidenceBytes = new Uint8Array(await evidenceFile.arrayBuffer());
  const mergedPdf = await PDFDocument.create();
  const evidencePdf = await PDFDocument.load(evidenceBytes);
  const generatedPdf = await PDFDocument.load(generatedPdfBytes);

  const evidencePages = await mergedPdf.copyPages(
    evidencePdf,
    evidencePdf.getPageIndices(),
  );
  for (const page of evidencePages) {
    mergedPdf.addPage(page);
  }

  const generatedPages = await mergedPdf.copyPages(
    generatedPdf,
    generatedPdf.getPageIndices(),
  );
  for (const page of generatedPages) {
    mergedPdf.addPage(page);
  }

  const mergedBytes = new Uint8Array(await mergedPdf.save());
  return {
    bytes: mergedBytes,
    fileName: buildMergedPdfName(evidenceFile.name),
    contentType: "application/pdf",
    warning: undefined as string | undefined,
  };
}

export default function EigenbelegPage() {
  const {
    register,
    handleSubmit,
    control,
    clearErrors,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      reason: "Umbuchung",
      invoiceStatus: "offen",
    },
  });
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [storeResult, setStoreResult] = useState<{
    id?: string | null;
    error?: string;
    warning?: string;
  } | null>(null);

  const selectedReason = useWatch({ control, name: "reason" });
  const selectedEvidence = useWatch({ control, name: "evidence" });
  const email = useWatch({ control, name: "email" });
  const occasion = useWatch({ control, name: "occasion" });
  const transactionDate = useWatch({ control, name: "transactionDate" });
  const senderName = useWatch({ control, name: "senderName" });
  const receiverName = useWatch({ control, name: "receiverName" });

  const selectedEvidenceName = useMemo(() => {
    if (!selectedEvidence || selectedEvidence.length === 0) {
      return "";
    }

    return selectedEvidence.item(0)?.name ?? "";
  }, [selectedEvidence]);

  const requiredFieldStatus = useMemo(
    () => [
      { label: "E-Mail", done: Boolean(email?.trim()) },
      { label: "Grund", done: Boolean(selectedReason?.trim()) },
      { label: "Anlass", done: Boolean(occasion?.trim()) },
      { label: "Datum", done: Boolean(transactionDate?.trim()) },
      { label: "Sender", done: Boolean(senderName?.trim()) },
      { label: "Empfänger", done: Boolean(receiverName?.trim()) },
    ],
    [
      email,
      occasion,
      receiverName,
      selectedReason,
      senderName,
      transactionDate,
    ],
  );

  const completedRequiredCount = useMemo(
    () => requiredFieldStatus.filter((item) => item.done).length,
    [requiredFieldStatus],
  );

  const requiredCompletionPercent = Math.round(
    (completedRequiredCount / requiredFieldStatus.length) * 100,
  );

  const attachmentModeHint = useMemo(() => {
    if (!selectedEvidenceName) {
      return "Kein Nachweis gewählt: Der generierte Eigenbeleg wird als PDF-Anhang verwendet.";
    }

    if (selectedEvidenceName.toLowerCase().endsWith(".pdf")) {
      return "Nachweis ist PDF: Nachweis + Eigenbeleg werden als gemeinsames PDF hochgeladen.";
    }

    return "Nachweis ist keine PDF-Datei: Originaldatei wird hochgeladen, Eigenbeleg bleibt als separater Download.";
  }, [selectedEvidenceName]);

  const errorCount = Object.keys(errors).length;

  const onSubmit = async (values: FormValues) => {
    if (values.reason === "Sonstiges" && !values.reasonOther?.trim()) {
      setError("reasonOther", {
        type: "required",
        message: "Bitte den Grund für Sonstiges eintragen.",
      });
      return;
    }

    clearErrors("reasonOther");
    const { fileName: generatedPdfFileName, bytes: generatedPdfBytes } =
      await createEigenbelegPdf(values);

    const evidenceFile = values.evidence?.item(0) ?? null;
    const attachment = await buildAttachmentForCampai({
      evidenceFile,
      generatedPdfBytes,
      generatedPdfFileName,
    });

    const receiptFileBase64 = bytesToBase64(attachment.bytes);
    const receiptFileName = attachment.fileName;
    const receiptFileContentType = attachment.contentType;

    const storeResponse = await fetch("/api/campai/receipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: values.reason,
        occasion: values.occasion,
        notes: values.notes,
        transactionDate: values.transactionDate,
        income: values.income,
        expense: values.expense,
        transferAmount: values.transferAmount,
        senderName: values.senderName,
        receiverName: values.receiverName,
        senderArea: values.senderArea,
        receiverArea: values.receiverArea,
        senderProject: values.senderProject,
        receiverProject: values.receiverProject,
        receiptFileBase64,
        receiptFileName,
        receiptFileContentType,
      }),
    });

    if (storeResponse.ok) {
      const payload = (await storeResponse.json().catch(() => ({}))) as {
        id?: string | null;
        uploadWarning?: string;
      };
      const warning = [attachment.warning, payload.uploadWarning]
        .filter(Boolean)
        .join(" ")
        .trim();
      setStoreResult({
        id: payload.id ?? null,
        warning: warning || undefined,
      });
    } else {
      const payload = (await storeResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      setStoreResult({
        error: payload.error ?? "Speichern in Campai fehlgeschlagen.",
      });
    }

    setSubmittedAt(new Date().toLocaleString("de-DE"));
  };

  const handleLoadTestData = () => {
    reset(testFormData);
    clearErrors();
    setSubmittedAt(null);
    setStoreResult(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        <header className="space-y-3">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-blue-600 shadow-sm">
              <FontAwesomeIcon icon={faFolderOpen} className="h-5 w-5" />
            </span>
            <span>Generator Eigenbeleg</span>
          </h1>
          <p className="max-w-4xl text-sm leading-relaxed text-zinc-600">
            Ein Eigenbeleg ist ein Ersatz für eine Rechnung bzw. Quittung. Er
            wird genutzt, wenn kein Beleg vorhanden ist oder ein Beleg verloren
            ging und die Ausgabe betrieblich beziehungsweise beruflich notwendig
            war.
          </p>
          <p className="text-xs text-zinc-500">
            Pflichtfelder sind mit * markiert.
          </p>
        </header>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Formularstatus
                </h2>
                <p className="text-xs text-zinc-600">
                  Pflichtfelder ausgefüllt: {completedRequiredCount}/
                  {requiredFieldStatus.length}
                </p>
              </div>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                {requiredCompletionPercent}%
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${requiredCompletionPercent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-zinc-600">{attachmentModeHint}</p>
          </section>

          {errorCount > 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Bitte korrigiere {errorCount} Feld{errorCount === 1 ? "" : "er"}{" "}
              vor dem Speichern.
            </div>
          ) : null}

          <FormSection
            title="Kontaktdaten"
            icon={faUser}
            description="Die mit deinem Google-Konto verknüpften Daten können beim Dateiupload gespeichert werden."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="E-Mail-Adresse"
                required
                error={errors.email?.message}
              >
                <Input
                  type="email"
                  placeholder="name@beispiel.de"
                  {...register("email", {
                    required: "E-Mail-Adresse ist erforderlich.",
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: "Bitte eine gültige E-Mail-Adresse angeben.",
                    },
                  })}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Belegangaben" icon={faFolderOpen}>
            <div className="space-y-5">
              <FormField
                label="Grund des Eigenbelegs"
                required
                error={errors.reason?.message}
              >
                <Select
                  {...register("reason", {
                    required: "Bitte einen Grund auswählen.",
                  })}
                >
                  {reasonOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </FormField>

              {selectedReason === "Sonstiges" ? (
                <FormField
                  label="Sonstiger Grund"
                  required
                  error={errors.reasonOther?.message}
                >
                  <Input
                    placeholder="Bitte Grund ergänzen"
                    {...register("reasonOther")}
                  />
                </FormField>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Anlass"
                  required
                  error={errors.occasion?.message}
                >
                  <Textarea
                    placeholder="Bitte nenne kurz den Hintergrund/Kontext der Erstellung des Eigenbelegs"
                    {...register("occasion", {
                      required: "Anlass ist erforderlich.",
                    })}
                  />
                </FormField>

                <FormField
                  label="Verweis auf Dokument"
                  hint="Gibt es einen Vertrag oder anderes Dokument, in dem die Transaktion geregelt ist?"
                  error={errors.documentReference?.message}
                >
                  <Textarea
                    placeholder="Optionaler Verweis"
                    {...register("documentReference")}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Datum der Transaktion"
                  required
                  hint="Wann fand die Transaktion statt?"
                  error={errors.transactionDate?.message}
                >
                  <Input
                    type="date"
                    {...register("transactionDate", {
                      required: "Das Transaktionsdatum ist erforderlich.",
                    })}
                  />
                </FormField>

                <FormField
                  label="Nachweis über Vorgang"
                  hint="Eine Datei (PDF, Dokument, Zeichnung, Bild oder Tabelle), max. 10 MB"
                  error={errors.evidence?.message as string | undefined}
                >
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.odt,.ods,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    {...register("evidence", {
                      validate: {
                        maxOneFile: (files) =>
                          !files ||
                          files.length <= 1 ||
                          "Es ist nur eine Datei erlaubt.",
                        maxSize: (files) => {
                          if (!files || files.length === 0) {
                            return true;
                          }
                          const file = files.item(0);
                          if (!file) {
                            return true;
                          }
                          return (
                            file.size <= 10 * 1024 * 1024 ||
                            "Datei darf maximal 10 MB groß sein."
                          );
                        },
                      },
                    })}
                  />
                  {selectedEvidenceName ? (
                    <p className="text-xs text-zinc-500">
                      Ausgewählt: {selectedEvidenceName}
                    </p>
                  ) : null}
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection title="Aufwendung gesamt" icon={faCartShopping}>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="Einnahme Verein" error={errors.income?.message}>
                <Input
                  placeholder="z. B. 1200,00"
                  {...register("income", {
                    pattern: {
                      value: amountPattern,
                      message: "Bitte nur numerischen Betrag eingeben.",
                    },
                  })}
                />
              </FormField>

              <FormField label="Ausgabe Verein" error={errors.expense?.message}>
                <Input
                  placeholder="z. B. 350,00"
                  {...register("expense", {
                    pattern: {
                      value: amountPattern,
                      message: "Bitte nur numerischen Betrag eingeben.",
                    },
                  })}
                />
              </FormField>

              <FormField
                label="Umbuchung"
                hint="Bei Umbuchung bitte hier eintragen"
                error={errors.transferAmount?.message}
              >
                <Input
                  placeholder="z. B. 75,00"
                  {...register("transferAmount", {
                    pattern: {
                      value: amountPattern,
                      message: "Bitte nur numerischen Betrag eingeben.",
                    },
                  })}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Sender [S]" icon={faRightFromBracket}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="[S] Personen-/Organisationsname"
                required
                error={errors.senderName?.message}
              >
                <Input
                  placeholder="Sender der Buchung"
                  {...register("senderName", {
                    required: "Sendername ist erforderlich.",
                  })}
                />
              </FormField>

              <FormField
                label="[S] Zusatzangaben"
                hint="ggf. Adresse oder andere Zusatzinformationen"
              >
                <Input {...register("senderAdditional")} />
              </FormField>

              <FormField
                label="[S] Konto/Kasse"
                hint="z. B. K0004 B oder K0104 A"
              >
                <Input {...register("senderAccount")} />
              </FormField>

              <FormField label="[S] _Bereich">
                <Input {...register("senderArea")} />
              </FormField>

              <FormField label="[S] #Projekt" hint="# Hashtag nicht vergessen">
                <Input {...register("senderProject")} />
              </FormField>

              <FormField
                label="[S] Aufteilung"
                hint="Weitere Unterteilung innerhalb Bereich/Projekt"
              >
                <Input {...register("senderSplit")} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Empfänger [E]" icon={faRightToBracket}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="[E] Personen-/Organisationsname"
                required
                error={errors.receiverName?.message}
              >
                <Input
                  placeholder="Empfänger der Buchung"
                  {...register("receiverName", {
                    required: "Empfängername ist erforderlich.",
                  })}
                />
              </FormField>

              <FormField
                label="[E] Zusatzangaben"
                hint="ggf. Adresse oder andere Zusatzinformationen"
              >
                <Input {...register("receiverAdditional")} />
              </FormField>

              <FormField label="[E] Konto/Kasse">
                <Input {...register("receiverAccount")} />
              </FormField>

              <FormField label="[E] _Bereich">
                <Input {...register("receiverArea")} />
              </FormField>

              <FormField
                label="[E] #Projekt"
                hint="Nur bei Vereinsprojekten nötig"
              >
                <Input {...register("receiverProject")} />
              </FormField>

              <FormField
                label="[E] Aufteilung"
                hint="Weitere Unterteilung innerhalb Bereich/Projekt"
              >
                <Input {...register("receiverSplit")} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Status & Notizen" icon={faCalendarCheck}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Ist die Rechnung bereits beglichen?"
                required
                error={errors.invoiceStatus?.message}
              >
                <Select
                  {...register("invoiceStatus", {
                    required: "Bitte Status auswählen.",
                  })}
                >
                  <option value="offen">offen</option>
                  <option value="bezahlt">bezahlt</option>
                </Select>
              </FormField>

              <FormField
                label="Notizen"
                hint="Hast du sonst noch was anzumerken?"
              >
                <Textarea {...register("notes")} />
              </FormField>
            </div>
          </FormSection>

          <div className="sticky bottom-4 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                kind="secondary"
                icon={faFolderOpen}
                onClick={handleLoadTestData}
              >
                Testdaten laden
              </Button>
              <Button
                type="submit"
                kind="primary"
                icon={faCalendarCheck}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Wird gespeichert…"
                  : "Speichern & PDF erstellen"}
              </Button>
              {submittedAt ? (
                <p className="text-sm text-emerald-700">
                  Formular lokal erfasst: {submittedAt}
                </p>
              ) : null}
              {storeResult?.id ? (
                <p className="text-sm text-emerald-700">
                  In Campai gespeichert: {storeResult.id}
                </p>
              ) : null}
              {storeResult?.warning ? (
                <p className="text-sm text-amber-700">{storeResult.warning}</p>
              ) : null}
              {storeResult?.error ? (
                <p className="text-sm text-rose-700">{storeResult.error}</p>
              ) : null}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
