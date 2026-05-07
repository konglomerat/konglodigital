"use client";

import { useEffect, useState } from "react";
import { faPenToSquare, faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "../Button";
import { FormField, Input, Select } from "./form";

export type CreditorCreateType = "business" | "person";
export type CreditorPaymentMethodType = "creditTransfer" | "cash";

export type CreditorCreateDraft = {
  type: CreditorCreateType;
  name: string;
  details: string;
  paymentMethodType: CreditorPaymentMethodType;
  iban: string;
  accountHolderName: string;
};

export type CreditorCreateResult = {
  creditorId?: string | null;
  account: number;
  name: string;
};

type CreditorCreatePanelProps = {
  initialName: string;
  initialType?: CreditorCreateType;
  initialDetails?: string;
  initialPaymentMethodType?: CreditorPaymentMethodType;
  initialIban?: string;
  initialAccountHolderName?: string;
  title?: string;
  className?: string;
  submitLabel?: string;
  /**
   * When set, the panel updates the existing creditor with this account number
   * instead of creating a new one. Existing creditor data is auto-loaded.
   */
  creditorAccount?: number;
  onCancel: () => void;
  onCreated: (result: CreditorCreateResult, draft: CreditorCreateDraft) => void;
};

const buildInitialDraft = (
  props: Pick<
    CreditorCreatePanelProps,
    | "initialName"
    | "initialType"
    | "initialDetails"
    | "initialPaymentMethodType"
    | "initialIban"
    | "initialAccountHolderName"
  >,
): CreditorCreateDraft => ({
  type: props.initialType ?? "business",
  name: props.initialName,
  details: props.initialDetails ?? "",
  paymentMethodType: props.initialPaymentMethodType ?? "creditTransfer",
  iban: props.initialIban ?? "",
  accountHolderName: props.initialAccountHolderName ?? props.initialName,
});

export default function CreditorCreatePanel(props: CreditorCreatePanelProps) {
  const {
    initialName,
    initialType,
    initialDetails,
    initialPaymentMethodType,
    initialIban,
    initialAccountHolderName,
    title,
    className,
    submitLabel,
    creditorAccount,
    onCancel,
    onCreated,
  } = props;

  const isUpdate =
    typeof creditorAccount === "number" && creditorAccount > 0;
  const resolvedSubmitLabel =
    submitLabel ?? (isUpdate ? "Änderungen speichern" : "Kreditor anlegen");

  const [draft, setDraft] = useState<CreditorCreateDraft>(() =>
    buildInitialDraft({
      initialName,
      initialType,
      initialDetails,
      initialPaymentMethodType,
      initialIban,
      initialAccountHolderName,
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
        initialPaymentMethodType,
        initialIban,
        initialAccountHolderName,
      }),
    );
    setSubmitting(false);
    setError(null);
  }, [
    initialAccountHolderName,
    initialDetails,
    initialIban,
    initialName,
    initialPaymentMethodType,
    initialType,
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
          `/api/campai/creditors?account=${encodeURIComponent(String(creditorAccount))}`,
          { cache: "no-store" },
        );
        const result = (await response.json().catch(() => ({}))) as {
          creditor?: {
            name?: string | null;
            type?: "person" | "business" | null;
            details?: string | null;
            paymentMethodType?: string | null;
            creditTransfer?: {
              accountHolderName?: string | null;
              iban?: string | null;
            } | null;
          } | null;
          error?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          setError(
            result.error ?? "Kreditorendaten konnten nicht geladen werden.",
          );
          return;
        }

        const creditor = result.creditor;
        if (!creditor) return;

        const paymentMethodType: CreditorPaymentMethodType =
          creditor.paymentMethodType === "cash" ? "cash" : "creditTransfer";

        setDraft({
          type: creditor.type === "person" ? "person" : "business",
          name: creditor.name ?? "",
          details: creditor.details ?? "",
          paymentMethodType,
          iban: creditor.creditTransfer?.iban ?? "",
          accountHolderName:
            creditor.creditTransfer?.accountHolderName ?? creditor.name ?? "",
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Kreditorendaten konnten nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isUpdate, creditorAccount]);

  const updateDraft = <K extends keyof CreditorCreateDraft>(
    key: K,
    value: CreditorCreateDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleNameChange = (value: string) => {
    setDraft((current) => {
      const shouldSyncAccountHolderName =
        !current.accountHolderName.trim() || current.accountHolderName === current.name;

      return {
        ...current,
        name: value,
        accountHolderName: shouldSyncAccountHolderName
          ? value
          : current.accountHolderName,
      };
    });
  };

  const handleSubmit = async () => {
    const trimmedName = draft.name.trim();
    const trimmedDetails = draft.details.trim();
    const normalizedIban = draft.iban.replace(/\s+/g, "").toUpperCase();
    const trimmedAccountHolderName = draft.accountHolderName.trim() || trimmedName;

    if (!trimmedName) {
      setError("Name ist erforderlich.");
      return;
    }

    if (draft.paymentMethodType === "creditTransfer") {
      if (!normalizedIban) {
        setError("Bitte eine IBAN angeben.");
        return;
      }

      if (!trimmedAccountHolderName) {
        setError("Kontoinhaber ist erforderlich.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = isUpdate
        ? `/api/campai/creditors/${creditorAccount}`
        : "/api/campai/creditors";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          name: trimmedName,
          details: trimmedDetails || undefined,
          paymentMethodType: draft.paymentMethodType,
          ...(draft.paymentMethodType === "creditTransfer"
            ? {
                iban: normalizedIban,
                accountHolderName: trimmedAccountHolderName,
              }
            : {}),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        creditorId?: string | null;
        account?: number;
        name?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(
          result.error ??
            (isUpdate
              ? "Kreditor konnte nicht aktualisiert werden."
              : "Kreditor konnte nicht angelegt werden."),
        );
        return;
      }

      const resolvedAccount =
        typeof result.account === "number" && result.account > 0
          ? result.account
          : isUpdate
            ? creditorAccount
            : null;

      if (typeof resolvedAccount !== "number" || resolvedAccount <= 0) {
        setError(
          "Kreditor wurde angelegt, aber die Kontonummer konnte nicht ermittelt werden.",
        );
        return;
      }

      onCreated(
        {
          creditorId: result.creditorId ?? null,
          account: resolvedAccount,
          name: result.name ?? trimmedName,
        },
        {
          type: draft.type,
          name: trimmedName,
          details: trimmedDetails,
          paymentMethodType: draft.paymentMethodType,
          iban: normalizedIban,
          accountHolderName: trimmedAccountHolderName,
        },
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Kreditor konnte nicht angelegt werden.",
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
              ? `Kreditor bearbeiten: \"${draft.name || initialName}\"`
              : `Neuen Kreditor anlegen: \"${draft.name || initialName}\"`)}
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
            onChange={(event) => handleNameChange(event.target.value)}
          />
        </FormField>

        <FormField label="Details">
          <Input
            placeholder="z. B. Ansprechpartner oder Zusatz"
            value={draft.details}
            onChange={(event) => updateDraft("details", event.target.value)}
          />
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Zahlungsart" required>
            <Select
              value={draft.paymentMethodType}
              onChange={(event) =>
                updateDraft(
                  "paymentMethodType",
                  event.target.value as CreditorPaymentMethodType,
                )
              }
            >
              <option value="creditTransfer">Überweisung</option>
              <option value="cash">Bargeld</option>
            </Select>
          </FormField>

          {draft.paymentMethodType === "creditTransfer" ? (
            <FormField
              label="Abweichender Kontoinhaber"
              hint="Wird standardmäßig mit dem Namen vorbelegt."
            >
              <Input
                placeholder="Nur ausfüllen, wenn das Konto auf einen anderen Namen läuft"
                value={draft.accountHolderName}
                onChange={(event) =>
                  updateDraft("accountHolderName", event.target.value)
                }
              />
            </FormField>
          ) : null}
        </div>

        {draft.paymentMethodType === "creditTransfer" ? (
          <FormField label="IBAN" required>
            <Input
              placeholder="DE…"
              value={draft.iban}
              onChange={(event) => updateDraft("iban", event.target.value)}
            />
          </FormField>
        ) : null}
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