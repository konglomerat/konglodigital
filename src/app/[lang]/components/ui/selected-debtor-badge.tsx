"use client";

import { useEffect, useState } from "react";
import {
  faCheck,
  faPenToSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type DebtorInfo = {
  name: string;
  email: string;
  address: {
    addressLine: string;
    zip: string;
    city: string;
    details1: string;
  } | null;
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

type SelectedDebtorBadgeProps = {
  account: number;
  entityLabel?: string;
  fallbackName?: string;
  tone?: Tone;
  onClear: () => void;
  onEdit?: () => void;
};

export default function SelectedDebtorBadge({
  account,
  entityLabel = "Debitor",
  fallbackName,
  tone = "emerald",
  onClear,
  onEdit,
}: SelectedDebtorBadgeProps) {
  const [info, setInfo] = useState<DebtorInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/campai/debtors?account=${encodeURIComponent(String(account))}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          debtor?: {
            name?: string | null;
            email?: string | null;
            address?: {
              addressLine?: string | null;
              zip?: string | null;
              city?: string | null;
              details1?: string | null;
            } | null;
          } | null;
        };

        if (cancelled || !data.debtor) return;

        setInfo({
          name: data.debtor.name ?? "",
          email: data.debtor.email ?? "",
          address: data.debtor.address
            ? {
                addressLine: data.debtor.address.addressLine ?? "",
                zip: data.debtor.address.zip ?? "",
                city: data.debtor.address.city ?? "",
                details1: data.debtor.address.details1 ?? "",
              }
            : null,
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

  const addressLine = info?.address
    ? [
        info.address.details1,
        info.address.addressLine,
        [info.address.zip, info.address.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const showSecondary = Boolean(info?.email || addressLine);

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
      {showSecondary ? (
        <div
          className={`flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-xs ${styles.secondary}`}
        >
          {info?.email ? <span>{info.email}</span> : null}
          {addressLine ? <span>{addressLine}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
