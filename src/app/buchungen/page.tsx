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
  faFileInvoice,
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

type BookingType = "ausgabe" | "einnahme";
type AssociationAccount = "K0004 B" | "K0104 A" | "BAR" | "PAYPAL" | "Kreditkarte";
type CostCenterOption = {
  value: string;
  label: string;
};
type CreditorPaymentMethodType = "creditTransfer" | "cash";

type FormValues = {
  issueDate: string;
  bookingText: string;
  receiptNumber: string;
  evidence?: FileList;
  noEvidence: boolean;
  eigenbelegReason?: string;
  bookingType: BookingType;
  amountEuro: string;
  counterpartyName: string;
  counterpartyAccount: string;
  associationArea: string;
  associationAccount: AssociationAccount;
  notes?: string;
  alreadyRefunded: boolean;
};

type ReceiptValues = {
  transactionDate: string;
  occasion: string;
  reason: string;
  documentReference?: string;
  income?: string;
  expense?: string;
  senderName: string;
  senderAccount?: string;
  senderArea?: string;
  receiverName: string;
  receiverAccount?: string;
  receiverArea?: string;
  invoiceStatus: "offen" | "bezahlt";
  notes?: string;
};

const associationName = "Konglomerat e.V.";
const amountPattern = /^\d+(?:[.,]\d{1,2})?$/;

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

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}

function normalizeValue(value?: string) {
  if (!value) {
    return "-";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "-";
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

function formatAmount(value?: string) {
  if (!value || !value.trim()) {
    return "-";
  }

  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return value.trim();
  }

  return parsed.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generateEigenbelegNumber(date: string) {
  const baseDate = date ? new Date(date) : new Date();
  const safeDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const yyyy = safeDate.getFullYear();
  const mm = String(safeDate.getMonth() + 1).padStart(2, "0");
  const dd = String(safeDate.getDate()).padStart(2, "0");
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `EGB-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function createEigenbelegPdf(values: ReceiptValues) {
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = document.internal.pageSize.getHeight();
  const maxWidth = document.internal.pageSize.getWidth() - 36;
  const belegnummer = generateEigenbelegNumber(values.transactionDate);
  let y = 20;

  const ensureSpace = (minHeight = 10) => {
    if (y <= pageHeight - minHeight) {
      return;
    }
    document.addPage();
    y = 20;
  };

  const heading = (text: string) => {
    ensureSpace(14);
    document.setFont("helvetica", "bold");
    document.setFontSize(13);
    document.text(text, 18, y);
    y += 8;
  };

  const line = (label: string, value: string) => {
    ensureSpace(12);
    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    document.text(`${label}:`, 18, y);
    document.setFont("helvetica", "normal");
    const wrapped = document.splitTextToSize(value, maxWidth - 44);
    document.text(wrapped, 62, y);
    y += Math.max(6, wrapped.length * 5);
  };

  document.setFont("helvetica", "bold");
  document.setFontSize(18);
  document.text("Eigenbeleg", 18, y);
  y += 9;
  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  document.text(`Belegnummer: ${belegnummer}`, 18, y);
  y += 6;
  document.text(`Erstellt am: ${new Date().toLocaleString("de-DE")}`, 18, y);
  y += 10;

  heading("Belegangaben");
  line("Grund", normalizeValue(values.reason));
  line("Datum", normalizeValue(values.transactionDate));
  line("Buchungstext", normalizeValue(values.occasion));
  line("Rechnungsnummer", normalizeValue(values.documentReference));

  heading("Beteiligte");
  line(
    "Sender",
    [values.senderName, values.senderAccount, values.senderArea]
      .filter((entry) => typeof entry === "string" && entry.trim())
      .join(" | ") || "-",
  );
  line(
    "Empfänger",
    [values.receiverName, values.receiverAccount, values.receiverArea]
      .filter((entry) => typeof entry === "string" && entry.trim())
      .join(" | ") || "-",
  );

  heading("Betrag und Status");
  line("Einnahme", formatAmount(values.income));
  line("Ausgabe", formatAmount(values.expense));
  line("Status", values.invoiceStatus === "bezahlt" ? "bezahlt" : "offen");

  heading("Notizen");
  line("Hinweise", normalizeValue(values.notes));

  const fileDate = values.transactionDate || new Date().toISOString().slice(0, 10);
  const fileName = `eigenbeleg-${fileDate}.pdf`;
  const bytes = new Uint8Array(document.output("arraybuffer"));
  document.save(fileName);
  return { fileName, bytes };
}

function buildReceiptValues(
  values: FormValues,
  associationAreaLabel?: string,
): ReceiptValues {
  const invoiceStatus: ReceiptValues["invoiceStatus"] = values.alreadyRefunded
    ? "bezahlt"
    : "offen";

  const baseValues = {
    transactionDate: values.issueDate,
    occasion: values.bookingText,
    reason: values.noEvidence
      ? `Eigenbeleg: ${normalizeValue(values.eigenbelegReason)}`
      : "Belegbuchung",
    documentReference: values.receiptNumber,
    invoiceStatus,
    notes: values.notes,
  };

  if (values.bookingType === "ausgabe") {
    return {
      ...baseValues,
      income: undefined,
      expense: values.amountEuro,
      senderName: associationName,
      senderAccount: values.associationAccount,
      senderArea: associationAreaLabel,
      receiverName: values.counterpartyName,
      receiverAccount: values.counterpartyAccount,
      receiverArea: undefined,
    };
  }

  return {
    ...baseValues,
    income: values.amountEuro,
    expense: undefined,
    senderName: values.counterpartyName,
    senderAccount: values.counterpartyAccount,
    senderArea: undefined,
    receiverName: associationName,
    receiverAccount: values.associationAccount,
    receiverArea: associationAreaLabel,
  };
}

async function buildCampaiAttachment(values: FormValues, receiptValues: ReceiptValues) {
  if (!values.noEvidence) {
    const evidenceFile = values.evidence?.item(0);
    if (!evidenceFile) {
      throw new Error("Bitte einen Beleg hochladen oder 'Beleg nicht vorhanden' aktivieren.");
    }

    return {
      bytes: new Uint8Array(await evidenceFile.arrayBuffer()),
      fileName: evidenceFile.name,
      contentType: evidenceFile.type || "application/octet-stream",
      warning: undefined as string | undefined,
    };
  }

  const { fileName, bytes } = createEigenbelegPdf(receiptValues);
  return {
    bytes,
    fileName,
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
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      issueDate: new Date().toISOString().slice(0, 10),
      bookingText: "",
      receiptNumber: "",
      noEvidence: false,
      eigenbelegReason: "",
      bookingType: "ausgabe",
      amountEuro: "",
      counterpartyName: "",
      counterpartyAccount: "",
      associationArea: "",
      associationAccount: "K0104 A",
      notes: "",
      alreadyRefunded: false,
    },
  });

  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [storeResult, setStoreResult] = useState<{
    id?: string | null;
    error?: string;
    warning?: string;
  } | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
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

  const selectedEvidence = useWatch({ control, name: "evidence" });
  const selectedBookingType = useWatch({ control, name: "bookingType" });
  const selectedNoEvidence = useWatch({ control, name: "noEvidence" });
  const counterpartyName = useWatch({ control, name: "counterpartyName" }) ?? "";
  const counterpartyAccount =
    useWatch({ control, name: "counterpartyAccount" }) ?? "";
  const selectedAssociationArea =
    useWatch({ control, name: "associationArea" }) ?? "";

  const isExpenseFlow = selectedBookingType !== "einnahme";
  const counterpartyApiPath = isExpenseFlow
    ? "/api/campai/creditors"
    : "/api/campai/debtors";
  const counterpartyEntityLabel = isExpenseFlow ? "Kreditor" : "Debitor";
  const activeCounterpartyError = isExpenseFlow ? creditorError : debtorError;
  const selectedEvidenceName = useMemo(() => {
    if (!selectedEvidence || selectedEvidence.length === 0) {
      return "";
    }
    return selectedEvidence.item(0)?.name ?? "";
  }, [selectedEvidence]);
  const selectedAssociationAreaLabel =
    costCenters.find((option) => option.value === selectedAssociationArea)?.label ??
    undefined;

  useEffect(() => {
    setValue("counterpartyName", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setCreditorError(null);
    setDebtorError(null);
  }, [selectedBookingType, setValue]);

  useEffect(() => {
    if (!selectedNoEvidence) {
      clearErrors("eigenbelegReason");
      return;
    }

    clearErrors("evidence");
  }, [clearErrors, selectedNoEvidence]);

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

  const resetCounterparty = () => {
    setValue("counterpartyName", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: true,
      shouldValidate: true,
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
      shouldValidate: true,
    });
    setShowCreateCreditorPanel(false);
    setShowCreateDebtorPanel(false);
    setCreditorError(null);
    setDebtorError(null);
    clearErrors("counterpartyName");
  };

  const handleCreateCreditor = (name: string) => {
    setValue("counterpartyName", name, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("counterpartyAccount", "", {
      shouldDirty: true,
      shouldValidate: true,
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
      shouldValidate: true,
    });
    setShowCreateDebtorPanel(true);
    setShowCreateCreditorPanel(false);
    setDebtorError(null);
  };

  const createCreditor = async () => {
    setIsCreatingCreditor(true);
    setCreditorError(null);

    try {
      const trimmedName = counterpartyName.trim();
      if (!trimmedName) {
        setCreditorError("Bitte zuerst einen Kreditorennamen eingeben.");
        return;
      }

      const payload: {
        name: string;
        type: "business";
        paymentMethodType: CreditorPaymentMethodType;
        iban?: string;
        kontoinhaber?: string;
      } = {
        name: trimmedName,
        type: "business",
        paymentMethodType: creditorPaymentMethodType,
      };

      if (creditorPaymentMethodType === "creditTransfer") {
        payload.iban = creditorIban.replace(/\s+/g, "").toUpperCase();
        payload.kontoinhaber = creditorKontoinhaber.trim();
      }

      const response = await fetch("/api/campai/creditors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setCreditorError(data.error ?? "Kreditor konnte nicht erstellt werden.");
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        account?: number;
        name?: string;
      };

      if (typeof data.account !== "number" || data.account <= 0) {
        setCreditorError(
          "Kreditor wurde erstellt, aber die Kontonummer konnte nicht ermittelt werden.",
        );
        return;
      }

      handleCounterpartySelect({
        account: data.account,
        name: data.name ?? trimmedName,
      });
    } catch (error) {
      setCreditorError(
        error instanceof Error
          ? error.message
          : "Kreditor konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingCreditor(false);
    }
  };

  const createDebtor = async () => {
    setDebtorError(null);

    const trimmedName = counterpartyName.trim();
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
      const response = await fetch("/api/campai/debtors", {
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

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setDebtorError(data.error ?? "Debitor konnte nicht erstellt werden.");
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        account?: number;
        name?: string;
      };

      if (typeof data.account !== "number" || data.account <= 0) {
        setDebtorError(
          "Debitor wurde erstellt, aber die Debitorennummer konnte nicht ermittelt werden.",
        );
        return;
      }

      handleCounterpartySelect({
        account: data.account,
        name: data.name ?? trimmedName,
      });
    } catch (error) {
      setDebtorError(
        error instanceof Error
          ? error.message
          : "Debitor konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingDebtor(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!values.counterpartyAccount?.trim()) {
      setError("counterpartyName", {
        type: "required",
        message: `Bitte einen ${counterpartyEntityLabel} aus der Liste auswählen.`,
      });
      return;
    }

    if (values.noEvidence && !values.eigenbelegReason?.trim()) {
      setError("eigenbelegReason", {
        type: "required",
        message: "Bitte den Grund des Eigenbelegs eintragen.",
      });
      return;
    }

    if (!values.noEvidence && (!values.evidence || values.evidence.length === 0)) {
      setError("evidence", {
        type: "required",
        message: "Bitte einen Beleg hochladen oder 'Beleg nicht vorhanden' aktivieren.",
      });
      return;
    }

    clearErrors("counterpartyName");
    clearErrors("eigenbelegReason");
    clearErrors("evidence");

    try {
      const receiptValues = buildReceiptValues(values, selectedAssociationAreaLabel);
      const attachment = await buildCampaiAttachment(values, receiptValues);

      const notes = [
        values.notes?.trim(),
        values.receiptNumber.trim()
          ? `Rechnungsnummer: ${values.receiptNumber.trim()}`
          : "",
        values.noEvidence
          ? `Grund des Eigenbelegs: ${values.eigenbelegReason?.trim() ?? ""}`
          : "Originalbeleg hochgeladen",
        `Vom Verein bereits erstattet: ${values.alreadyRefunded ? "ja" : "nein"}`,
        `Konto/Kasse: ${values.associationAccount}`,
        selectedAssociationAreaLabel
          ? `Kostenstelle 2: ${selectedAssociationAreaLabel}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const response = await fetch("/api/campai/receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: values.noEvidence ? "Eigenbeleg" : "Belegbuchung",
          occasion: values.bookingText,
          notes,
          transactionDate: values.issueDate,
          income: values.bookingType === "einnahme" ? values.amountEuro : "",
          expense: values.bookingType === "ausgabe" ? values.amountEuro : "",
          senderName: receiptValues.senderName,
          receiverName: receiptValues.receiverName,
          senderArea: receiptValues.senderArea,
          receiverArea: receiptValues.receiverArea,
          bookingType: values.bookingType,
          counterpartyAccount: values.counterpartyAccount,
          counterpartyName: values.counterpartyName,
          costCenter2: values.associationArea,
          refund: values.alreadyRefunded,
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
        setStoreResult({
          id: payload.id ?? null,
          warning: warning || undefined,
        });
      } else {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setStoreResult({
          error: payload.error ?? "Speichern in Campai fehlgeschlagen.",
        });
      }

      setSubmittedAt(new Date().toLocaleString("de-DE"));
    } catch (error) {
      setStoreResult({
        error:
          error instanceof Error
            ? error.message
            : "Speichern in Campai fehlgeschlagen.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        <header className="space-y-3">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-blue-600 shadow-sm">
              <FontAwesomeIcon icon={faFileInvoice} className="h-5 w-5" />
            </span>
            <span>Buchhaltung</span>
          </h1>
          <p className="max-w-4xl text-sm leading-relaxed text-zinc-600">
            Beleg einbuchen oder direkt einen Eigenbeleg erzeugen, wenn kein
            Originalbeleg vorhanden ist.
          </p>
          <p className="text-xs text-zinc-500">
            Pflichtfelder sind mit * markiert.
          </p>
        </header>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <FormSection title="1. Belegangaben" icon={faFolderOpen}>
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Datum"
                  required
                  error={errors.issueDate?.message}
                >
                  <Input
                    type="date"
                    {...register("issueDate", {
                      required: "Bitte ein Datum auswählen.",
                    })}
                  />
                </FormField>

                <FormField
                  label="Rechnungsnummer"
                  error={errors.receiptNumber?.message}
                >
                  <Input
                    placeholder="Optional"
                    {...register("receiptNumber")}
                  />
                </FormField>
              </div>

              <FormField
                label="Buchungstext"
                required
                error={errors.bookingText?.message}
              >
                <Textarea
                  placeholder="Bitte den Vorgang kurz beschreiben"
                  {...register("bookingText", {
                    required: "Bitte einen Buchungstext eingeben.",
                  })}
                />
              </FormField>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Beleg upload"
                  required={!selectedNoEvidence}
                  hint="Eine Datei, die in Campai als Beleg angehangen wird"
                  error={errors.evidence?.message as string | undefined}
                >
                  <Input
                    type="file"
                    disabled={selectedNoEvidence}
                    accept=".pdf,.doc,.docx,.odt,.ods,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    {...register("evidence", {
                      validate: {
                        requiredUnlessNoEvidence: (files) => {
                          if (selectedNoEvidence) {
                            return true;
                          }
                          return (
                            !!files?.length ||
                            "Bitte einen Beleg hochladen oder 'Beleg nicht vorhanden' aktivieren."
                          );
                        },
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

                <FormField label="Belegstatus">
                  <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      autoComplete="off"
                      {...register("noEvidence")}
                    />
                    Beleg nicht vorhanden
                  </label>
                </FormField>
              </div>

              {selectedNoEvidence ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                  <FormField
                    label="Grund des Eigenbelegs"
                    required
                    hint="Dieser Text wird in den generierten Eigenbeleg übernommen und in Campai angehangen."
                    error={errors.eigenbelegReason?.message}
                  >
                    <Textarea
                      placeholder="Warum liegt kein Originalbeleg vor?"
                      {...register("eigenbelegReason")}
                    />
                  </FormField>
                </div>
              ) : null}
            </div>
          </FormSection>

          <FormSection
            title="2. Einnahme oder Ausgabe"
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
              <input
                type="hidden"
                autoComplete="off"
                {...register("counterpartyAccount")}
              />

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
                    <Input value={associationName} disabled readOnly />
                  ) : (
                    <AutocompleteInput
                      apiPath={counterpartyApiPath}
                      entityLabelSingular={counterpartyEntityLabel}
                      placeholder="Name eingeben…"
                      showCreateOption
                      value={counterpartyName}
                      onChange={(event) => {
                        setValue("counterpartyName", event.target.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setValue("counterpartyAccount", "", {
                          shouldDirty: true,
                          shouldValidate: true,
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
                      value={counterpartyName}
                      onChange={(event) => {
                        setValue("counterpartyName", event.target.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setValue("counterpartyAccount", "", {
                          shouldDirty: true,
                          shouldValidate: true,
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
                    <Input value={associationName} disabled readOnly />
                  )}
                </FormField>

                <FormField
                  label="Kostenstelle 2"
                  required
                  hint="Werkbereich des Vereins auswählen"
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

              {errors.counterpartyName?.message ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errors.counterpartyName.message}
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
                        !counterpartyName.trim() ||
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
                        !counterpartyName.trim() ||
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

          <FormSection title="3. Notizen und Belegstatus" icon={faCalendarCheck}>
            <div className="space-y-4">
              <FormField label="Notizen">
                <Textarea
                  placeholder="Optionale interne Hinweise"
                  {...register("notes")}
                />
              </FormField>

              <FormField label="Belegstatus">
                <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    autoComplete="off"
                    {...register("alreadyRefunded")}
                  />
                  Betrag wurde bereits vom Verein erstattet
                </label>
              </FormField>
            </div>
          </FormSection>

          <div className="sticky bottom-4 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              {submittedAt ? (
                <p className="text-sm text-emerald-700">
                  Formular gespeichert: {submittedAt}
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
                onClick={() => {
                  reset({
                    issueDate: new Date().toISOString().slice(0, 10),
                    bookingText: "",
                    receiptNumber: "",
                    noEvidence: false,
                    eigenbelegReason: "",
                    bookingType: "ausgabe",
                    amountEuro: "",
                    counterpartyName: "",
                    counterpartyAccount: "",
                    associationArea: costCenters[0]?.value ?? "",
                    associationAccount: "K0104 A",
                    notes: "",
                    alreadyRefunded: false,
                  });
                  setSubmittedAt(null);
                  setStoreResult(null);
                  setShowCreateCreditorPanel(false);
                  setShowCreateDebtorPanel(false);
                  setCreditorError(null);
                  setDebtorError(null);
                }}
              >
                Zurücksetzen
              </Button>
              <Button
                type="submit"
                kind="primary"
                icon={faCalendarCheck}
                disabled={isSubmitting}
                className="ml-auto"
              >
                {isSubmitting ? "Wird gespeichert…" : "In Campai speichern"}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};
