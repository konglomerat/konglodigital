"use client";

import { useEffect, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "../Button";
import { FormField, Input } from "./form";

export type DebtorCreateType = "business" | "person";

export type DebtorCreateDraft = {
  type: DebtorCreateType;
  name: string;
  email: string;
  details: string;
  addressLine: string;
  zip: string;
  city: string;
};

export type DebtorCreateResult = {
  account: number;
  name: string;
  paymentMethodType?: string | null;
};

type DebtorCreatePanelProps = {
  initialName: string;
  initialType?: DebtorCreateType;
  initialDetails?: string;
  initialAddressLine?: string;
  initialZip?: string;
  initialCity?: string;
  email?: string;
  paymentMethodType?: string;
  receiptSendMethod?: "email" | "postal" | "none";
  title?: string;
  className?: string;
  submitLabel?: string;
  onCancel: () => void;
  onCreated: (result: DebtorCreateResult, draft: DebtorCreateDraft) => void;
};

const buildInitialDraft = (
  props: Pick<
    DebtorCreatePanelProps,
    | "initialName"
    | "initialType"
    | "initialDetails"
    | "initialAddressLine"
    | "initialZip"
    | "initialCity"
    | "email"
  >,
): DebtorCreateDraft => ({
  type: props.initialType ?? "person",
  name: props.initialName,
  email: props.email ?? "",
  details: props.initialDetails ?? "",
  addressLine: props.initialAddressLine ?? "",
  zip: props.initialZip ?? "",
  city: props.initialCity ?? "",
});

export default function DebtorCreatePanel(props: DebtorCreatePanelProps) {
  const {
    initialName,
    initialType,
    initialDetails,
    initialAddressLine,
    initialZip,
    initialCity,
    email,
    paymentMethodType,
    receiptSendMethod,
    title,
    className,
    submitLabel = "Debitor anlegen",
    onCancel,
    onCreated,
  } = props;

  const [draft, setDraft] = useState<DebtorCreateDraft>(() =>
    buildInitialDraft({
      initialName,
      initialType,
      initialDetails,
      initialAddressLine,
      initialZip,
      initialCity,
      email,
    }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      buildInitialDraft({
        initialName,
        initialType,
        initialDetails,
        initialAddressLine,
        initialZip,
        initialCity,
        email,
      }),
    );
    setSubmitting(false);
    setError(null);
  }, [
    initialAddressLine,
    initialCity,
    initialDetails,
    initialName,
    initialType,
    initialZip,
    email,
  ]);

  const updateDraft = <K extends keyof DebtorCreateDraft>(
    key: K,
    value: DebtorCreateDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    const trimmedName = draft.name.trim();
    const trimmedEmail = draft.email.trim();
    if (!trimmedName) {
      setError("Name ist erforderlich.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const trimmedDetails = draft.details.trim();
    const trimmedAddressLine = draft.addressLine.trim();
    const trimmedZip = draft.zip.trim();
    const trimmedCity = draft.city.trim();
    const payload: Record<string, unknown> = {
      type: draft.type,
      name: trimmedName,
    };

    if (trimmedEmail) {
      payload.email = trimmedEmail;
    }

    if (paymentMethodType) {
      payload.paymentMethodType = paymentMethodType;
    }

    if (receiptSendMethod) {
      payload.receiptSendMethod = receiptSendMethod;
    }

    if (trimmedDetails || trimmedAddressLine || trimmedZip || trimmedCity) {
      payload.address = {
        country: "DE",
        details1: trimmedDetails || undefined,
        addressLine: trimmedAddressLine || undefined,
        zip: trimmedZip || undefined,
        city: trimmedCity || undefined,
      };
    }

    try {
      const response = await fetch("/api/campai/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        account?: number;
        name?: string;
        paymentMethodType?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Debitor konnte nicht angelegt werden.");
        return;
      }

      if (typeof result.account !== "number" || result.account <= 0) {
        setError(
          "Debitor wurde angelegt, aber die Debitorennummer konnte nicht ermittelt werden.",
        );
        return;
      }

      onCreated(
        {
          account: result.account,
          name: result.name ?? trimmedName,
          paymentMethodType: result.paymentMethodType ?? null,
        },
        {
          type: draft.type,
          name: trimmedName,
          email: trimmedEmail,
          details: trimmedDetails,
          addressLine: trimmedAddressLine,
          zip: trimmedZip,
          city: trimmedCity,
        },
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Debitor konnte nicht angelegt werden.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={[
        "space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-blue-900">
          {title ?? `Neuen Debitor anlegen: "${draft.name || initialName}"`}
        </p>
      </div>

      <div className="space-y-4">
        <FormField label="Typ" required>
          <div className="inline-flex rounded-md border border-border bg-secondary/60 p-0.5">
            <button
              type="button"
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition ${
                draft.type === "person"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
              onClick={() => updateDraft("type", "person")}
              aria-pressed={draft.type === "person"}
            >
              Person
            </button>
            <button
              type="button"
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition ${
                draft.type === "business"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
              onClick={() => updateDraft("type", "business")}
              aria-pressed={draft.type === "business"}
            >
              Firma
            </button>
          </div>
        </FormField>

        <FormField label="Name" required>
          <Input
            placeholder="Max Mustermann oder Muster GmbH"
            value={draft.name}
            onChange={(event) => updateDraft("name", event.target.value)}
          />
        </FormField>

        <FormField label="E-Mail">
          <Input
            type="email"
            placeholder="kontakt@beispiel.de"
            value={draft.email}
            onChange={(event) => updateDraft("email", event.target.value)}
          />
        </FormField>

        <FormField label="Details">
          <Input
            placeholder="z. B. Ansprechpartner oder Zusatz"
            value={draft.details}
            onChange={(event) => updateDraft("details", event.target.value)}
          />
        </FormField>

        <FormField label="Straße / Adresse">
          <Input
            placeholder="Musterstraße 1"
            value={draft.addressLine}
            onChange={(event) => updateDraft("addressLine", event.target.value)}
          />
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="PLZ">
            <Input
              placeholder="01099"
              value={draft.zip}
              onChange={(event) => updateDraft("zip", event.target.value)}
            />
          </FormField>
          <FormField label="Stadt">
            <Input
              placeholder="Dresden"
              value={draft.city}
              onChange={(event) => updateDraft("city", event.target.value)}
            />
          </FormField>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          kind="primary"
          icon={faPlus}
          disabled={submitting || !draft.name.trim()}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Wird angelegt…" : submitLabel}
        </Button>
        <Button type="button" kind="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
