"use client";

// Korrektur eines Antrags vor dem Annehmen. Dieselben Felder und Regeln wie
// /registration, nur ohne Unterschriften und Erklärungen.
import { useState } from "react";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Field from "@/components/knglmrt/Field";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import {
  ACCESS_TARIFFS,
  ANNUAL_FEE_LABELS,
  ANNUAL_FEE_OPTIONS,
  TRIAL_FEE_EURO,
  type AnnualFee,
  type RegistrationErrors,
} from "@/lib/campai-registration";
import { formatEuro, type ApplicationData } from "@/lib/membership-applications/types";

type Props = {
  initial: ApplicationData;
  saving: boolean;
  fieldErrors: RegistrationErrors;
  onSave: (data: ApplicationData) => void;
  onCancel: () => void;
};

export default function ApplicationEditForm({
  initial,
  saving,
  fieldErrors,
  onSave,
  onCancel,
}: Props) {
  const [data, setData] = useState<ApplicationData>(initial);
  const update = <K extends keyof ApplicationData>(key: K, value: ApplicationData[K]) =>
    setData((current) => ({ ...current, [key]: value }));

  const text = (key: "firstName" | "lastName" | "email" | "phone" | "mobilePhone" | "street" | "zip" | "city", label: string) => (
    <Field
      label={label}
      value={data[key]}
      error={fieldErrors[key]}
      onChange={(event) => update(key, event.target.value)}
    />
  );

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(data);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {text("firstName", "Vorname")}
        {text("lastName", "Nachname")}
      </div>
      {text("email", "E-Mail")}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("phone", "Telefon")}
        {text("mobilePhone", "Mobil")}
      </div>
      {text("street", "Straße und Hausnummer")}
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        {text("zip", "PLZ")}
        {text("city", "Ort")}
      </div>

      <Field
        type="date"
        label="Eintritt"
        value={data.entryAt}
        error={fieldErrors.entryAt}
        onChange={(event) => update("entryAt", event.target.value)}
      />
      <NativeSelect
        label="Jahresbeitrag"
        value={data.annualFee ?? ""}
        error={fieldErrors.annualFee}
        onChange={(event) =>
          update("annualFee", event.target.value ? (Number(event.target.value) as AnnualFee) : null)
        }
      >
        <option value="">Bitte wählen</option>
        {ANNUAL_FEE_OPTIONS.map((fee) => (
          <option key={fee} value={fee}>
            {ANNUAL_FEE_LABELS[fee]} · {formatEuro(fee)}
          </option>
        ))}
      </NativeSelect>
      <Choice
        label={`Schnuppertarif im ersten Jahr (${formatEuro(TRIAL_FEE_EURO)})`}
        checked={data.trialRate}
        onChange={(event) => update("trialRate", event.target.checked)}
      />
      <NativeSelect
        label="Zugangskarte"
        value={data.accessTariff}
        error={fieldErrors.accessTariff}
        onChange={(event) => update("accessTariff", event.target.value as ApplicationData["accessTariff"])}
      >
        <option value="">Bitte wählen</option>
        {ACCESS_TARIFFS.map((tariff) => (
          <option key={tariff.id} value={tariff.id}>
            {tariff.name}
          </option>
        ))}
      </NativeSelect>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" kind="primary" size="small" loading={saving}>
          Speichern
        </Button>
        <Button type="button" kind="secondary" size="small" disabled={saving} onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
