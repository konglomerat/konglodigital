"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCheck,
  faFolderOpen,
  faPlus,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import InternalNoteSection from "../../components/ui/InternalNoteSection";
import ReceiptsPageHeader from "../receiptsPageHeader";
import {
  AutocompleteInput,
  type Suggestion,
} from "../../components/ui/autocomplete-input";
import DebtorCreatePanel from "../../components/ui/debtor-create-panel";
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
  debitorName: string;
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

export default function EinnahmePage() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      beschreibung: "",
      belegdatum: "",
      belegnummer: "",
      betragEuro: "",
      costCenter2: "",
      debitorName: "",
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

  // Debitor state
  const [debitorAccount, setDebitorAccount] = useState<number | null>(null);
  const [debitorName, setDebitorName] = useState("");
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // File state (optional)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDebitorSelect = useCallback((suggestion: Suggestion) => {
    setDebitorAccount(suggestion.account);
    setDebitorName(suggestion.name);
    setShowCreatePanel(false);
  }, []);

  const handleCreateNew = useCallback((name: string) => {
    setDebitorAccount(null);
    setDebitorName(name);
    setShowCreatePanel(true);
  }, []);

  const resetDebitor = useCallback(() => {
    setDebitorAccount(null);
    setDebitorName("");
    setShowCreatePanel(false);
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

  const onSubmit = async (values: FormValues) => {
    if (!debitorAccount) {
      setResult({ error: "Bitte eine zahlende Person oder Firma auswählen." });
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
      const response = await fetch("/api/campai/receipts/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: values.beschreibung,
          transactionDate: values.belegdatum,
          receiptNumber: values.belegnummer || undefined,
          counterpartyAccount: debitorAccount,
          counterpartyName: debitorName,
          income: values.betragEuro,
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
      setDebitorAccount(null);
      setDebitorName("");
      setShowCreatePanel(false);
      setSelectedFile(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BookingPageShell>
        <ReceiptsPageHeader
          title="Einnahme erfassen"
          helperText="Pflichtfelder sind mit * markiert."
          icon={<FontAwesomeIcon icon={faArrowTrendUp} className="h-5 w-5" />}
          iconClassName="border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm"
        />

        {costCentersError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {costCentersError}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {/* Beleg hochladen */}
          <FormSection title="Beleg hochladen" icon={faFolderOpen}>
            <FormField label="Belegdatei" hint="Optional - PDF, JPG oder PNG">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.item(0) ?? null)
                }
              />
              {selectedFile ? (
                <p className="text-xs text-zinc-500">{selectedFile.name}</p>
              ) : null}
            </FormField>
          </FormSection>

          {/* Zahlende Person/Firma */}
          <FormSection title="Zahlende Person/Firma" icon={faUser}>
            <div className="space-y-4">
              <FormField
                label="auswählen oder neu anlegen"
                required
                error={errors.debitorName?.message}
              >
                <AutocompleteInput
                  apiPath="/api/campai/debtors"
                  entityLabelSingular="Person/Firma"
                  placeholder="Name oder Kontonummer eingeben…"
                  showCreateOption
                  onSelect={handleDebitorSelect}
                  onCreateNew={handleCreateNew}
                  {...register("debitorName", {
                    required: "Bitte eine zahlende Person oder Firma auswählen.",
                  })}
                />
              </FormField>

              {debitorAccount ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                  <span>
                    Person/Firma <strong>#{debitorAccount}</strong>
                    {debitorName ? ` (${debitorName})` : ""} ausgewählt
                  </span>
                  <button
                    type="button"
                    className="ml-auto rounded p-1 text-emerald-600 hover:bg-emerald-100"
                    onClick={resetDebitor}
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {showCreatePanel && !debitorAccount ? (
                <DebtorCreatePanel
                  title={`Neue zahlende Person oder Firma anlegen: "${debitorName}"`}
                  submitLabel="Person/Firma anlegen"
                  initialName={debitorName}
                  onCancel={() => setShowCreatePanel(false)}
                  onCreated={(result) => {
                    setDebitorAccount(result.account);
                    setDebitorName(result.name);
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
                label="Beschreibung"
                required
                error={errors.beschreibung?.message}
              >
                <Input
                  placeholder="z. B. Mitgliedsbeitrag April"
                  {...register("beschreibung", {
                    required: "Beschreibung ist erforderlich.",
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
                    placeholder="z. B. EIN-2024-001"
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
              <p className="font-medium">Einnahme gespeichert!</p>
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
              {isSubmitting ? "Wird gespeichert…" : "Einnahme speichern"}
            </Button>
          </div>
        </form>
    </BookingPageShell>
  );
}
