"use client";

import { useEffect, useState } from "react";
import {
  faCheck,
  faPenToSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type CreditorInfo = {
  name: string;
  paymentMethodType: "creditTransfer" | "cash" | null;
  iban: string;
  accountHolderName: string;
};

type Tone = "emerald" | "success";

const toneClasses: Record<
  Tone,
  {
    container: string;
    secondary: string;
    edit: string;
    clear: string;
  }
> = {
  emerald: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-800",
    secondary: "text-emerald-700/80",
    edit: "text-emerald-700 hover:bg-emerald-100",
    clear: "text-emerald-600 hover:bg-emerald-100",
  },
  success: {
    container: "border-success-border bg-success-soft text-success",
    secondary: "text-success/80",
    edit: "text-success hover:bg-success-soft",
    clear: "text-success hover:bg-success-soft",
  },
};

const formatIban = (iban: string) =>
  iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

const paymentMethodLabel = (
  type: CreditorInfo["paymentMethodType"],
): string => {
  if (type === "creditTransfer") return "Überweisung";
  if (type === "cash") return "Bargeld";
  return "Keine Zahlungsart";
};

type SelectedCreditorBadgeProps = {
  account: number;
  entityLabel?: string;
  fallbackName?: string;
  tone?: Tone;
  onClear: () => void;
  onEdit?: () => void;
};

export default function SelectedCreditorBadge({
  account,
  entityLabel = "Kreditor",
  fallbackName,
  tone = "emerald",
  onClear,
  onEdit,
}: SelectedCreditorBadgeProps) {
  const [info, setInfo] = useState<CreditorInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/campai/creditors?account=${encodeURIComponent(String(account))}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          creditor?: {
            name?: string | null;
            paymentMethodType?: string | null;
            creditTransfer?: {
              accountHolderName?: string | null;
              iban?: string | null;
            } | null;
          } | null;
        };

        if (cancelled || !data.creditor) return;

        const paymentMethodType =
          data.creditor.paymentMethodType === "creditTransfer"
            ? "creditTransfer"
            : data.creditor.paymentMethodType === "cash"
              ? "cash"
              : null;

        setInfo({
          name: data.creditor.name ?? "",
          paymentMethodType,
          iban: data.creditor.creditTransfer?.iban ?? "",
          accountHolderName:
            data.creditor.creditTransfer?.accountHolderName ?? "",
        });
      } catch {
        // Silent — header still renders with fallback name.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account]);

  const styles = toneClasses[tone];
  const displayName = info?.name || fallbackName || "";
  const showSecondary = Boolean(
    info && (info.paymentMethodType || info.iban),
  );
  const ibanDisplay = info?.iban ? formatIban(info.iban) : "";

  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${styles.container}`}
    >
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
        <span>
          {entityLabel} <strong>#{account}</strong>
          {displayName ? ` (${displayName})` : ""} ausgewählt
        </span>
        {onEdit ? (
          <button
            type="button"
            className={`ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${styles.edit}`}
            onClick={onEdit}
          >
            <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3" />
            Bearbeiten
          </button>
        ) : null}
        <button
          type="button"
          className={`${onEdit ? "" : "ml-auto"} rounded p-1 ${styles.clear}`}
          onClick={onClear}
        >
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
        </button>
      </div>
      {showSecondary && info ? (
        <div
          className={`flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-xs ${styles.secondary}`}
        >
          <span>{paymentMethodLabel(info.paymentMethodType)}</span>
          {ibanDisplay ? <span>IBAN: {ibanDisplay}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
