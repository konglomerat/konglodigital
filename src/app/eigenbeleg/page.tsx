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

function createEigenbelegPdf(values: FormValues) {
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = document.internal.pageSize.getHeight();
  const leftMargin = 15;
  const rightMargin = 15;
  const maxWidth =
    document.internal.pageSize.getWidth() - leftMargin - rightMargin;
  let cursorY = 16;

  const writeHeading = (text: string) => {
    if (cursorY > pageHeight - 15) {
      document.addPage();
      cursorY = 16;
    }

    document.setFont("helvetica", "bold");
    document.setFontSize(12);
    document.text(text, leftMargin, cursorY);
    cursorY += 7;
  };

  const writeLine = (label: string, value: string) => {
    if (cursorY > pageHeight - 15) {
      document.addPage();
      cursorY = 16;
    }

    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    document.text(`${label}:`, leftMargin, cursorY);

    document.setFont("helvetica", "normal");
    const wrappedValue = document.splitTextToSize(value, maxWidth);
    document.text(wrappedValue, leftMargin + 40, cursorY);
    cursorY += Math.max(wrappedValue.length * 5, 6);
  };

  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.text("Eigenbeleg", leftMargin, cursorY);
  cursorY += 8;

  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  document.text(
    `Erstellt am: ${new Date().toLocaleString("de-DE")}`,
    leftMargin,
    cursorY,
  );
  cursorY += 9;

  writeHeading("Kontaktdaten");
  writeLine("E-Mail-Adresse", normalizeValue(values.email));

  writeHeading("Belegangaben");
  writeLine("Grund des Eigenbelegs", normalizeValue(values.reason));
  if (values.reason === "Sonstiges") {
    writeLine("Sonstiger Grund", normalizeValue(values.reasonOther));
  }
  writeLine("Anlass", normalizeValue(values.occasion));
  writeLine("Verweis auf Dokument", normalizeValue(values.documentReference));
  writeLine("Datum der Transaktion", getFormattedDate(values.transactionDate));
  writeLine("Nachweis-Datei", normalizeValue(values.evidence?.item(0)?.name));

  writeHeading("Aufwendung gesamt");
  writeLine("Einnahme Verein", normalizeValue(values.income));
  writeLine("Ausgabe Verein", normalizeValue(values.expense));
  writeLine("Umbuchung", normalizeValue(values.transferAmount));

  writeHeading("Sender [S]");
  writeLine("Name", normalizeValue(values.senderName));
  writeLine("Zusatzangaben", normalizeValue(values.senderAdditional));
  writeLine("Konto/Kasse", normalizeValue(values.senderAccount));
  writeLine("Bereich", normalizeValue(values.senderArea));
  writeLine("Projekt", normalizeValue(values.senderProject));
  writeLine("Aufteilung", normalizeValue(values.senderSplit));

  writeHeading("Empfaenger [E]");
  writeLine("Name", normalizeValue(values.receiverName));
  writeLine("Zusatzangaben", normalizeValue(values.receiverAdditional));
  writeLine("Konto/Kasse", normalizeValue(values.receiverAccount));
  writeLine("Bereich", normalizeValue(values.receiverArea));
  writeLine("Projekt", normalizeValue(values.receiverProject));
  writeLine("Aufteilung", normalizeValue(values.receiverSplit));

  writeHeading("Status & Notizen");
  writeLine("Rechnung beglichen", normalizeValue(values.invoiceStatus));
  writeLine("Notizen", normalizeValue(values.notes));

  const fileDate =
    values.transactionDate || new Date().toISOString().slice(0, 10);
  const fileName = `eigenbeleg-${fileDate}.pdf`;
  const bytes = new Uint8Array(document.output("arraybuffer"));
  document.save(fileName);
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
      createEigenbelegPdf(values);

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
