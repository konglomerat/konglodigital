"use client";

import { useEffect, useState } from "react";
import { faPenToSquare, faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "../Button";
import { FormField, Input } from "./form";
import { SegmentedControl } from "./segmented-control";

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
  addressRequirementHint?: string;
  paymentMethodType?: string;
  receiptSendMethod?: "email" | "postal" | "none";
  title?: string;
  className?: string;
  submitLabel?: string;
  /**
   * When set, the panel updates the existing debtor with this account number
   * instead of creating a new one. The submit button label and default title
   * adapt accordingly.
   */
  debtorAccount?: number;
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
    addressRequirementHint,
    paymentMethodType,
    receiptSendMethod,
    title,
    className,
    submitLabel,
    debtorAccount,
    onCancel,
    onCreated,
  } = props;

  const isUpdate = typeof debtorAccount === "number" && debtorAccount > 0;
  const resolvedSubmitLabel =
    submitLabel ?? (isUpdate ? "Änderungen speichern" : "Kunde anlegen");

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
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!isUpdate) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/campai/debtors?account=${encodeURIComponent(String(debtorAccount))}`,
          { cache: "no-store" },
        );
        const result = (await response.json().catch(() => ({}))) as {
          debtor?: {
            name?: string | null;
            email?: string | null;
            type?: "person" | "business" | null;
            address?: {
              addressLine?: string | null;
              zip?: string | null;
              city?: string | null;
              details1?: string | null;
            } | null;
          } | null;
          error?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          setError(
            result.error ?? "Debitorendaten konnten nicht geladen werden.",
          );
          return;
        }

        const debtor = result.debtor;
        if (!debtor) return;

        setDraft({
          type: debtor.type === "business" ? "business" : "person",
          name: debtor.name ?? "",
          email: debtor.email ?? "",
          details: debtor.address?.details1 ?? "",
          addressLine: debtor.address?.addressLine ?? "",
          zip: debtor.address?.zip ?? "",
          city: debtor.address?.city ?? "",
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Debitorendaten konnten nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isUpdate, debtorAccount]);

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
      const url = isUpdate
        ? `/api/campai/debtors/${debtorAccount}`
        : "/api/campai/debtors";
      const response = await fetch(url, {
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
        setError(
          result.error ??
            (isUpdate
              ? "Debitor konnte nicht aktualisiert werden."
              : "Debitor konnte nicht angelegt werden."),
        );
        return;
      }

      const resolvedAccount =
        typeof result.account === "number" && result.account > 0
          ? result.account
          : isUpdate
            ? debtorAccount
            : null;

      if (typeof resolvedAccount !== "number" || resolvedAccount <= 0) {
        setError(
          "Debitor wurde angelegt, aber die Debitorennummer konnte nicht ermittelt werden.",
        );
        return;
      }

      onCreated(
        {
          account: resolvedAccount,
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
          {title ??
            (isUpdate
              ? `Kunde (Debitor) bearbeiten: "${draft.name || initialName}"`
              : `Neuen Kunde (Debitor) anlegen: "${draft.name || initialName}"`)}
        </p>
        {addressRequirementHint ? (
          <p className="text-xs text-blue-800">{addressRequirementHint}</p>
        ) : null}
      </div>

      <div className="space-y-4">
        <FormField label="Typ" required>
          <SegmentedControl
            value={draft.type}
            options={[
              { value: "person", label: "Person" },
              { value: "business", label: "Firma" },
            ]}
            onChange={(next) => updateDraft("type", next)}
          />
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
          icon={isUpdate ? faPenToSquare : faPlus}
          disabled={submitting || loading || !draft.name.trim()}
          onClick={() => void handleSubmit()}
        >
          {loading
            ? "Wird geladen…"
            : submitting
              ? isUpdate
                ? "Wird gespeichert…"
                : "Wird angelegt…"
              : resolvedSubmitLabel}
        </Button>
        <Button type="button" kind="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
