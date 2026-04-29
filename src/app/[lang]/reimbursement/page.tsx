"use client";

import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCartShopping,
  faCheck,
  faFolderOpen,
  faPlus,
  faRotate,
  faTrash,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import BookingPageShell from "../components/ui/BookingPageShell";
import InternalNoteSection from "../components/ui/InternalNoteSection";
import BookingPageHeader from "../meine-buchungen/bookingPageHeader";
import {
  AutocompleteInput,
  type Suggestion,
} from "../components/ui/autocomplete-input";
import {
  FormField,
  FormSection,
  Input,
  Select,
} from "../components/ui/form";
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
  const [paymentMethodType, setPaymentMethodType] = useState<
    "creditTransfer" | "cash"
  >("creditTransfer");
  const [creditorIban, setCreditorIban] = useState("");
  const [creditorKontoinhaber, setCreditorKontoinhaber] = useState("");
  const [isCreatingCreditor, setIsCreatingCreditor] = useState(false);
  const [creditorError, setCreditorError] = useState<string | null>(null);
  const selectedInvoiceStatus = useWatch({
    control,
    name: "rechnungStatus",
  });
  const statusNoteLine = `Status: ${selectedInvoiceStatus === "bezahlt" ? "bezahlt" : "offen"}`;

  const handleCreditorSelect = useCallback((suggestion: Suggestion) => {
    setCreditorAccount(suggestion.account);
    setCreditorName(suggestion.name);
    setShowCreatePanel(false);
    setCreditorError(null);
  }, []);

  const handleCreateNew = useCallback((name: string) => {
    setCreditorAccount(null);
    setCreditorName(name);
    setCreditorKontoinhaber(name);
    setShowCreatePanel(true);
    setCreditorError(null);
  }, []);

  const resetCreditor = useCallback(() => {
    setCreditorAccount(null);
    setCreditorName("");
    setShowCreatePanel(false);
    setCreditorIban("");
    setCreditorKontoinhaber("");
    setCreditorError(null);
    setValue("empfaengerName", "", { shouldDirty: true });
  }, [setValue]);

  const createCreditor = useCallback(async () => {
    setIsCreatingCreditor(true);
    setCreditorError(null);

    try {
      const response = await fetch("/api/campai/creditors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: creditorName,
          type: "business",
          paymentMethodType,
          ...(paymentMethodType === "creditTransfer"
            ? {
                iban: creditorIban.replace(/\s+/g, "").toUpperCase(),
                kontoinhaber: creditorKontoinhaber || creditorName,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setCreditorError(
          payload.error ?? "Kreditor konnte nicht erstellt werden.",
        );
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        creditorId?: string;
        account?: number;
        name?: string;
      };

      if (typeof payload.account === "number" && payload.account > 0) {
        setCreditorAccount(payload.account);
        setCreditorName(payload.name ?? creditorName);
        setShowCreatePanel(false);
      } else {
        setCreditorError(
          "Kreditor wurde erstellt, aber die Kontonummer konnte nicht ermittelt werden.",
        );
      }
    } catch (error) {
      setCreditorError(
        error instanceof Error ? error.message : "Unbekannter Fehler",
      );
    } finally {
      setIsCreatingCreditor(false);
    }
  }, [creditorName, paymentMethodType, creditorIban, creditorKontoinhaber]);

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
      setCreditorIban("");
      setCreditorKontoinhaber("");
      setCreditorError(null);

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
        <BookingPageHeader
          title="Rückerstattungen einreichen"
          description="Nur die wichtigsten Felder ausfüllen. Den Rest setzt das System automatisch."
          helperText="Pflichtfelder sind mit * markiert."
          icon={<FontAwesomeIcon icon={faRotate} className="h-5 w-5" />}
          iconClassName="border-blue-200 bg-blue-50 text-blue-600 shadow-sm"
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
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                  <span>
                    Kreditor <strong>#{creditorAccount}</strong>{" "}
                    {creditorName ? `(${creditorName})` : ""} ausgewählt
                  </span>
                  <button
                    type="button"
                    className="ml-auto rounded p-1 text-emerald-600 hover:bg-emerald-100"
                    onClick={resetCreditor}
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {/* Create creditor panel */}
              {showCreatePanel && !creditorAccount ? (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Neuen Kreditor anlegen: &ldquo;{creditorName}&rdquo;
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Zahlungsart" required>
                      <Select
                        value={paymentMethodType}
                        onChange={(event) =>
                          setPaymentMethodType(
                            event.target.value as "creditTransfer" | "cash",
                          )
                        }
                      >
                        <option value="creditTransfer">Überweisung</option>
                        <option value="cash">Bargeld</option>
                      </Select>
                    </FormField>

                    {paymentMethodType === "creditTransfer" ? (
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

                  {paymentMethodType === "creditTransfer" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="IBAN" required>
                        <Input
                          placeholder="DE…"
                          value={creditorIban}
                          onChange={(event) =>
                            setCreditorIban(event.target.value)
                          }
                        />
                      </FormField>
                    </div>
                  ) : null}

                  {creditorError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {creditorError}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      kind="primary"
                      icon={faPlus}
                      disabled={
                        isCreatingCreditor ||
                        (paymentMethodType === "creditTransfer" &&
                          (!creditorIban.trim() ||
                            !creditorKontoinhaber.trim()))
                      }
                      onClick={createCreditor}
                    >
                      {isCreatingCreditor
                        ? "Wird angelegt…"
                        : "Kreditor anlegen"}
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
                  className="space-y-3 rounded-xl border border-zinc-200 p-3"
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
              <Button type="button" kind="secondary" href="/meine-buchungen">
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
