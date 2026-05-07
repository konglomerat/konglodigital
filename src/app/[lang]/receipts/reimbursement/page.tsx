"use client";

import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCartShopping,
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

type PositionValue = {
  betragEuro: string;
  beschreibung: string;
  kostenstelle: string;
};

type CostCenterOption = {
  value: string;
  label: string;
};

type AccountUser = {
  email: string;
  metadata: Record<string, unknown>;
};

type FormValues = {
  betreff: string;
  belegdatum: string;
  rechnungStatus: "offen" | "bezahlt";
  empfaengerName: string;
  empfaengerEmail: string;
  positions: PositionValue[];
  notiz: string;
  belegDatei: FileList;
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

const readMetadataText = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
};

const buildRecipientNameFromUser = (user: AccountUser) => {
  const campaiName = readMetadataText(user.metadata, "campai_name");
  if (campaiName) {
    return campaiName;
  }

  const fullName = readMetadataText(user.metadata, "full_name");
  if (fullName) {
    return fullName;
  }

  const name = readMetadataText(user.metadata, "name");
  if (name) {
    return name;
  }

  const firstName = readMetadataText(user.metadata, "first_name");
  const lastName = readMetadataText(user.metadata, "last_name");
  return [firstName, lastName].filter(Boolean).join(" ");
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
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      betreff: "",
      belegdatum: "",
      rechnungStatus: "offen",
      empfaengerName: "",
      empfaengerEmail: "",
      positions: [emptyPosition()],
      notiz: "",
      belegDatei: undefined,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "positions",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [accountAutofill, setAccountAutofill] = useState<{
    name: string;
    email: string;
  }>({ name: "", email: "" });
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
  const selectedInvoiceStatus = useWatch({
    control,
    name: "rechnungStatus",
  });
  const statusNoteLine = `Status: ${selectedInvoiceStatus === "bezahlt" ? "bezahlt" : "offen"}`;

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

    const loadAccountDefaults = async () => {
      try {
        const response = await fetchJson<{ user: AccountUser }>(
          "/api/account/me",
        );

        if (!active) {
          return;
        }

        const user = response.user;
        const recipientName = buildRecipientNameFromUser(user);
        const recipientEmail = user.email?.trim() ?? "";

        setAccountAutofill({ name: recipientName, email: recipientEmail });

        if (!getValues("empfaengerName") && recipientName) {
          setValue("empfaengerName", recipientName, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
        }

        if (!getValues("empfaengerEmail") && recipientEmail) {
          setValue("empfaengerEmail", recipientEmail, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
        }
      } catch {
        if (active) {
          setAccountAutofill({ name: "", email: "" });
        }
      }
    };

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

        if (items.length > 0) {
          const firstValue = items[0].value;
          const currentPositions = getValues("positions") ?? [];
          currentPositions.forEach((position, index) => {
            if (!position.kostenstelle) {
              setValue(`positions.${index}.kostenstelle`, firstValue, {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
              });
            }
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

    loadAccountDefaults();
    loadCostCenters();

    return () => {
      active = false;
    };
  }, [getValues, setValue]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setResult(null);

    try {
      const datei = values.belegDatei?.item(0) ?? null;
      if (!datei) {
        setResult({ error: "Bitte eine Belegdatei hochladen." });
        return;
      }

      const bytes = new Uint8Array(await datei.arrayBuffer());
      const internalNote = [values.notiz?.trim(), statusNoteLine]
        .filter(Boolean)
        .join("\n");

      const response = await fetch("/api/campai/reimbursement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          betreff: values.betreff,
          belegdatum: values.belegdatum,
          bereitsBeglichen: values.rechnungStatus === "bezahlt",
          empfaengerName: values.empfaengerName,
          empfaengerEmail: values.empfaengerEmail,
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

      reset({
        betreff: "",
        belegdatum: "",
        empfaengerName: accountAutofill.name,
        empfaengerEmail: accountAutofill.email,
        notiz: "",
        belegDatei: undefined,
      });

      setCreditorAccount(null);
      setCreditorName("");
      setShowCreatePanel(false);

      if (costCenters.length > 0) {
        const firstValue = costCenters[0].value;
        setValue("positions.0.kostenstelle", firstValue, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BookingPageShell>
        <ReceiptsPageHeader
          title="Rückerstattungen einreichen"
          description="Nur die wichtigsten Felder ausfüllen. Den Rest setzt das System automatisch."
          helperText="Pflichtfelder sind mit * markiert."
        />

        {costCentersError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {costCentersError}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <FormSection title="Empfänger & Zahlung" icon={faUser}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Empfänger (Kreditor)"
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

                <FormField
                  label="E-Mail-Adresse"
                  error={errors.empfaengerEmail?.message}
                >
                  <Input
                    type="email"
                    placeholder="name@beispiel.de"
                    {...register("empfaengerEmail", {
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Bitte eine gültige E-Mail-Adresse angeben.",
                      },
                    })}
                  />
                </FormField>
              </div>

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

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Nachweis über Vorgang"
                  required
                  hint="Eine Datei (PDF, Dokument, Bild oder Tabelle), max. 10 MB"
                  error={errors.belegDatei?.message as string | undefined}
                >
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.odt,.ods,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    {...register("belegDatei", {
                      validate: {
                        required: (files) =>
                          !!files?.length || "Bitte eine Belegdatei hochladen.",
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
                </FormField>
              </div>
            </div>
          </FormSection>

          <FormSection title="Aufwendung" icon={faCartShopping}>
            <div className="space-y-4">
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
                      error={errors.positions?.[index]?.beschreibung?.message}
                    >
                      <Input
                        placeholder="z. B. Material"
                        {...register(
                          `positions.${index}.beschreibung` as const,
                        )}
                      />
                    </FormField>

                    <FormField
                      label="Kostenstelle"
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
                onClick={() =>
                  append({
                    ...emptyPosition(),
                    kostenstelle: costCenters[0]?.value ?? "",
                  })
                }
              >
                Position hinzufügen
              </Button>
            </div>
          </FormSection>

          <InternalNoteSection
            hint="Wird intern am Beleg in Campai hinterlegt und ist nur für Admins sichtbar. Die Status-Zeile wird automatisch vorangestellt."
            error={errors.notiz?.message}
            textareaProps={register("notiz")}
          >
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <FormField label="Status" required>
                <Select {...register("rechnungStatus", { required: true })}>
                  <option value="offen">offen</option>
                  <option value="bezahlt">bezahlt</option>
                </Select>
              </FormField>
            </div>
          </InternalNoteSection>

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
