"use client";

import { useEffect, useState } from "react";

import Button from "@/components/knglmrt/Button";
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

type SelectedDebtorBadgeProps = {
  account: number;
  entityLabel?: string;
  fallbackName?: string;
  onClear: () => void;
  onEdit?: () => void;
};

export default function SelectedDebtorBadge({
  account,
  entityLabel = "Debitor",
  fallbackName,
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
    <div className="flex flex-col gap-1 knglmrt-border bg-success-soft px-3 py-2 text-foreground">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
        <span>
          {entityLabel} <strong className="knglmrt-num">#{account}</strong>
          {displayName ? ` (${displayName})` : ""} ausgewählt
        </span>
        {onEdit ? (
          <Button
            kind="ghost"
            size="chip"
            icon={faPenToSquare}
            className="ml-auto"
            onClick={onEdit}
          >
            Bearbeiten
          </Button>
        ) : null}
        <Button
          kind="ghost"
          size="chip"
          iconOnly
          icon={faXmark}
          aria-label="Auswahl entfernen"
          className={onEdit ? undefined : "ml-auto"}
          onClick={onClear}
        />
      </div>
      {showSecondary ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-[13px] leading-[18px] text-muted-foreground">
          {info?.email ? <span>{info.email}</span> : null}
          {addressLine ? <span>{addressLine}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
