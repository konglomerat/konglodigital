"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { jsPDF } from "jspdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faCalendarCheck,
  faCheck,
  faFolderOpen,
  faMoneyBillTransfer,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import { AutocompleteInput } from "../components/ui/autocomplete-input";
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

type BookingType = "ausgabe" | "einnahme";
type AssociationAccount = "K0004 B" | "K0104 A" | "BAR" | "PAYPAL" | "Kreditkarte";
type CostCenterOption = {
  value: string;
  label: string;
};

type CreditorPaymentMethodType = "creditTransfer" | "cash";

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
  invoiceStatus: "bezahlt",
  notes: "Testdatensatz für interne Formularprüfung.",
};

const amountPattern = /^\d+(?:[.,]\d{1,2})?$/;

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
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
    defaultValues: {
      reason: "Umbuchung",
      bookingType: "ausgabe",
      associationAccount: "K0104 A",
      invoiceStatus: "offen",
    },
  });
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [storeResult, setStoreResult] = useState<{
    id?: string | null;
    error?: string;
    warning?: string;
  } | null>(null);
  const [showCreateCreditorPanel, setShowCreateCreditorPanel] =
    useState(false);
  const [creditorPaymentMethodType, setCreditorPaymentMethodType] =
    useState<CreditorPaymentMethodType>("creditTransfer");
  const [creditorIban, setCreditorIban] = useState("");
  const [creditorKontoinhaber, setCreditorKontoinhaber] = useState("");
  const [isCreatingCreditor, setIsCreatingCreditor] = useState(false);
  const [creditorError, setCreditorError] = useState<string | null>(null);
  const [showCreateDebtorPanel, setShowCreateDebtorPanel] = useState(false);
  const [debtorEmail, setDebtorEmail] = useState("");
  const [debtorSendByMail, setDebtorSendByMail] = useState(false);
  const [debtorAddressLine, setDebtorAddressLine] = useState("");
  const [debtorZip, setDebtorZip] = useState("");
  const [debtorCity, setDebtorCity] = useState("");
  const [debtorDetails1, setDebtorDetails1] = useState("");
  const [debtorDetails2, setDebtorDetails2] = useState("");
  const [isCreatingDebtor, setIsCreatingDebtor] = useState(false);
  const [debtorError, setDebtorError] = useState<string | null>(null);

  const selectedReason = useWatch({ control, name: "reason" });
  const selectedEvidence = useWatch({ control, name: "evidence" });
  const selectedBookingType = useWatch({ control, name: "bookingType" });
  const counterpartyName = useWatch({ control, name: "counterpartyName" });
  const counterpartyAccount = useWatch({ control, name: "counterpartyAccount" });
  const selectedAssociationArea = useWatch({
    control,
    name: "associationArea",
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

  const errorCount = Object.keys(errors).length;
  const isExpenseFlow = selectedBookingType !== "einnahme";
  const counterpartyEntityLabel = isExpenseFlow ? "Kreditor" : "Debitor";
  const counterpartyFieldLabel = isExpenseFlow ? "Empfänger" : "Sender";
  const associationFieldLabel = isExpenseFlow ? "Sender" : "Empfänger";
  const counterpartyApiPath = isExpenseFlow
    ? "/api/campai/creditors"
    : "/api/campai/debtors";
  const activeCounterpartyError = isExpenseFlow ? creditorError : debtorError;
  const senderDisplayValue = isExpenseFlow
    ? associationName
    : counterpartyName ?? "";
  const receiverDisplayValue = isExpenseFlow
    ? counterpartyName ?? ""
    : associationName;

  useEffect(() => {
    setValue("counterpartyAccount", "");
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setCreditorError(null);
    setDebtorError(null);
  }, [selectedBookingType, setValue]);

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
    setCreditorError(null);
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
    setCreditorError(null);
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
    setCreditorKontoinhaber(name);
    setShowCreateCreditorPanel(true);
    setShowCreateDebtorPanel(false);
    setCreditorError(null);
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

  const createCreditor = async () => {
    setIsCreatingCreditor(true);
    setCreditorError(null);

    try {
      const payload: {
        name: string;
        type: "business";
        paymentMethodType: CreditorPaymentMethodType;
        iban?: string;
        kontoinhaber?: string;
      } = {
        name: (counterpartyName ?? "").trim(),
        type: "business",
        paymentMethodType: creditorPaymentMethodType,
      };

      if (!payload.name) {
        setCreditorError("Bitte zuerst einen Kreditorennamen eingeben.");
        return;
      }

      if (creditorPaymentMethodType === "creditTransfer") {
        payload.iban = creditorIban.replace(/\s+/g, "").toUpperCase();
        payload.kontoinhaber = creditorKontoinhaber.trim();
      }

      const response = await fetchJson<{
        account?: number | null;
        name?: string;
      }>("/api/campai/creditors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (typeof response.account !== "number" || response.account <= 0) {
        setCreditorError(
          "Kreditor wurde erstellt, aber die Kontonummer konnte nicht ermittelt werden.",
        );
        return;
      }

      handleCounterpartySelect({
        account: response.account,
        name: response.name ?? counterpartyName ?? "",
      });
    } catch (error) {
      setCreditorError(
        error instanceof Error ? error.message : "Kreditor konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingCreditor(false);
    }
  };

  const createDebtor = async () => {
    setDebtorError(null);

    const trimmedName = (counterpartyName ?? "").trim();
    if (!trimmedName) {
      setDebtorError("Bitte zuerst einen Debitorennamen eingeben.");
      return;
    }

    if (!debtorAddressLine.trim() || !debtorZip.trim() || !debtorCity.trim()) {
      setDebtorError(
        "Für neue Debitoren werden Straße/Adresse, PLZ und Stadt benötigt.",
      );
      return;
    }

    setIsCreatingDebtor(true);
    try {
      const response = await fetchJson<{
        account?: number | null;
        name?: string;
      }>("/api/campai/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          type: "business",
          email: debtorEmail.trim() || undefined,
          receiptSendMethod: debtorEmail.trim()
            ? debtorSendByMail
              ? "email"
              : "postal"
            : "postal",
          address: {
            country: "DE",
            zip: debtorZip.trim(),
            city: debtorCity.trim(),
            addressLine: debtorAddressLine.trim(),
            details1: debtorDetails1.trim() || undefined,
            details2: debtorDetails2.trim() || undefined,
          },
        }),
      });

      if (typeof response.account !== "number" || response.account <= 0) {
        setDebtorError(
          "Debitor wurde erstellt, aber die Debitorennummer konnte nicht ermittelt werden.",
        );
        return;
      }

      handleCounterpartySelect({
        account: response.account,
        name: response.name ?? trimmedName,
      });
    } catch (error) {
      setDebtorError(
        error instanceof Error ? error.message : "Debitor konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingDebtor(false);
    }
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
  }, [selectedAssociationArea, setValue]);

  const onSubmit = async (values: FormValues) => {
    if (values.reason === "Sonstiges" && !values.reasonOther?.trim()) {
      setError("reasonOther", {
        type: "required",
        message: "Bitte den Grund für Sonstiges eintragen.",
      });
      return;
    }

    if (!values.counterpartyAccount?.trim()) {
      setError("counterpartyName", {
        type: "required",
        message: `Bitte einen ${counterpartyEntityLabel} aus der Liste auswählen.`,
      });
      return;
    }

    clearErrors("reasonOther");
    clearErrors("counterpartyName");
    const receiptValues = buildReceiptValues(
      values,
      selectedAssociationAreaLabel,
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

    const storeResponse = await fetch(
      `/api/campai/receipts/${values.bookingType === "einnahme" ? "revenue" : "expense"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: values.reason,
          occasion: receiptValues.occasion,
          notes: receiptValues.notes,
          transactionDate: receiptValues.transactionDate,
          income: receiptValues.income,
          expense: receiptValues.expense,
          transferAmount: receiptValues.transferAmount,
          senderName: receiptValues.senderName,
          receiverName: receiptValues.receiverName,
          counterpartyAccount: values.counterpartyAccount,
          counterpartyName: values.counterpartyName,
          costCenter2: values.associationArea,
          invoiceStatus: values.invoiceStatus,
          receiptFileBase64,
          receiptFileName,
          receiptFileContentType,
        }),
      },
    );

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
            title="3. Einnahme oder Ausgabe"
            icon={faMoneyBillTransfer}
            description={
              isExpenseFlow
                ? "Bei Ausgaben ist der Verein der Sender. Wähle dazu Kostenstelle 2, Kreditor, Konto und Betrag."
                : "Bei Einnahmen ist der Verein der Empfänger. Wähle dazu Kostenstelle 2, Debitor, Konto und Betrag."
            }
          >
            <div className="space-y-5">
              <input type="hidden" autoComplete="off" {...register("bookingType")} />
              <input
                type="hidden"
                autoComplete="off"
                {...register("counterpartyName", {
                  required: `${counterpartyEntityLabel} ist erforderlich.`,
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
                    !isExpenseFlow
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Sender">
                  {isExpenseFlow ? (
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

                <FormField label="Empfänger">
                  {isExpenseFlow ? (
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
                        setCreditorError(null);
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

                <FormField
                  label="Kostenstelle 2"
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
                    {...register("amountEuro", {
                      required: "Bitte einen Betrag eintragen.",
                      pattern: {
                        value: amountPattern,
                        message: "Bitte gültigen Betrag eingeben.",
                      },
                    })}
                  />
                </FormField>
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

              {showCreateCreditorPanel && !counterpartyAccount && isExpenseFlow ? (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Neuen Kreditor anlegen: &ldquo;{counterpartyName}&rdquo;
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Zahlungsart" required>
                      <Select
                        value={creditorPaymentMethodType}
                        onChange={(event) =>
                          setCreditorPaymentMethodType(
                            event.target.value as CreditorPaymentMethodType,
                          )
                        }
                      >
                        <option value="creditTransfer">Überweisung</option>
                        <option value="cash">Bargeld</option>
                      </Select>
                    </FormField>

                    {creditorPaymentMethodType === "creditTransfer" ? (
                      <FormField label="Kontoinhaber" required>
                        <Input
                          placeholder="Vor- und Nachname"
                          value={creditorKontoinhaber}
                          onChange={(event) =>
                            setCreditorKontoinhaber(event.target.value)
                          }
                        />
                      </FormField>
                    ) : null}
                  </div>

                  {creditorPaymentMethodType === "creditTransfer" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="IBAN" required>
                        <Input
                          placeholder="DE…"
                          value={creditorIban}
                          onChange={(event) => setCreditorIban(event.target.value)}
                        />
                      </FormField>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      kind="primary"
                      icon={faPlus}
                      disabled={
                        isCreatingCreditor ||
                        !counterpartyName?.trim() ||
                        (creditorPaymentMethodType === "creditTransfer" &&
                          (!creditorIban.trim() || !creditorKontoinhaber.trim()))
                      }
                      onClick={createCreditor}
                    >
                      {isCreatingCreditor ? "Wird angelegt…" : "Kreditor anlegen"}
                    </Button>
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() => setShowCreateCreditorPanel(false)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : null}

              {showCreateDebtorPanel && !counterpartyAccount && !isExpenseFlow ? (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900">
                      Neuen Debitor anlegen: &ldquo;{counterpartyName}&rdquo;
                    </p>
                    <p className="text-sm text-blue-800">
                      Für die Anlage werden die unten eingetragene Adresse und optional die E-Mail-Adresse verwendet.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="E-Mail-Adresse">
                      <Input
                        type="email"
                        placeholder="kunde@beispiel.de"
                        value={debtorEmail}
                        onChange={(event) => setDebtorEmail(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Versand per E-Mail">
                      <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          autoComplete="off"
                          checked={debtorSendByMail}
                          onChange={(event) =>
                            setDebtorSendByMail(event.target.checked)
                          }
                        />
                        Rechnung per E-Mail versenden
                      </label>
                    </FormField>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Straße / Adresse" required>
                      <Input
                        placeholder="Straße und Hausnummer"
                        value={debtorAddressLine}
                        onChange={(event) =>
                          setDebtorAddressLine(event.target.value)
                        }
                      />
                    </FormField>

                    <FormField label="Adresszusatz 1">
                      <Input
                        placeholder="Optional"
                        value={debtorDetails1}
                        onChange={(event) => setDebtorDetails1(event.target.value)}
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField label="PLZ" required>
                      <Input
                        placeholder="01159"
                        value={debtorZip}
                        onChange={(event) => setDebtorZip(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Stadt" required>
                      <Input
                        placeholder="Dresden"
                        value={debtorCity}
                        onChange={(event) => setDebtorCity(event.target.value)}
                      />
                    </FormField>

                    <FormField label="Adresszusatz 2">
                      <Input
                        placeholder="Optional"
                        value={debtorDetails2}
                        onChange={(event) => setDebtorDetails2(event.target.value)}
                      />
                    </FormField>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      kind="primary"
                      icon={faPlus}
                      disabled={
                        isCreatingDebtor ||
                        !counterpartyName?.trim() ||
                        !debtorAddressLine.trim() ||
                        !debtorZip.trim() ||
                        !debtorCity.trim()
                      }
                      onClick={createDebtor}
                    >
                      {isCreatingDebtor ? "Wird angelegt…" : "Debitor anlegen"}
                    </Button>
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() => setShowCreateDebtorPanel(false)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </FormSection>

          <FormSection title="4. Notizen" icon={faCalendarCheck}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Notizen"
                hint="Hast du sonst noch was anzumerken?"
              >
                <Textarea {...register("notes")} />
              </FormField>

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
          </FormSection>

          <div className="sticky bottom-4 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
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
                className="ml-auto"
              >
                {isSubmitting
                  ? "Wird gespeichert…"
                  : "Speichern & PDF erstellen"}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
