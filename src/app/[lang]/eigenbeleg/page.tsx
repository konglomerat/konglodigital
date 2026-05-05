"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { jsPDF } from "jspdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faCheck,
  faFolderOpen,
  faMoneyBillTransfer,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import BookingPageShell from "../components/ui/BookingPageShell";
import CreditorCreatePanel from "../components/ui/creditor-create-panel";
import DebtorCreatePanel from "../components/ui/debtor-create-panel";
import InternalNoteSection from "../components/ui/InternalNoteSection";
import { AutocompleteInput } from "../components/ui/autocomplete-input";
import {
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "../components/ui/form";
import BookingPageHeader from "../meine-buchungen/bookingPageHeader";
import {
  euroAmountPattern,
  euroAmountValidationMessage,
} from "@/lib/euro-input";

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

type BookingType = "ausgabe" | "einnahme" | "umbuchung";
type AssociationAccount = "K0004 B" | "K0104 A" | "BAR" | "PAYPAL" | "Kreditkarte";
type CostCenterOption = {
  value: string;
  label: string;
};

type FormValues = {
  reason: ReasonOption;
  reasonOther?: string;
  occasion: string;
  documentReference?: string;
  transactionDate: string;
  evidence?: FileList;
  bookingType: BookingType;
  amountEuro: string;
  counterpartyName: string;
  counterpartyAccount?: string;
  associationArea?: string;
  associationAccount: AssociationAccount;
  transferSenderArea?: string;
  transferSenderAccount: AssociationAccount;
  transferReceiverArea?: string;
  transferReceiverAccount: AssociationAccount;
  invoiceStatus: "offen" | "bezahlt";
  notes?: string;
};

type ReceiptValues = {
  reason: ReasonOption;
  reasonOther?: string;
  occasion: string;
  documentReference?: string;
  transactionDate: string;
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

const associationName = "Konglomerat e.V.";
const settlementAccount = "14980";
const settlementAccountLabel = `Verrechnungskonto ${settlementAccount}`;
const transferCreditorAccount = "700015";
const transferDebtorAccount = "100513";

const associationAccountOptions: Array<{
  value: AssociationAccount;
  label: string;
}> = [
  { value: "K0004 B", label: "K0004 B" },
  { value: "K0104 A", label: "K0104 A" },
  { value: "BAR", label: "BAR" },
  { value: "PAYPAL", label: "PAYPAL" },
  { value: "Kreditkarte", label: "Kreditkarte" },
];

const testFormData: Omit<FormValues, "evidence"> = {
  reason: "Mietkosten Raum",
  reasonOther: "",
  occasion: "Raummiete für den Vereinsabend im März.",
  documentReference: "Mietvertrag Veranstaltungsraum 03/2026",
  transactionDate: "2026-02-26",
  bookingType: "ausgabe",
  amountEuro: "350,00",
  counterpartyName: "Hausverwaltung Süd",
  counterpartyAccount: "47001",
  associationArea: "50",
  associationAccount: "K0104 A",
  transferSenderArea: "50",
  transferSenderAccount: "K0104 A",
  transferReceiverArea: "60",
  transferReceiverAccount: "BAR",
  invoiceStatus: "bezahlt",
  notes: "Testdatensatz für interne Formularprüfung.",
};

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}

async function loadTransferAccountNames() {
  const [creditorResponse, debtorResponse] = await Promise.all([
    fetchJson<{ creditor?: { name?: string | null } | null }>(
      `/api/campai/creditors?account=${encodeURIComponent(transferCreditorAccount)}`,
    ),
    fetchJson<{ debtor?: { name?: string | null } | null }>(
      `/api/campai/debtors?account=${encodeURIComponent(transferDebtorAccount)}`,
    ),
  ]);

  const creditorName = creditorResponse.creditor?.name?.trim();
  const debtorName = debtorResponse.debtor?.name?.trim();

  if (!creditorName) {
    throw new Error(
      `Kreditor ${transferCreditorAccount} konnte nicht aus Campai geladen werden.`,
    );
  }

  if (!debtorName) {
    throw new Error(
      `Debitor ${transferDebtorAccount} konnte nicht aus Campai geladen werden.`,
    );
  }

  return { creditorName, debtorName };
}

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

function buildSenderLine(values: ReceiptValues) {
  const parts = [values.senderName];
  if (values.senderAccount?.trim()) parts.push(`– ${values.senderAccount.trim()} –`);
  if (values.senderArea?.trim()) parts.push(`– ${values.senderArea.trim()} –`);
  if (values.senderProject?.trim()) parts.push(values.senderProject.trim());
  if (values.senderSplit?.trim()) parts.push(`(${values.senderSplit.trim()})`);
  return parts.join(" ");
}

function buildReceiverLine(values: ReceiptValues) {
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

async function createEigenbelegPdf(values: ReceiptValues) {
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

async function buildAttachmentForCampai(params: {
  generatedPdfBytes: Uint8Array;
  generatedPdfFileName: string;
}) {
  const { generatedPdfBytes, generatedPdfFileName } = params;

  return {
    bytes: generatedPdfBytes,
    fileName: generatedPdfFileName,
    contentType: "application/pdf",
    warning: undefined as string | undefined,
  };
}

function buildReceiptValues(
  values: FormValues,
  associationAreaLabel?: string,
  transferSenderAreaLabel?: string,
  transferReceiverAreaLabel?: string,
): ReceiptValues {
  const baseValues = {
    reason: values.reason,
    reasonOther: values.reasonOther,
    occasion: values.occasion,
    documentReference: values.documentReference,
    transactionDate: values.transactionDate,
    invoiceStatus: values.invoiceStatus,
    notes: values.notes,
  };

  if (values.bookingType === "umbuchung") {
    return {
      ...baseValues,
      income: undefined,
      expense: undefined,
      transferAmount: values.amountEuro,
      senderName: associationName,
      senderAdditional: undefined,
      senderAccount: values.transferSenderAccount,
      senderArea: transferSenderAreaLabel,
      senderProject: undefined,
      senderSplit: undefined,
      receiverName: associationName,
      receiverAdditional: undefined,
      receiverAccount: values.transferReceiverAccount,
      receiverArea: transferReceiverAreaLabel,
      receiverProject: undefined,
      receiverSplit: undefined,
    };
  }

  if (values.bookingType === "ausgabe") {
    return {
      ...baseValues,
      income: undefined,
      expense: values.amountEuro,
      transferAmount: undefined,
      senderName: associationName,
      senderAdditional: undefined,
      senderAccount: values.associationAccount,
      senderArea: associationAreaLabel,
      senderProject: undefined,
      senderSplit: undefined,
      receiverName: values.counterpartyName,
      receiverAdditional: undefined,
      receiverAccount: values.counterpartyAccount,
      receiverArea: undefined,
      receiverProject: undefined,
      receiverSplit: undefined,
    };
  }

  return {
    ...baseValues,
    income: values.amountEuro,
    expense: undefined,
    transferAmount: undefined,
    senderName: values.counterpartyName,
    senderAdditional: undefined,
    senderAccount: values.counterpartyAccount,
    senderArea: undefined,
    senderProject: undefined,
    senderSplit: undefined,
    receiverName: associationName,
    receiverAdditional: undefined,
    receiverAccount: values.associationAccount,
    receiverArea: associationAreaLabel,
    receiverProject: undefined,
    receiverSplit: undefined,
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      reason: "Umbuchung",
      bookingType: "umbuchung",
      associationAccount: "K0104 A",
      transferSenderAccount: "K0104 A",
      transferReceiverAccount: "K0104 A",
      invoiceStatus: "offen",
    },
  });
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [storeResult, setStoreResult] = useState<{
    successMessage?: string;
    error?: string;
    warning?: string;
  } | null>(null);
  const [showCreateCreditorPanel, setShowCreateCreditorPanel] =
    useState(false);
  const [showCreateDebtorPanel, setShowCreateDebtorPanel] = useState(false);
  const [debtorError, setDebtorError] = useState<string | null>(null);

  const selectedReason = useWatch({ control, name: "reason" });
  const selectedEvidence = useWatch({ control, name: "evidence" });
  const selectedBookingType = useWatch({ control, name: "bookingType" });
  const selectedInvoiceStatus = useWatch({ control, name: "invoiceStatus" });
  const counterpartyName = useWatch({ control, name: "counterpartyName" });
  const counterpartyAccount = useWatch({ control, name: "counterpartyAccount" });
  const selectedAssociationArea = useWatch({
    control,
    name: "associationArea",
  });
  const selectedTransferSenderArea = useWatch({
    control,
    name: "transferSenderArea",
  });
  const selectedTransferReceiverArea = useWatch({
    control,
    name: "transferReceiverArea",
  });

  const selectedEvidenceName = useMemo(() => {
    if (!selectedEvidence || selectedEvidence.length === 0) {
      return "";
    }

    return selectedEvidence.item(0)?.name ?? "";
  }, [selectedEvidence]);

  const attachmentModeHint = useMemo(() => {
    if (!selectedEvidenceName) {
      return "An Campai wird nur die erzeugte Eigenbeleg-PDF angehängt.";
    }

    return "Der hochgeladene Nachweis bleibt separat. An Campai wird nur die erzeugte Eigenbeleg-PDF angehängt.";
  }, [selectedEvidenceName]);

  const selectedAssociationAreaLabel = useMemo(() => {
    if (!selectedAssociationArea) {
      return undefined;
    }

    return (
      costCenters.find((item) => item.value === selectedAssociationArea)?.label ??
      selectedAssociationArea
    );
  }, [costCenters, selectedAssociationArea]);
  const selectedTransferSenderAreaLabel = useMemo(() => {
    if (!selectedTransferSenderArea) {
      return undefined;
    }

    return (
      costCenters.find((item) => item.value === selectedTransferSenderArea)?.label ??
      selectedTransferSenderArea
    );
  }, [costCenters, selectedTransferSenderArea]);
  const selectedTransferReceiverAreaLabel = useMemo(() => {
    if (!selectedTransferReceiverArea) {
      return undefined;
    }

    return (
      costCenters.find((item) => item.value === selectedTransferReceiverArea)?.label ??
      selectedTransferReceiverArea
    );
  }, [costCenters, selectedTransferReceiverArea]);

  const errorCount = Object.keys(errors).length;
  const isTransferFlow = selectedBookingType === "umbuchung";
  const isExpenseFlow = selectedBookingType === "ausgabe";
  const isExpenseLikeFlow = isExpenseFlow || isTransferFlow;
  const counterpartyEntityLabel = isExpenseLikeFlow ? "Kreditor" : "Debitor";
  const counterpartyFieldLabel = isExpenseLikeFlow ? "Empfänger" : "Sender";
  const associationFieldLabel = isExpenseLikeFlow ? "Sender" : "Empfänger";
  const counterpartyApiPath = isExpenseLikeFlow
    ? "/api/campai/creditors"
    : "/api/campai/debtors";
  const activeCounterpartyError = isExpenseLikeFlow ? null : debtorError;
  const senderDisplayValue = isExpenseLikeFlow
    ? associationName
    : counterpartyName ?? "";
  const receiverDisplayValue = isExpenseLikeFlow
    ? counterpartyName ?? ""
    : associationName;
  const statusNoteLine = `Status: ${selectedInvoiceStatus === "bezahlt" ? "bezahlt" : "offen"}`;

  useEffect(() => {
    setValue("counterpartyAccount", "");
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setDebtorError(null);
  }, [selectedBookingType, setValue]);

  useEffect(() => {
    if (!isTransferFlow) {
      return;
    }

    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setDebtorError(null);
  }, [isTransferFlow]);

  const resetCounterparty = () => {
    setValue("counterpartyName", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: true,
    });
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setDebtorError(null);
  };

  const handleCounterpartySelect = (suggestion: {
    account: number;
    name: string;
  }) => {
    setValue("counterpartyName", suggestion.name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", String(suggestion.account), {
      shouldDirty: true,
    });
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setDebtorError(null);
  };

  const handleCreateCreditor = (name: string) => {
    setValue("counterpartyName", name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: true,
    });
    setShowCreateCreditorPanel(true);
    setShowCreateDebtorPanel(false);
  };

  const handleCreateDebtor = (name: string) => {
    setValue("counterpartyName", name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: true,
    });
    setShowCreateDebtorPanel(true);
    setShowCreateCreditorPanel(false);
    setDebtorError(null);
  };

  useEffect(() => {
    let active = true;

    const loadCostCenters = async () => {
      try {
        setCostCentersLoading(true);
        const response = await fetchJson<{ costCenters: CostCenterOption[] }>(
          "/api/campai/cost-centers",
        );

        if (!active) {
          return;
        }

        const items = response.costCenters ?? [];
        setCostCenters(items);
        setCostCentersError(null);

        if (items.length > 0 && !selectedAssociationArea) {
          setValue("associationArea", items[0].value, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
        }

        if (items.length > 0 && !selectedTransferSenderArea) {
          setValue("transferSenderArea", items[0].value, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
        }

        if (items.length > 0 && !selectedTransferReceiverArea) {
          setValue("transferReceiverArea", items[0].value, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setCostCentersError(
          error instanceof Error
            ? error.message
            : "Kostenstellen konnten nicht geladen werden.",
        );
      } finally {
        if (active) {
          setCostCentersLoading(false);
        }
      }
    };

    void loadCostCenters();

    return () => {
      active = false;
    };
  }, [
    selectedAssociationArea,
    selectedTransferReceiverArea,
    selectedTransferSenderArea,
    setValue,
  ]);

  const onSubmit = async (values: FormValues) => {
    setStoreResult(null);
    setSubmittedAt(null);

    if (values.reason === "Sonstiges" && !values.reasonOther?.trim()) {
      setError("reasonOther", {
        type: "required",
        message: "Bitte den Grund für Sonstiges eintragen.",
      });
      return;
    }

    if (!isTransferFlow && !values.counterpartyAccount?.trim()) {
      setError("counterpartyName", {
        type: "required",
        message: `Bitte einen ${counterpartyEntityLabel} aus der Liste auswählen.`,
      });
      return;
    }

    clearErrors("reasonOther");
    clearErrors("counterpartyName");
    const internalNote = [values.notes?.trim(), statusNoteLine]
      .filter(Boolean)
      .join("\n");
    const receiptValues = buildReceiptValues(
      { ...values, notes: internalNote },
      selectedAssociationAreaLabel,
      selectedTransferSenderAreaLabel,
      selectedTransferReceiverAreaLabel,
    );
    const { fileName: generatedPdfFileName, bytes: generatedPdfBytes } =
      await createEigenbelegPdf(receiptValues);

    const attachment = await buildAttachmentForCampai({
      generatedPdfBytes,
      generatedPdfFileName,
    });

    const receiptFileBase64 = bytesToBase64(attachment.bytes);
    const receiptFileName = attachment.fileName;
    const receiptFileContentType = attachment.contentType;

    const sendReceipt = async (
      endpoint: "expense" | "revenue",
      payload: Record<string, unknown>,
    ) => {
      const response = await fetch(`/api/campai/receipts/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          reason: values.reason,
          tags: [values.reason === "Sonstiges" ? values.reasonOther?.trim() || values.reason : values.reason],
          occasion: receiptValues.occasion,
          internalNote,
          transactionDate: receiptValues.transactionDate,
          invoiceStatus: values.invoiceStatus,
          receiptFileBase64,
          receiptFileName,
          receiptFileContentType,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorPayload.error ?? "Speichern in Campai fehlgeschlagen.");
      }

      return (await response.json().catch(() => ({}))) as {
        id?: string | null;
        uploadWarning?: string;
      };
    };

    try {
      if (isTransferFlow) {
        const { creditorName, debtorName } = await loadTransferAccountNames();
        const transferDescription = `Umbuchung von Kst. ${selectedTransferSenderAreaLabel ?? values.transferSenderArea ?? "-"} zu Kst. ${selectedTransferReceiverAreaLabel ?? values.transferReceiverArea ?? "-"}`;

        const expenseResult = await sendReceipt("expense", {
          bookingType: "ausgabe",
          description: transferDescription,
          expense: values.amountEuro,
          transferAmount: values.amountEuro,
          senderName: associationName,
          receiverName: settlementAccountLabel,
          counterpartyAccount: transferCreditorAccount,
          counterpartyName: creditorName,
          positionAccount: settlementAccount,
          costCenter2: values.transferSenderArea,
        });

        let revenueResult;
        try {
          revenueResult = await sendReceipt("revenue", {
            bookingType: "einnahme",
            description: transferDescription,
            income: values.amountEuro,
            transferAmount: values.amountEuro,
            senderName: settlementAccountLabel,
            receiverName: associationName,
            counterpartyAccount: transferDebtorAccount,
            counterpartyName: debtorName,
            positionAccount: settlementAccount,
            costCenter2: values.transferReceiverArea,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Einnahme in Campai fehlgeschlagen.";
          throw new Error(
            `Ausgabe wurde bereits mit ${expenseResult.id ?? "ohne ID"} erstellt, aber die zugehörige Einnahme ist fehlgeschlagen. ${message}`,
          );
        }

        const warning = [
          attachment.warning,
          expenseResult.uploadWarning,
          revenueResult.uploadWarning,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

        setStoreResult({
          successMessage: `In Campai gespeichert: Ausgabe ${expenseResult.id ?? "ohne ID"}, Einnahme ${revenueResult.id ?? "ohne ID"}`,
          warning: warning || undefined,
        });
      } else {
        const storeResponse = await sendReceipt(
          values.bookingType === "einnahme" ? "revenue" : "expense",
          {
            income: receiptValues.income,
            expense: receiptValues.expense,
            transferAmount: receiptValues.transferAmount,
            senderName: receiptValues.senderName,
            receiverName: receiptValues.receiverName,
            counterpartyAccount: values.counterpartyAccount,
            counterpartyName: values.counterpartyName,
            costCenter2: values.associationArea,
          },
        );

        const warning = [attachment.warning, storeResponse.uploadWarning]
          .filter(Boolean)
          .join(" ")
          .trim();

        setStoreResult({
          successMessage: `In Campai gespeichert: ${storeResponse.id ?? "ohne ID"}`,
          warning: warning || undefined,
        });
      }
    } catch (error) {
      setStoreResult({
        error:
          error instanceof Error
            ? error.message
            : "Speichern in Campai fehlgeschlagen.",
      });
    }

    setSubmittedAt(new Date().toLocaleString("de-DE"));
  };

  return (
    <BookingPageShell>
        <BookingPageHeader
          title="Generator Eigenbeleg"
          description="Ein Eigenbeleg ist ein Ersatz für eine Rechnung beziehungsweise Quittung. Er wird genutzt, wenn kein Beleg vorhanden ist oder ein Beleg verloren ging und die Ausgabe betrieblich beziehungsweise beruflich notwendig war."
          helperText="Pflichtfelder sind mit * markiert."
          icon={<FontAwesomeIcon icon={faFolderOpen} className="h-5 w-5" />}
          iconClassName="border-blue-200 bg-blue-50 text-blue-600 shadow-sm"
        />

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {errorCount > 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Bitte korrigiere {errorCount} Feld{errorCount === 1 ? "" : "er"}{" "}
              vor dem Speichern.
            </div>
          ) : null}

          <FormSection
            title="1. Typ des Eigenbelegs"
            icon={faFolderOpen}
            description="Wähle zuerst den Grund für den Eigenbeleg."
          >
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
            </div>
          </FormSection>

          <FormSection title="2. Belegangaben" icon={faFolderOpen}>
            <div className="space-y-5">
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
                  <p className="text-xs text-zinc-500">{attachmentModeHint}</p>
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="3. Buchung"
            icon={faMoneyBillTransfer}
            description="Bei Ausgaben ist der Verein der Sender. Bei Einnahmen ist der Verein der Empfänger. Umbuchungen werden vereinsintern zwischen zwei Werkbereichen/Projekten getätigt"
          >
            <div className="space-y-5">
              <input type="hidden" autoComplete="off" {...register("bookingType")} />
              <input
                type="hidden"
                autoComplete="off"
                {...register("counterpartyName", {
                  validate: (value) =>
                    isTransferFlow ||
                    (typeof value === "string" && value.trim().length > 0) ||
                    `${counterpartyEntityLabel} ist erforderlich.`,
                })}
              />
              <input type="hidden" autoComplete="off" {...register("counterpartyAccount")} />

              <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setValue("bookingType", "ausgabe")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isExpenseFlow
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <span className="mr-2 inline-flex items-center">
                    <FontAwesomeIcon
                      icon={faArrowTrendDown}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  Ausgabe
                </button>
                <button
                  type="button"
                  onClick={() => setValue("bookingType", "einnahme")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    selectedBookingType === "einnahme"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <span className="mr-2 inline-flex items-center">
                    <FontAwesomeIcon
                      icon={faArrowTrendUp}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  Einnahme
                </button>
                <button
                  type="button"
                  onClick={() => setValue("bookingType", "umbuchung")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isTransferFlow
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <span className="mr-2 inline-flex items-center">
                    <FontAwesomeIcon
                      icon={faMoneyBillTransfer}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  Umbuchung
                </button>
              </div>

              {isTransferFlow ? (
                <div className="space-y-5">
                  <FormField
                    label="Umbuchungsbetrag in Euro"
                    required
                    hint="Bitte den Betrag der Umbuchung eintragen."
                    error={errors.amountEuro?.message}
                  >
                    <Input
                      placeholder="z. B. 95,00"
                      inputMode="decimal"
                      {...register("amountEuro", {
                        required: "Bitte einen Betrag eintragen.",
                        pattern: {
                          value: euroAmountPattern,
                          message: euroAmountValidationMessage,
                        },
                      })}
                    />
                  </FormField>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-zinc-900">Sender</h3>
                        <p className="text-sm text-zinc-600">
                          Von hier wird der Betrag ausgebucht.
                        </p>
                      </div>

                      <FormField label="Verein">
                        <Input value={associationName} disabled readOnly />
                      </FormField>

                      <FormField
                        label="Werkbereich/Projekt"
                        required
                        error={errors.transferSenderArea?.message ?? costCentersError ?? undefined}
                      >
                        <Select
                          disabled={costCentersLoading || costCenters.length === 0}
                          {...register("transferSenderArea", {
                            required: "Bitte eine Kostenstelle 2 für den Sender auswählen.",
                          })}
                        >
                          {costCenters.length === 0 ? (
                            <option value="">
                              {costCentersLoading
                                ? "Kostenstellen werden geladen…"
                                : "Keine Kostenstellen verfügbar"}
                            </option>
                          ) : null}
                          {costCenters.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>

                      <FormField
                        label="Konto/Kasse"
                        required
                        error={errors.transferSenderAccount?.message}
                      >
                        <Select
                          {...register("transferSenderAccount", {
                            required: "Bitte ein Konto für den Sender auswählen.",
                          })}
                        >
                          {associationAccountOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>

                    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-zinc-900">Empfänger</h3>
                        <p className="text-sm text-zinc-600">
                          Hier wird der Betrag wieder eingebucht.
                        </p>
                      </div>

                      <FormField label="Verein">
                        <Input value={associationName} disabled readOnly />
                      </FormField>

                      <FormField
                        label="Werkbereich/Projekt"
                        required
                        error={errors.transferReceiverArea?.message ?? costCentersError ?? undefined}
                      >
                        <Select
                          disabled={costCentersLoading || costCenters.length === 0}
                          {...register("transferReceiverArea", {
                            required: "Bitte eine Kostenstelle 2 für den Empfänger auswählen.",
                          })}
                        >
                          {costCenters.length === 0 ? (
                            <option value="">
                              {costCentersLoading
                                ? "Kostenstellen werden geladen…"
                                : "Keine Kostenstellen verfügbar"}
                            </option>
                          ) : null}
                          {costCenters.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>

                      <FormField
                        label="Konto/Kasse"
                        required
                        error={errors.transferReceiverAccount?.message}
                      >
                        <Select
                          {...register("transferReceiverAccount", {
                            required: "Bitte ein Konto für den Empfänger auswählen.",
                          })}
                        >
                          {associationAccountOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-5">
                    <FormField
                      label={isExpenseFlow ? "Ausgabe in Euro" : "Einnahme in Euro"}
                      required
                      hint={
                        isExpenseFlow
                          ? "Bitte den Ausgabenbetrag des Eigenbelegs eintragen."
                          : "Bitte den Einnahmenbetrag des Eigenbelegs eintragen."
                      }
                      error={errors.amountEuro?.message}
                    >
                      <Input
                        placeholder={isExpenseFlow ? "z. B. 95,00" : "z. B. 30,00"}
                        inputMode="decimal"
                        {...register("amountEuro", {
                          required: "Bitte einen Betrag eintragen.",
                          pattern: {
                            value: euroAmountPattern,
                            message: euroAmountValidationMessage,
                          },
                        })}
                      />
                    </FormField>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-zinc-900">Sender</h3>
                          <p className="text-sm text-zinc-600">
                            {isExpenseLikeFlow
                              ? "Von hier wird der Betrag ausgebucht."
                              : "Hier kommt der Betrag von außen in den Verein hinein."}
                          </p>
                        </div>

                        <FormField label="Name" required={!isExpenseLikeFlow}>
                          {isExpenseLikeFlow ? (
                            <Input value={senderDisplayValue} disabled readOnly />
                          ) : (
                            <AutocompleteInput
                              apiPath={counterpartyApiPath}
                              entityLabelSingular={counterpartyEntityLabel}
                              placeholder="Name eingeben…"
                              showCreateOption
                              value={counterpartyName ?? ""}
                              onChange={(event) => {
                                setValue("counterpartyName", event.target.value, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setValue("counterpartyAccount", "", {
                                  shouldDirty: true,
                                });
                                setDebtorError(null);
                                if (!event.target.value.trim()) {
                                  setShowCreateDebtorPanel(false);
                                }
                              }}
                              onSelect={handleCounterpartySelect}
                              onCreateNew={handleCreateDebtor}
                            />
                          )}
                        </FormField>

                        {isExpenseLikeFlow ? (
                          <>
                            <FormField
                              label="Werkbereich/Projekt"
                              hint="Werkbereich des Vereins auswählen"
                              required
                              error={errors.associationArea?.message ?? costCentersError ?? undefined}
                            >
                              <Select
                                disabled={costCentersLoading || costCenters.length === 0}
                                {...register("associationArea", {
                                  required: "Bitte eine Kostenstelle 2 auswählen.",
                                })}
                              >
                                {costCenters.length === 0 ? (
                                  <option value="">
                                    {costCentersLoading
                                      ? "Kostenstellen werden geladen…"
                                      : "Keine Kostenstellen verfügbar"}
                                  </option>
                                ) : null}
                                {costCenters.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </FormField>

                            <FormField
                              label="Konto/Kasse"
                              required
                              error={errors.associationAccount?.message}
                            >
                              <Select
                                {...register("associationAccount", {
                                  required: "Bitte ein Konto auswählen.",
                                })}
                              >
                                {associationAccountOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </FormField>
                          </>
                        ) : null}
                      </div>

                      <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-zinc-900">Empfänger</h3>
                          <p className="text-sm text-zinc-600">
                            {isExpenseLikeFlow
                              ? "Hier geht der Betrag nach außen aus dem Verein heraus."
                              : "Hier wird der Betrag im Verein eingebucht."}
                          </p>
                        </div>

                        <FormField label="Name" required={isExpenseLikeFlow}>
                          {isExpenseLikeFlow ? (
                            <AutocompleteInput
                              apiPath={counterpartyApiPath}
                              entityLabelSingular={counterpartyEntityLabel}
                              placeholder="Name eingeben…"
                              showCreateOption
                              value={counterpartyName ?? ""}
                              onChange={(event) => {
                                setValue("counterpartyName", event.target.value, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setValue("counterpartyAccount", "", {
                                  shouldDirty: true,
                                });
                                if (!event.target.value.trim()) {
                                  setShowCreateCreditorPanel(false);
                                }
                              }}
                              onSelect={handleCounterpartySelect}
                              onCreateNew={handleCreateCreditor}
                            />
                          ) : (
                            <Input value={receiverDisplayValue} disabled readOnly />
                          )}
                        </FormField>

                        {!isExpenseLikeFlow ? (
                          <>
                            <FormField
                              label="Werkbereich/Projekt"
                              hint="Werkbereich des Vereins auswählen"
                              required
                              error={errors.associationArea?.message ?? costCentersError ?? undefined}
                            >
                              <Select
                                disabled={costCentersLoading || costCenters.length === 0}
                                {...register("associationArea", {
                                  required: "Bitte eine Kostenstelle 2 auswählen.",
                                })}
                              >
                                {costCenters.length === 0 ? (
                                  <option value="">
                                    {costCentersLoading
                                      ? "Kostenstellen werden geladen…"
                                      : "Keine Kostenstellen verfügbar"}
                                  </option>
                                ) : null}
                                {costCenters.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </FormField>

                            <FormField
                              label="Konto/Kasse"
                              required
                              error={errors.associationAccount?.message}
                            >
                              <Select
                                {...register("associationAccount", {
                                  required: "Bitte ein Konto auswählen.",
                                })}
                              >
                                {associationAccountOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </FormField>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {counterpartyAccount ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                      <span>
                        {counterpartyEntityLabel} <strong>#{counterpartyAccount}</strong>
                        {counterpartyName ? ` (${counterpartyName})` : ""} ausgewählt
                      </span>
                      <button
                        type="button"
                        className="ml-auto rounded p-1 text-emerald-600 hover:bg-emerald-100"
                        onClick={resetCounterparty}
                      >
                        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}

                  {activeCounterpartyError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {activeCounterpartyError}
                    </div>
                  ) : null}

                  {showCreateCreditorPanel && !counterpartyAccount && isExpenseLikeFlow ? (
                    <CreditorCreatePanel
                      initialName={counterpartyName ?? ""}
                      onCancel={() => setShowCreateCreditorPanel(false)}
                      onCreated={(created) => {
                        handleCounterpartySelect({
                          account: created.account,
                          name: created.name,
                        });
                      }}
                    />
                  ) : null}

                  {showCreateDebtorPanel && !counterpartyAccount && !isExpenseLikeFlow ? (
                    <DebtorCreatePanel
                      initialName={counterpartyName ?? ""}
                      initialType="person"
                      onCancel={() => setShowCreateDebtorPanel(false)}
                      onCreated={(result) => {
                        handleCounterpartySelect({
                          account: result.account,
                          name: result.name,
                        });
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          </FormSection>

          <InternalNoteSection
            hint="Wird intern am Beleg in Campai hinterlegt und ist nur für Admins sichtbar. Die Status-Zeile wird automatisch vorangestellt."
            textareaProps={register("notes")}
          >
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <FormField
                label="Status"
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
            </div>
          </InternalNoteSection>

          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto flex flex-wrap items-center gap-3">
              {submittedAt ? (
                <p className="text-sm text-emerald-700">
                  Eigenbeleg erstellt: {submittedAt}
                </p>
              ) : null}
              {storeResult?.successMessage ? (
                <p className="text-sm text-emerald-700">{storeResult.successMessage}</p>
              ) : null}
              {storeResult?.warning ? (
                <p className="text-sm text-amber-700">{storeResult.warning}</p>
              ) : null}
              {storeResult?.error ? (
                <p className="text-sm text-rose-700">{storeResult.error}</p>
              ) : null}
            </div>

            <div className="ml-auto flex items-center justify-end gap-3">
              <Button type="button" kind="secondary" href="/meine-buchungen">
                Abbrechen
              </Button>
              <Button
                type="submit"
                kind="primary"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Wird erstellt…"
                  : "Eigenbeleg erstellen"}
              </Button>
            </div>
          </div>
        </form>
    </BookingPageShell>
  );
}
