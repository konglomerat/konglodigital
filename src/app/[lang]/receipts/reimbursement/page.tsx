"use client";

import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  faFolderOpen,
  faPlus,
  faTrash,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import CreditorCreatePanel from "../../components/ui/creditor-create-panel";
import SelectedCreditorBadge from "../../components/ui/selected-creditor-badge";
import InternalNoteSection from "../../components/ui/InternalNoteSection";
import ReceiptUploadSection from "../../components/ui/ReceiptUploadSection";
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
import { buildReceiptFile } from "@/lib/merge-receipt-files";

type PositionValue = {
  betragEuro: string;
  beschreibung: string;
  kostenstelle: string;
};

type CostCenterOption = {
  value: string;
  label: string;
};

type FormValues = {
  betreff: string;
  belegdatum: string;
  empfaengerName: string;
  positions: PositionValue[];
  notiz: string;
};

const emptyPosition = (): PositionValue => ({
  betragEuro: "",
  beschreibung: "",
  kostenstelle: "",
});

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

export default function ReimbursementPage() {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      betreff: "",
      belegdatum: "",
      empfaengerName: "",
      positions: [emptyPosition()],
      notiz: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "positions",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  // File state — multiple files get bundled into a single PDF
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id?: string | null;
    uploadWarning?: string;
    error?: string;
  } | null>(null);

  // ── Creditor state ─────────────────────────────────────────────────────
  const [creditorAccount, setCreditorAccount] = useState<number | null>(null);
  const [creditorName, setCreditorName] = useState("");
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);

  const handleCreditorSelect = useCallback((suggestion: Suggestion) => {
    setCreditorAccount(suggestion.account);
    setCreditorName(suggestion.name);
    setShowCreatePanel(false);
  }, []);

  const handleCreateNew = useCallback((name: string) => {
    setCreditorAccount(null);
    setCreditorName(name);
    setShowCreatePanel(true);
  }, []);

  const resetCreditor = useCallback(() => {
    setCreditorAccount(null);
    setCreditorName("");
    setShowCreatePanel(false);
    setValue("empfaengerName", "", { shouldDirty: true });
  }, [setValue]);

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

    loadCostCenters();

    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setResult(null);

    try {
      const datei = await buildReceiptFile(selectedFiles);
      if (!datei) {
        setResult({ error: "Bitte eine Belegdatei hochladen." });
        return;
      }

      const bytes = new Uint8Array(await datei.arrayBuffer());
      const internalNote = values.notiz?.trim() ?? "";

      const response = await fetch("/api/campai/reimbursement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          betreff: values.betreff,
          belegdatum: values.belegdatum,
          empfaengerName: values.empfaengerName,
          creditorAccount: creditorAccount ?? undefined,
          positions: values.positions,
          internalNote,
          receiptFileBase64: bytesToBase64(bytes),
          receiptFileName: datei.name,
          receiptFileContentType: datei.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setResult({ error: payload.error ?? "Speichern fehlgeschlagen." });
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string | null;
        uploadWarning?: string;
      };

      setResult({
        id: payload.id ?? null,
        uploadWarning: payload.uploadWarning,
      });

      // Alle Felder auf den leeren Ausgangszustand zurücksetzen.
      reset({
        betreff: "",
        belegdatum: "",
        empfaengerName: "",
        positions: [emptyPosition()],
        notiz: "",
      });

      setSelectedFiles([]);
      setCreditorAccount(null);
      setCreditorName("");
      setShowCreatePanel(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BookingPageShell>
        <ReceiptsPageHeader
          title="Rückerstattungen einreichen"
          description="Wenn du etwas für den Verein bezahlt oder gekauft hast und nun die Kohle wieder haben willst kannst du das hier einreichen. Die Ausgabe wird dann bei nächster Gelegenheit via Überweisung an das angegebene Konto rückerstattet. Falls es dringend ist bitte via Mail Bescheid geben unter vorstand@konglomerat.org"
          helperText="Pflichtfelder sind mit * markiert."
        />

        {costCentersError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {costCentersError}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {/* 1. Beleg hochladen */}
          <ReceiptUploadSection
            files={selectedFiles}
            onFilesChange={setSelectedFiles}
            required
          />

          {/* 2. Wer erhält die Rückerstattung? */}
          <FormSection title="Wer erhält die Rückerstattung?" icon={faUser}>
            <div className="space-y-4">
              <FormField
                label="Empfänger auswählen oder neu anlegen"
                required
                error={errors.empfaengerName?.message}
              >
                <AutocompleteInput
                  placeholder="Name eingeben…"
                  showCreateOption
                  onSelect={handleCreditorSelect}
                  onCreateNew={handleCreateNew}
                  {...register("empfaengerName", {
                    required: "Empfängername ist erforderlich.",
                  })}
                />
              </FormField>

              {/* Creditor selected badge */}
              {creditorAccount ? (
                <SelectedCreditorBadge
                  account={creditorAccount}
                  fallbackName={creditorName}
                  onClear={resetCreditor}
                />
              ) : null}

              {/* Create creditor panel */}
              {showCreatePanel && !creditorAccount ? (
                <CreditorCreatePanel
                  initialName={creditorName}
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

          {/* 3. Belegangaben */}
          <FormSection title="Belegangaben" icon={faFolderOpen}>
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Anlass"
                  required
                  hint="Wofür war die Ausgabe?"
                  error={errors.betreff?.message}
                >
                  <Input
                    placeholder="z. B. Material für Werkstatt"
                    {...register("betreff", {
                      required: "Anlass ist erforderlich.",
                    })}
                  />
                </FormField>

                <FormField
                  label="Datum der Transaktion"
                  required
                  hint="Wann fand die Transaktion statt?"
                  error={errors.belegdatum?.message}
                >
                  <Input
                    type="date"
                    {...register("belegdatum", {
                      required: "Das Transaktionsdatum ist erforderlich.",
                    })}
                  />
                </FormField>
              </div>

              {/* Einzelne Positionen */}
              <div className="space-y-4 border-t border-zinc-200 pt-5">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Einzelne Positionen
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Hier bitte auflisten was alles bezahlt wurde.
                  </p>
                </div>
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-3 rounded-xl border border-zinc-200 p-2 sm:p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <FormField
                        label="Betrag in Euro"
                        required
                        error={errors.positions?.[index]?.betragEuro?.message}
                      >
                        <Input
                          inputMode="decimal"
                          placeholder="z. B. 12,90"
                          {...register(`positions.${index}.betragEuro` as const, {
                            required: "Betrag ist erforderlich.",
                            pattern: {
                              value: euroAmountPattern,
                              message: euroAmountValidationMessage,
                            },
                          })}
                        />
                      </FormField>

                      <FormField
                        label="Beschreibung"
                        required
                        error={errors.positions?.[index]?.beschreibung?.message}
                      >
                        <Input
                          placeholder="z. B. Material"
                          {...register(
                            `positions.${index}.beschreibung` as const,
                            {
                              required: "Beschreibung ist erforderlich.",
                            },
                          )}
                        />
                      </FormField>

                      <FormField
                        label="Kostenstelle"
                        required
                        error={errors.positions?.[index]?.kostenstelle?.message}
                      >
                        <Select
                          disabled={
                            costCentersLoading || costCenters.length === 0
                          }
                          {...register(
                            `positions.${index}.kostenstelle` as const,
                            {
                              required: "Bitte eine Kostenstelle auswählen.",
                            },
                          )}
                        >
                          <option value="">
                            {costCentersLoading
                              ? "Kostenstellen werden geladen..."
                              : "Kostenstelle auswählen"}
                          </option>
                          {costCenters.map((costCenter) => (
                            <option
                              key={costCenter.value}
                              value={costCenter.value}
                            >
                              {costCenter.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>

                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        kind="danger-secondary"
                        icon={faTrash}
                        onClick={() => remove(index)}
                      >
                        Position entfernen
                      </Button>
                    ) : null}
                  </div>
                ))}

                <Button
                  type="button"
                  icon={faPlus}
                  onClick={() => append(emptyPosition())}
                >
                  Position hinzufügen
                </Button>
              </div>
            </div>
          </FormSection>

          {/* 4. Interne Notiz */}
          <InternalNoteSection
            hint="Wird in der Buchhaltung (Campai) als Kommentar hinterlegt und ist auch nur dort sichtbar"
            error={errors.notiz?.message}
            textareaProps={register("notiz")}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto flex flex-wrap items-center gap-3">
              {result?.id ? (
                <p className="text-sm text-emerald-700">
                  In Campai gespeichert: {result.id}
                </p>
              ) : null}

              {result?.uploadWarning ? (
                <p className="text-sm text-amber-700">{result.uploadWarning}</p>
              ) : null}

              {result?.error ? (
                <p className="text-sm text-rose-700">{result.error}</p>
              ) : null}
            </div>

            <div className="ml-auto flex items-center justify-end gap-3">
              <Button type="button" kind="secondary" href="/receipts">
                Abbrechen
              </Button>
              <Button
                type="submit"
                kind="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Wird gesendet…" : "Rückerstattung absenden"}
              </Button>
            </div>
          </div>
        </form>
    </BookingPageShell>
  );
}
