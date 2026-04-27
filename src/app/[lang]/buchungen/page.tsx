"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faBook,
  faBullseye,
  faBuilding,
  faCalendarCheck,
  faCamera,
  faCube,
  faFileInvoice,
  faFlask,
  faFolderOpen,
  faGear,
  faHeart,
  faLayerGroup,
  faArrowTrendDown,
  faArrowTrendUp,
  faMoneyBillTransfer,
  faWandMagicSparkles,
  faPlus,
  faPrint,
  faShirt,
  faStore,
  faTrash,
  faTree,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import Button from "../components/Button";
import PageTitle from "../components/PageTitle";
import ReactSelect from "../components/ui/react-select";
import { AutocompleteInput } from "../components/ui/autocomplete-input";
import {
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "../components/ui/form";

type KontoOption = "K0004 B" | "K0104 A" | "BAR" | "PAYPAL" | "Kreditkarte";
type InvoiceState = "offen" | "bezahlt";
type BookingType = "ausgabe" | "einnahme";

type AreaOption = {
  value: string;
  label: string;
  icon: IconProp;
};

type FormValues = {
  email: string;
  issueDate: string;
  senderOrReceiver: string;
  receiptNumber?: string;
  orderNumber?: string;
  bookingText: string;
  evidence?: FileList;
  bookingType: BookingType;
  amountEuro: string;
  accountCash: KontoOption;
  area?: string;
  project?: string;
  postens: Array<{ title: string; amountEuro?: string }>;
  notes?: string;
  invoiceState: InvoiceState;
  accountOwner?: string;
  iban?: string;
  inSystem: "im-system" | "sonstiges";
};

const amountPattern = /^\d+(?:[.,]\d{1,2})?$/;

const areaOptions: AreaOption[] = [
  { value: "3D-DRUCK", label: "3D-Druck", icon: faCube },
  { value: "DRUCK", label: "Druck", icon: faPrint },
  { value: "_BASIS", label: "_Basis", icon: faLayerGroup },
  { value: "BETON", label: "Beton", icon: faBuilding },
  { value: "CNC", label: "CNC", icon: faGear },
  { value: "ELEKTRO", label: "Elektro", icon: faBolt },
  { value: "FOTO/FILM", label: "Foto/Film", icon: faCamera },
  { value: "HOLZ", label: "Holz", icon: faTree },
  { value: "KUSS", label: "Kuss", icon: faHeart },
  { value: "LASER", label: "Laser", icon: faBullseye },
  { value: "N-BIBO", label: "N-Bibo", icon: faBook },
  { value: "PRINTSHOP", label: "Printshop", icon: faStore },
  { value: "TEXTIL", label: "Textil", icon: faShirt },
  { value: "ZÜNDSTOFFE", label: "Zündstoffe", icon: faFlask },
];

const testValues: Omit<FormValues, "evidence"> = {
  email: "test@konglomerat.org",
  issueDate: "2026-02-26",
  senderOrReceiver: "Amazon EU S.à r.l.",
  receiptNumber: "RE-2026-00981",
  orderNumber: "AMZ-774-9123",
  bookingText: "Materialbestellung für Werkbereich Holz",
  bookingType: "ausgabe",
  amountEuro: "89,90",
  accountCash: "K0104 A",
  area: "HOLZ",
  project: "#WerkbereichHolz",
  postens: [
    { title: "Holzplatten Birke", amountEuro: "59,90" },
    { title: "Schrauben und Verbrauchsmaterial", amountEuro: "30,00" },
  ],
  notes: "Bestellung über Amazon Marketplace",
  invoiceState: "bezahlt",
  accountOwner: "Konglomerat e.V.",
  iban: "DE12500105170648489890",
  inSystem: "im-system",
};

function normalizeValue(value?: string) {
  if (!value) {
    return "-";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "-";
}

function parseEuroToCents(value?: string) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function formatCentsToEuro(cents: number) {
  const value = Math.max(0, cents) / 100;
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function createBuchungPdf(values: FormValues) {
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = document.internal.pageSize.getHeight();
  const maxWidth = document.internal.pageSize.getWidth() - 30;
  let y = 16;

  const heading = (text: string) => {
    if (y > pageHeight - 20) {
      document.addPage();
      y = 16;
    }
    document.setFont("helvetica", "bold");
    document.setFontSize(12);
    document.text(text, 15, y);
    y += 7;
  };

  const line = (label: string, value: string) => {
    if (y > pageHeight - 20) {
      document.addPage();
      y = 16;
    }
    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    document.text(`${label}:`, 15, y);
    document.setFont("helvetica", "normal");
    const wrapped = document.splitTextToSize(value, maxWidth - 35);
    document.text(wrapped, 50, y);
    y += Math.max(6, wrapped.length * 5);
  };

  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.text("Generator Buchungen", 15, y);
  y += 8;
  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  document.text(`Erstellt am: ${new Date().toLocaleString("de-DE")}`, 15, y);
  y += 10;

  heading("Belegangaben");
  line("E-Mail", normalizeValue(values.email));
  line("Ausstellungsdatum", normalizeValue(values.issueDate));
  line("Sender/Empfänger", normalizeValue(values.senderOrReceiver));
  line("Rechnungs-/Belegnummer", normalizeValue(values.receiptNumber));
  line("Bestell-/Vorgangsnummer", normalizeValue(values.orderNumber));
  line("Buchungstext", normalizeValue(values.bookingText));
  line("Nachweis-Datei", normalizeValue(values.evidence?.item(0)?.name));

  heading("Betrag");
  line(
    "Buchungsart",
    values.bookingType === "ausgabe" ? "Ausgabe" : "Einnahme",
  );
  line("Betrag in Euro", normalizeValue(values.amountEuro));

  heading("Metadaten");
  line("Konto/Kasse", values.accountCash);
  line("Bereich", normalizeValue(values.area));
  line("Projekt", normalizeValue(values.project));
  line(
    "Posten",
    values.postens
      .map((posten) => {
        const title = posten.title.trim();
        const amount = posten.amountEuro?.trim();
        if (!title && !amount) {
          return "";
        }
        return amount ? `${title || "Posten"} (${amount} €)` : title;
      })
      .filter(Boolean)
      .map((posten, index) => `${index + 1}. ${posten}`)
      .join("\n") || "-",
  );
  line("Notizen", normalizeValue(values.notes));

  heading("Rechnungsstand / Überweisung");
  line("Ist bereits beglichen?", values.invoiceState);
  line("Kontoinhaber", normalizeValue(values.accountOwner));
  line("IBAN", normalizeValue(values.iban));
  line("Im System", values.inSystem);

  const datePart = values.issueDate || new Date().toISOString().slice(0, 10);
  const fileName = `buchung-${datePart}.pdf`;
  const bytes = new Uint8Array(document.output("arraybuffer"));
  document.save(fileName);
  return { fileName, bytes };
}

async function mergeEvidenceWithGeneratedPdf(
  evidenceFile: File | null,
  generatedBytes: Uint8Array,
  generatedName: string,
) {
  if (!evidenceFile) {
    return {
      bytes: generatedBytes,
      fileName: generatedName,
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
        "Nachweis ist kein PDF. Der generierte Buchungsbeleg wurde nicht angehängt.",
    };
  }

  const evidenceBytes = new Uint8Array(await evidenceFile.arrayBuffer());
  const mergedPdf = await PDFDocument.create();
  const evidencePdf = await PDFDocument.load(evidenceBytes);
  const generatedPdf = await PDFDocument.load(generatedBytes);

  const firstPages = await mergedPdf.copyPages(
    evidencePdf,
    evidencePdf.getPageIndices(),
  );
  for (const page of firstPages) {
    mergedPdf.addPage(page);
  }

  const secondPages = await mergedPdf.copyPages(
    generatedPdf,
    generatedPdf.getPageIndices(),
  );
  for (const page of secondPages) {
    mergedPdf.addPage(page);
  }

  const mergedBytes = new Uint8Array(await mergedPdf.save());
  const mergedName = `${evidenceFile.name.replace(/\.pdf$/i, "")}-mit-buchung.pdf`;
  return {
    bytes: mergedBytes,
    fileName: mergedName,
    contentType: "application/pdf",
    warning: undefined as string | undefined,
  };
}

export default function BuchungenPage() {
  const {
    register,
    handleSubmit,
    control,
    clearErrors,
    getValues,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      bookingType: "ausgabe",
      amountEuro: "",
      postens: [{ title: "", amountEuro: "" }],
      accountCash: "K0004 B",
      invoiceState: "offen",
      inSystem: "im-system",
    },
  });

  const {
    fields: postenFields,
    append,
    remove,
    replace,
  } = useFieldArray({
    control,
    name: "postens",
  });

  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [fillOnlyEmptyFields, setFillOnlyEmptyFields] = useState(true);
  const [storeResult, setStoreResult] = useState<{
    id?: string | null;
    warning?: string;
    error?: string;
  } | null>(null);

  const selectedEvidence = useWatch({ control, name: "evidence" });
  const selectedBookingType = useWatch({ control, name: "bookingType" });
  const selectedArea = useWatch({ control, name: "area" });
  const watchedPostens = useWatch({ control, name: "postens" }) ?? [];
  const selectedAreaOption =
    areaOptions.find((option) => option.value === selectedArea) ?? null;
  const selectedEvidenceName = useMemo(() => {
    if (!selectedEvidence || selectedEvidence.length === 0) {
      return "";
    }
    return selectedEvidence.item(0)?.name ?? "";
  }, [selectedEvidence]);

  const extractFromEvidence = async () => {
    const file = selectedEvidence?.item(0);
    if (!file) {
      setExtractMessage(
        "Bitte zuerst eine Datei bei 'Beleg hochladen' auswählen.",
      );
      return;
    }

    setIsExtracting(true);
    setExtractMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/openai/buchungen", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        setExtractMessage(
          typeof payload.error === "string"
            ? payload.error
            : "Extraktion fehlgeschlagen.",
        );
        return;
      }

      const currentValues = getValues();
      const canApply = (currentValue: unknown) => {
        if (!fillOnlyEmptyFields) {
          return true;
        }
        if (typeof currentValue === "string") {
          return currentValue.trim().length === 0;
        }
        if (Array.isArray(currentValue)) {
          return currentValue.length === 0;
        }
        return currentValue === null || currentValue === undefined;
      };

      if (
        typeof payload.issueDate === "string" &&
        canApply(currentValues.issueDate)
      ) {
        setValue("issueDate", payload.issueDate, { shouldDirty: true });
      }
      if (
        typeof payload.senderOrReceiver === "string" &&
        canApply(currentValues.senderOrReceiver)
      ) {
        setValue("senderOrReceiver", payload.senderOrReceiver, {
          shouldDirty: true,
        });
      }
      if (
        typeof payload.receiptNumber === "string" &&
        canApply(currentValues.receiptNumber)
      ) {
        setValue("receiptNumber", payload.receiptNumber, { shouldDirty: true });
      }
      if (
        typeof payload.orderNumber === "string" &&
        canApply(currentValues.orderNumber)
      ) {
        setValue("orderNumber", payload.orderNumber, { shouldDirty: true });
      }
      if (
        typeof payload.bookingText === "string" &&
        canApply(currentValues.bookingText)
      ) {
        setValue("bookingText", payload.bookingText, { shouldDirty: true });
      }
      if (
        (payload.bookingType === "ausgabe" ||
          payload.bookingType === "einnahme") &&
        canApply(currentValues.bookingType)
      ) {
        setValue("bookingType", payload.bookingType, { shouldDirty: true });
      }
      if (
        typeof payload.amountEuro === "string" &&
        canApply(currentValues.amountEuro)
      ) {
        setValue("amountEuro", payload.amountEuro, { shouldDirty: true });
      }
      if (
        payload.accountCash === "K0004 B" ||
        payload.accountCash === "K0104 A" ||
        payload.accountCash === "BAR" ||
        payload.accountCash === "PAYPAL" ||
        payload.accountCash === "Kreditkarte"
      ) {
        if (canApply(currentValues.accountCash)) {
          setValue("accountCash", payload.accountCash, { shouldDirty: true });
        }
      }
      if (typeof payload.area === "string" && canApply(currentValues.area)) {
        setValue("area", payload.area, { shouldDirty: true });
      }
      if (
        typeof payload.project === "string" &&
        canApply(currentValues.project)
      ) {
        setValue("project", payload.project, { shouldDirty: true });
      }
      if (typeof payload.notes === "string" && canApply(currentValues.notes)) {
        setValue("notes", payload.notes, { shouldDirty: true });
      }
      if (
        (payload.invoiceState === "offen" ||
          payload.invoiceState === "bezahlt") &&
        canApply(currentValues.invoiceState)
      ) {
        setValue("invoiceState", payload.invoiceState, { shouldDirty: true });
      }
      if (
        typeof payload.accountOwner === "string" &&
        canApply(currentValues.accountOwner)
      ) {
        setValue("accountOwner", payload.accountOwner, { shouldDirty: true });
      }
      if (typeof payload.iban === "string" && canApply(currentValues.iban)) {
        setValue("iban", payload.iban, { shouldDirty: true });
      }

      if (Array.isArray(payload.postens) && payload.postens.length > 0) {
        const nextPostens = payload.postens
          .filter(
            (entry): entry is { title: string; amountEuro?: string } =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { title?: unknown }).title === "string",
          )
          .map((entry) => ({
            title: entry.title,
            amountEuro:
              typeof entry.amountEuro === "string" ? entry.amountEuro : "",
          }));

        const hasExistingPostens = (currentValues.postens ?? []).some(
          (posten) =>
            posten.title.trim().length > 0 ||
            (posten.amountEuro?.trim().length ?? 0) > 0,
        );

        if (
          nextPostens.length > 0 &&
          (!fillOnlyEmptyFields || !hasExistingPostens)
        ) {
          replace(nextPostens);
        }
      }

      clearErrors();
      setExtractMessage(
        "Felder wurden aus dem Beleg vorausgefüllt. Bitte kurz prüfen.",
      );
    } catch {
      setExtractMessage("Extraktion fehlgeschlagen.");
    } finally {
      setIsExtracting(false);
    }
  };

  const postenTotalCents = useMemo(
    () =>
      watchedPostens.reduce(
        (sum, posten) => sum + parseEuroToCents(posten.amountEuro),
        0,
      ),
    [watchedPostens],
  );

  const hasPostenAmounts = postenTotalCents > 0;

  useEffect(() => {
    if (!hasPostenAmounts) {
      return;
    }
    const formatted = formatCentsToEuro(postenTotalCents);
    setValue("amountEuro", formatted, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }, [hasPostenAmounts, postenTotalCents, setValue]);

  const onSubmit = async (values: FormValues) => {
    if (!values.amountEuro?.trim()) {
      setError("amountEuro", {
        type: "required",
        message: "Bitte einen Betrag eintragen.",
      });
      return;
    }

    clearErrors("amountEuro");

    const { fileName, bytes } = createBuchungPdf(values);
    const evidenceFile = values.evidence?.item(0) ?? null;
    const attachment = await mergeEvidenceWithGeneratedPdf(
      evidenceFile,
      bytes,
      fileName,
    );

    const isExpenseFlow = values.bookingType === "ausgabe";
    const senderName = isExpenseFlow
      ? "Konglomerat e.V."
      : values.senderOrReceiver;
    const receiverName = isExpenseFlow
      ? values.senderOrReceiver
      : "Konglomerat e.V.";
    const expense = isExpenseFlow ? values.amountEuro : "";
    const income = isExpenseFlow ? "" : values.amountEuro;
    const notes = [
      values.notes,
      `Buchungsart: ${isExpenseFlow ? "Ausgabe" : "Einnahme"}`,
      values.receiptNumber ? `Rechnungsnummer: ${values.receiptNumber}` : "",
      values.orderNumber ? `Vorgang: ${values.orderNumber}` : "",
      values.accountOwner ? `Kontoinhaber: ${values.accountOwner}` : "",
      values.iban ? `IBAN: ${values.iban}` : "",
      `Konto/Kasse: ${values.accountCash}`,
      values.postens
        .map((posten) => {
          const title = posten.title.trim();
          const amount = posten.amountEuro?.trim();
          if (!title && !amount) {
            return "";
          }
          return amount ? `${title || "Posten"} (${amount} €)` : title;
        })
        .filter(Boolean)
        .map((posten, index) => `Posten ${index + 1}: ${posten}`)
        .join(" | "),
    ]
      .filter(Boolean)
      .join(" | ");

    const response = await fetch("/api/campai/receipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "Buchung",
        occasion: values.bookingText,
        notes,
        transactionDate: values.issueDate,
        expense,
        income,
        senderName,
        receiverName,
        senderArea: values.area,
        receiverArea: values.area,
        senderProject: values.project,
        receiverProject: values.project,
        receiptFileBase64: bytesToBase64(attachment.bytes),
        receiptFileName: attachment.fileName,
        receiptFileContentType: attachment.contentType,
      }),
    });

    if (response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string | null;
        uploadWarning?: string;
      };
      const warning = [attachment.warning, payload.uploadWarning]
        .filter(Boolean)
        .join(" ")
        .trim();
      setStoreResult({ id: payload.id ?? null, warning: warning || undefined });
    } else {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setStoreResult({
        error: payload.error ?? "Speichern in Campai fehlgeschlagen.",
      });
    }

    setSubmittedAt(new Date().toLocaleString("de-DE"));
  };

  const handleLoadTestData = () => {
    reset(testValues);
    clearErrors();
    setSubmittedAt(null);
    setStoreResult(null);
  };

  return (
    <div className="min-h-screen bg-muted/50 text-foreground">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        <PageTitle
          title="Generator Buchungen"
          subTitle="Einbuchung von Rechnungen und Belegen für Einnahmen oder Ausgaben des Vereins, seiner Projekte und Werkbereiche."
        />

        <p className="text-xs text-muted-foreground">
          Pflichtfelder sind mit * markiert.
        </p>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <FormSection title="Belegangaben" icon={faFolderOpen}>
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

              <FormField
                label="Ausstellungsdatum Beleg"
                required
                error={errors.issueDate?.message}
              >
                <Input
                  type="date"
                  {...register("issueDate", {
                    required: "Ausstellungsdatum ist erforderlich.",
                  })}
                />
              </FormField>

              <FormField
                label="Sender/Empfänger"
                required
                hint="Bei Ausgaben: Zahlungsempfänger. Bei Einnahmen: Zahler an den Verein."
                error={errors.senderOrReceiver?.message}
              >
                <AutocompleteInput
                  placeholder="z. B. Amazon / Mitgliedsname"
                  {...register("senderOrReceiver", {
                    required: "Sender/Empfänger ist erforderlich.",
                  })}
                />
              </FormField>

              <FormField
                label="Rechnungs-/Belegnummer"
                hint="Nur Belegnummer, keine Bestell- oder Kundennummer"
              >
                <Input {...register("receiptNumber")} />
              </FormField>

              <FormField
                label="Bestell-/Vorgangsnummer"
                hint="Besonders wichtig bei Amazon / PayPal"
              >
                <Input {...register("orderNumber")} />
              </FormField>

              <FormField
                label="Buchungstext"
                required
                error={errors.bookingText?.message}
              >
                <Textarea
                  placeholder="Kurze Zusammenfassung der Leistung/Gegenstände"
                  {...register("bookingText", {
                    required: "Buchungstext ist erforderlich.",
                  })}
                />
              </FormField>

              <FormField
                label="Beleg hochladen"
                required
                hint="1 Datei, max. 10 MB (PDF, Dokument, Bild oder Tabelle)"
                error={errors.evidence?.message as string | undefined}
              >
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.odt,.ods,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                  {...register("evidence", {
                    validate: {
                      required: (files) =>
                        !!files?.length || "Bitte einen Beleg hochladen.",
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
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Ausgewählt: {selectedEvidenceName}
                    </p>
                    <Button
                      type="button"
                      kind="secondary"
                      icon={faWandMagicSparkles}
                      onClick={extractFromEvidence}
                      disabled={isExtracting}
                    >
                      {isExtracting
                        ? "Beleg wird analysiert…"
                        : "PDF auslesen (GPT)"}
                    </Button>
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={fillOnlyEmptyFields}
                        onChange={(event) =>
                          setFillOnlyEmptyFields(event.target.checked)
                        }
                      />
                      Nur leere Felder füllen
                    </label>
                    {extractMessage ? (
                      <p className="text-xs text-muted-foreground">
                        {extractMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Einnahme oder Ausgabe" icon={faMoneyBillTransfer}>
            <div className="space-y-4">
              <input type="hidden" {...register("bookingType")} />
              <div className="inline-flex rounded-xl border border-border bg-accent p-1">
                <button
                  type="button"
                  onClick={() => setValue("bookingType", "ausgabe")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    selectedBookingType === "ausgabe"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
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
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
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

              <FormField
                label={
                  selectedBookingType === "einnahme"
                    ? "Einnahme in Euro"
                    : "Ausgabe in Euro"
                }
                required
                hint={
                  hasPostenAmounts
                    ? `Automatisch aus Posten summiert: ${formatCentsToEuro(postenTotalCents)} €`
                    : "Optional manuell eintragen, wenn keine Posten-Beträge gepflegt sind."
                }
                error={errors.amountEuro?.message}
              >
                <Input
                  placeholder={
                    selectedBookingType === "einnahme"
                      ? "z. B. 30,00"
                      : "z. B. 95,00"
                  }
                  readOnly={hasPostenAmounts}
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
          </FormSection>

          <FormSection title="Metadaten" icon={faUser}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Konto/Kasse" required>
                <Select {...register("accountCash")}>
                  <option value="K0004 B">K0004 B</option>
                  <option value="K0104 A">K0104 A</option>
                  <option value="BAR">BAR</option>
                  <option value="PAYPAL">PAYPAL</option>
                  <option value="Kreditkarte">Kreditkarte</option>
                </Select>
              </FormField>
              <FormField label="Bereich" hint="Werkbereich auswählen">
                <input type="hidden" {...register("area")} />
                <ReactSelect<AreaOption, false>
                  options={areaOptions}
                  value={selectedAreaOption}
                  onChange={(option) => {
                    setValue("area", option?.value ?? "", {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                  placeholder="Bereich auswählen"
                  isClearable
                  formatOptionLabel={(option) => (
                    <span className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={option.icon}
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                      <span>{option.label}</span>
                    </span>
                  )}
                  className="text-sm"
                />
              </FormField>
              <FormField label="#Projekt" hint="Hashtag nicht vergessen!">
                <Input {...register("project")} />
              </FormField>
              <FormField
                label="Posten"
                hint="Mehrere Posten möglich (ein Posten pro Zeile)"
              >
                <div className="space-y-2">
                  {postenFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Input
                        placeholder={`Posten ${index + 1}`}
                        {...register(`postens.${index}.title` as const)}
                      />
                      <Input
                        placeholder="Betrag €"
                        className="max-w-36"
                        {...register(`postens.${index}.amountEuro` as const, {
                          pattern: {
                            value: amountPattern,
                            message: "Ungültiger Betrag",
                          },
                        })}
                      />
                      <Button
                        type="button"
                        kind="secondary"
                        icon={faTrash}
                        onClick={() => remove(index)}
                        disabled={postenFields.length === 1}
                      >
                        Entfernen
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    kind="secondary"
                    icon={faPlus}
                    onClick={() => append({ title: "", amountEuro: "" })}
                  >
                    Posten hinzufügen
                  </Button>
                </div>
              </FormField>
              <FormField label="Notizen">
                <Textarea {...register("notes")} />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Rechnungsstand / Überweisungsauftrag"
            icon={faCalendarCheck}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Ist die Rechnung bereits beglichen?" required>
                <Select {...register("invoiceState")}>
                  <option value="offen">offen</option>
                  <option value="bezahlt">bezahlt</option>
                </Select>
              </FormField>
              <FormField label="Kontoinhaber">
                <Input {...register("accountOwner")} />
              </FormField>
              <FormField label="IBAN">
                <Input {...register("iban")} />
              </FormField>
              <FormField label="Im System">
                <Select {...register("inSystem")}>
                  <option value="im-system">Im System</option>
                  <option value="sonstiges">Sonstiges</option>
                </Select>
              </FormField>
            </div>
          </FormSection>

          <div className="sticky bottom-4 z-20 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              {submittedAt ? (
                <p className="text-sm text-success">
                  Formular lokal erfasst: {submittedAt}
                </p>
              ) : null}
              {storeResult?.id ? (
                <p className="text-sm text-success">
                  In Campai gespeichert: {storeResult.id}
                </p>
              ) : null}
              {storeResult?.warning ? (
                <p className="text-sm text-warning">{storeResult.warning}</p>
              ) : null}
              {storeResult?.error ? (
                <p className="text-sm text-destructive">{storeResult.error}</p>
              ) : null}

              <Button
                type="button"
                kind="secondary"
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
                  : "Buchung speichern & PDF erstellen"}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
