"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCheck,
  faFolderOpen,
  faList,
  faPlus,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import InternalNoteSection from "../../components/ui/InternalNoteSection";
import BookingPageHeader from "../bookingPageHeader";
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

const euroAmountPattern = /^\d+(,\d{1,2})?$/;

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
  const [addressLine, setAddressLine] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [debitorEmail, setDebitorEmail] = useState("");
  const [isCreatingDebitor, setIsCreatingDebitor] = useState(false);
  const [debitorError, setDebitorError] = useState<string | null>(null);

  // File state (optional)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDebitorSelect = useCallback((suggestion: Suggestion) => {
    setDebitorAccount(suggestion.account);
    setDebitorName(suggestion.name);
    setShowCreatePanel(false);
    setDebitorError(null);
  }, []);

  const handleCreateNew = useCallback((name: string) => {
    setDebitorAccount(null);
    setDebitorName(name);
    setShowCreatePanel(true);
    setDebitorError(null);
  }, []);

  const resetDebitor = useCallback(() => {
    setDebitorAccount(null);
    setDebitorName("");
    setShowCreatePanel(false);
    setAddressLine("");
    setZip("");
    setCity("");
    setDebitorEmail("");
    setDebitorError(null);
  }, []);

  const createDebitor = useCallback(async () => {
    setIsCreatingDebitor(true);
    setDebitorError(null);
    try {
      const response = await fetch("/api/campai/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: debitorName,
          type: "business",
          email: debitorEmail.trim() || undefined,
          address: {
            country: "DE",
            zip: zip.trim(),
            city: city.trim(),
            addressLine: addressLine.trim(),
          },
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setDebitorError(
          payload.error ?? "Person oder Firma konnte nicht angelegt werden.",
        );
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        account?: number;
        name?: string;
      };
      if (typeof payload.account === "number" && payload.account > 0) {
        setDebitorAccount(payload.account);
        setDebitorName(payload.name ?? debitorName);
        setShowCreatePanel(false);
      } else {
        setDebitorError(
          "Person oder Firma wurde angelegt, aber die Kontonummer konnte nicht ermittelt werden.",
        );
      }
    } catch (error) {
      setDebitorError(
        error instanceof Error ? error.message : "Unbekannter Fehler",
      );
    } finally {
      setIsCreatingDebitor(false);
    }
  }, [debitorName, debitorEmail, addressLine, zip, city]);

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
          notes: values.notes,
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
      setAddressLine("");
      setZip("");
      setCity("");
      setDebitorEmail("");
      setDebitorError(null);
      setSelectedFile(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BookingPageShell>
        <BookingPageHeader
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
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Neue zahlende Person oder Firma anlegen: &ldquo;{debitorName}&rdquo;
                  </p>
                  <div className="space-y-4">
                    <FormField label="Straße / Adresse" required>
                      <Input
                        placeholder="Musterstraße 1"
                        value={addressLine}
                        onChange={(event) => setAddressLine(event.target.value)}
                      />
                    </FormField>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="PLZ" required>
                        <Input
                          placeholder="12345"
                          value={zip}
                          onChange={(event) => setZip(event.target.value)}
                        />
                      </FormField>
                      <FormField label="Stadt" required>
                        <Input
                          placeholder="Berlin"
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                        />
                      </FormField>
                    </div>
                    <FormField label="E-Mail" hint="Optional">
                      <Input
                        type="email"
                        placeholder="kontakt@beispiel.de"
                        value={debitorEmail}
                        onChange={(event) =>
                          setDebitorEmail(event.target.value)
                        }
                      />
                    </FormField>
                  </div>
                  {debitorError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {debitorError}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      kind="primary"
                      icon={faPlus}
                      disabled={
                        isCreatingDebitor ||
                        !addressLine.trim() ||
                        !zip.trim() ||
                        !city.trim()
                      }
                      onClick={createDebitor}
                    >
                      {isCreatingDebitor ? "Wird angelegt…" : "Person/Firma anlegen"}
                    </Button>
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() => setShowCreatePanel(false)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
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
              </div>
            </div>
          </FormSection>

          {/* Position */}
          <FormSection title="Position" icon={faList}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Betrag (€)"
                required
                hint="Format: 12,50"
                error={errors.betragEuro?.message}
              >
                <Input
                  placeholder="0,00"
                  {...register("betragEuro", {
                    required: "Betrag ist erforderlich.",
                    pattern: {
                      value: euroAmountPattern,
                      message: "Format: 12,50",
                    },
                  })}
                />
              </FormField>
              <FormField label="Werkbereich/Projekt" required error={errors.costCenter2?.message}>
                <Select
                  disabled={costCentersLoading}
                  {...register("costCenter2", { required: "Bitte einen Werkbereich/Projekt auswählen." })}
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

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              kind="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Wird gespeichert…" : "Einnahme speichern"}
            </Button>
            <Button
              type="button"
              kind="secondary"
              href="/meine-buchungen"
            >
              Abbrechen
            </Button>
          </div>
        </form>
    </BookingPageShell>
  );
}
