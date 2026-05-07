"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendDown,
  faCheck,
  faFileImport,
  faFolderOpen,
  faPlus,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import CreditorCreatePanel from "../../components/ui/creditor-create-panel";
import SelectedCreditorBadge from "../../components/ui/selected-creditor-badge";
import InternalNoteSection from "../../components/ui/InternalNoteSection";
import ReceiptsPageHeader from "../create/header";
import {
  AutocompleteInput,
  type Suggestion,
} from "../../components/ui/autocomplete-input";
import {
  FormField,
  FormSection,
  Input,
  Select,
} from "../../components/ui/form";
import {
  euroAmountPattern,
  euroAmountValidationMessage,
} from "@/lib/euro-input";

type CostCenterOption = { value: string; label: string };

type FormValues = {
  beschreibung: string;
  belegdatum: string;
  belegnummer: string;
  betragEuro: string;
  costCenter2: string;
  kreditorName: string;
  notes: string;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export default function AusgabePage() {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      beschreibung: "",
      belegdatum: "",
      belegnummer: "",
      betragEuro: "",
      costCenter2: "",
      kreditorName: "",
      notes: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id?: string | null;
    uploadWarning?: string;
    error?: string;
  } | null>(null);

  // Creditor state
  const [creditorAccount, setCreditorAccount] = useState<number | null>(null);
  const [creditorName, setCreditorName] = useState("");
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);

  // File state (optional)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleCreditorSelect = useCallback((suggestion: Suggestion) => {
    setCreditorAccount(suggestion.account);
    setCreditorName(suggestion.name);
    setShowCreatePanel(false);
    setShowUpdatePanel(false);
  }, []);

  const handleCreateNew = useCallback((name: string) => {
    setCreditorAccount(null);
    setCreditorName(name);
    setShowCreatePanel(true);
    setShowUpdatePanel(false);
  }, []);

  const resetCreditor = useCallback(() => {
    setCreditorAccount(null);
    setCreditorName("");
    setShowCreatePanel(false);
    setShowUpdatePanel(false);
  }, []);

  useEffect(() => {
    let active = true;
    const loadCostCenters = async () => {
      try {
        const response = await fetch("/api/campai/cost-centers");
        const data = (await response.json()) as {
          costCenters?: CostCenterOption[];
          error?: string;
        };
        if (!active) return;
        if (!response.ok) {
          setCostCentersError(
            data.error ?? "Kostenstellen konnten nicht geladen werden.",
          );
          return;
        }
        setCostCenters(data.costCenters ?? []);
      } catch (error) {
        if (!active) return;
        setCostCentersError(
          error instanceof Error
            ? error.message
            : "Kostenstellen konnten nicht geladen werden.",
        );
      } finally {
        if (active) setCostCentersLoading(false);
      }
    };
    loadCostCenters();
    return () => {
      active = false;
    };
  }, []);

  const handleScanReceipt = useCallback(async () => {
    if (!selectedFile) {
      return;
    }

    setIsScanningReceipt(true);
    setScanFeedback(null);
    setScanError(null);
    setResult(null);

    try {
      const bytes = new Uint8Array(await selectedFile.arrayBuffer());
      const response = await fetch("/api/campai/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "expense",
          refund: false,
          receiptFileBase64: bytesToBase64(bytes),
          receiptFileName: selectedFile.name,
          receiptFileContentType:
            selectedFile.type || "application/octet-stream",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        receiptDate?: string | null;
        receiptNumber?: string | null;
        totalGrossAmount?: number | null;
        error?: string;
      };

      if (!response.ok) {
        setScanError(payload.error ?? "Beleg konnte nicht ausgelesen werden.");
        return;
      }

      setValue("belegdatum", payload.receiptDate ?? "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(
        "betragEuro",
        typeof payload.totalGrossAmount === "number"
          ? `${(payload.totalGrossAmount / 100).toFixed(2)}`.replace(".", ",")
          : "",
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
      setValue("belegnummer", payload.receiptNumber ?? "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue("beschreibung", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setScanFeedback("Belegdaten wurden übernommen.");
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : "Unbekannter Fehler",
      );
    } finally {
      setIsScanningReceipt(false);
    }
  }, [selectedFile, setValue]);

  const onSubmit = async (values: FormValues) => {
    if (!selectedFile) {
      setResult({ error: "Bitte einen Beleg hochladen." });
      return;
    }
    if (!creditorAccount) {
      setResult({ error: "Bitte einen Zahlungsempfänger auswählen." });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      let fileData: {
        receiptFileBase64: string;
        receiptFileName: string;
        receiptFileContentType: string;
      } | null = null;
      if (selectedFile) {
        const bytes = new Uint8Array(await selectedFile.arrayBuffer());
        fileData = {
          receiptFileBase64: bytesToBase64(bytes),
          receiptFileName: selectedFile.name,
          receiptFileContentType:
            selectedFile.type || "application/octet-stream",
        };
      }
      const response = await fetch("/api/campai/receipts/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: values.beschreibung,
          transactionDate: values.belegdatum,
          receiptNumber: values.belegnummer || undefined,
          counterpartyAccount: creditorAccount,
          counterpartyName: creditorName,
          expense: values.betragEuro,
          costCenter2: values.costCenter2,
          internalNote: values.notes || undefined,
          ...fileData,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string | null;
        uploadWarning?: string;
        error?: string;
        hint?: string;
      };
      if (!response.ok) {
        setResult({
          error:
            payload.hint
              ? `${payload.error ?? "Fehler"} — ${payload.hint}`
              : (payload.error ?? "Speichern fehlgeschlagen."),
        });
        return;
      }
      setResult({ id: payload.id ?? null, uploadWarning: payload.uploadWarning });
      reset();
      setCreditorAccount(null);
      setCreditorName("");
      setShowCreatePanel(false);
      setSelectedFile(null);
      setScanFeedback(null);
      setScanError(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BookingPageShell>
        <ReceiptsPageHeader
          title="Ausgabe erfassen"
          description="Einbuchung von Rechnungen und Belegen, die durch Ausgaben des Vereins oder einer seiner Projekte und Werkbereiche entstanden sind."
          helperText="Pflichtfelder sind mit * markiert."
        />

        {costCentersError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {costCentersError}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {/* Beleg hochladen */}
          <FormSection title="Beleg hochladen" icon={faFolderOpen}>
            <FormField label="Belegdatei" required hint="PDF, JPG oder PNG">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.item(0) ?? null);
                  setScanFeedback(null);
                  setScanError(null);
                }}
              />
              {selectedFile ? (
                <p className="text-xs text-zinc-500">{selectedFile.name}</p>
              ) : null}
              <div className="mt-3 space-y-2">
                <Button
                  type="button"
                  kind="secondary"
                  icon={faFileImport}
                  disabled={!selectedFile || isScanningReceipt}
                  onClick={handleScanReceipt}
                >
                  {isScanningReceipt ? "Beleg wird ausgelesen…" : "Beleg auslesen"}
                </Button>
                <p className="text-xs text-zinc-500">
                  Liest Datum, Betrag und Belegnummer automatisch aus dem Beleg
                  und überträgt sie ins Formular.
                </p>
                {scanFeedback ? (
                  <p className="text-sm text-emerald-700">{scanFeedback}</p>
                ) : null}
              </div>
              {scanError ? (
                <p className="mt-2 text-sm text-rose-700">{scanError}</p>
              ) : null}
            </FormField>
          </FormSection>

          {/* Zahlungsempfänger */}
          <FormSection title="Zahlungsempfänger" icon={faUser}>
            <div className="space-y-4">
              <FormField
                label="Empfänger auswählen oder neu anlegen"
                required
                error={errors.kreditorName?.message}
              >
                <AutocompleteInput
                  placeholder="Name oder Kontonummer eingeben…"
                  showCreateOption
                  onSelect={handleCreditorSelect}
                  onCreateNew={handleCreateNew}
                  {...register("kreditorName", {
                    required: "Bitte einen Zahlungsempfänger auswählen.",
                  })}
                />
              </FormField>

              {creditorAccount ? (
                <SelectedCreditorBadge
                  account={creditorAccount}
                  entityLabel="Empfänger"
                  fallbackName={creditorName}
                  tone="emerald"
                  onClear={resetCreditor}
                  onEdit={() => setShowUpdatePanel((current) => !current)}
                />
              ) : null}

              {showUpdatePanel && creditorAccount ? (
                <CreditorCreatePanel
                  creditorAccount={creditorAccount}
                  initialName={creditorName}
                  onCancel={() => setShowUpdatePanel(false)}
                  onCreated={(updated) => {
                    setCreditorName(updated.name);
                    setShowUpdatePanel(false);
                  }}
                />
              ) : null}

              {showCreatePanel && !creditorAccount ? (
                <CreditorCreatePanel
                  initialName={creditorName}
                  title={`Neuen Empfänger anlegen: "${creditorName}"`}
                  submitLabel="Empfänger anlegen"
                  onCancel={() => setShowCreatePanel(false)}
                  onCreated={(created) => {
                    setCreditorAccount(created.account);
                    setCreditorName(created.name);
                    setShowCreatePanel(false);
                  }}
                />
              ) : null}
            </div>
          </FormSection>

          {/* Belegangaben */}
          <FormSection title="Belegangaben" icon={faFolderOpen}>
            <div className="space-y-4">
              <FormField
                label="Buchungstext"
                required
                error={errors.beschreibung?.message}
              >
                <p className="text-xs text-zinc-500">
                  Kurze Beschreibung wofür die Ausgabe getätigt wurde
                </p>
                <Input
                  placeholder="z. B. Materialkosten Werkstatt"
                  {...register("beschreibung", {
                    required: "Buchungstext ist erforderlich.",
                  })}
                />
              </FormField>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Belegdatum"
                  required
                  error={errors.belegdatum?.message}
                >
                  <Input
                    type="date"
                    {...register("belegdatum", {
                      required: "Belegdatum ist erforderlich.",
                    })}
                  />
                </FormField>
                <FormField
                  label="Belegnummer"
                  hint="Optional – wird automatisch vergeben wenn leer."
                  error={errors.belegnummer?.message}
                >
                  <Input
                    placeholder="z. B. RE-2024-001"
                    {...register("belegnummer")}
                  />
                </FormField>
                <FormField
                  label="Betrag (€)"
                  required
                  hint="Format: 12,50"
                  error={errors.betragEuro?.message}
                >
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    {...register("betragEuro", {
                      required: "Betrag ist erforderlich.",
                      pattern: {
                        value: euroAmountPattern,
                        message: euroAmountValidationMessage,
                      },
                    })}
                  />
                </FormField>
                <FormField
                  label="Werkbereich/Projekt"
                  required
                  error={errors.costCenter2?.message}
                >
                  <Select
                    disabled={costCentersLoading}
                    {...register("costCenter2", {
                      required: "Bitte einen Werkbereich/Projekt auswählen.",
                    })}
                  >
                    <option value="">
                      {costCentersLoading ? "Wird geladen…" : "Bitte auswählen…"}
                    </option>
                    {costCenters.map((cc) => (
                      <option key={cc.value} value={cc.value}>
                        {cc.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>
          </FormSection>

          <InternalNoteSection textareaProps={register("notes")} />

          {result?.id ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p className="font-medium">Ausgabe gespeichert!</p>
              <p className="text-emerald-700">Campai Beleg-ID: {result.id}</p>
              {result.uploadWarning ? (
                <p className="mt-1 text-amber-700">{result.uploadWarning}</p>
              ) : null}
            </div>
          ) : null}

          {result?.error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {result.error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              kind="secondary"
              href="/receipts"
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              kind="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Wird gespeichert…" : "Ausgabe speichern"}
            </Button>
          </div>
        </form>
    </BookingPageShell>
  );
}
