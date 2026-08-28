"use client";

import { useEffect, useState } from "react";
import {
  faCheck,
  faPenToSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "@/components/knglmrt/Button";

type CreditorInfo = {
  name: string;
  paymentMethodType: "creditTransfer" | "cash" | null;
  iban: string;
  accountHolderName: string;
};

const formatIban = (iban: string) =>
  iban
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();

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
  onClear: () => void;
  onEdit?: () => void;
};

export default function SelectedCreditorBadge({
  account,
  entityLabel = "Kreditor",
  fallbackName,
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

  const displayName = info?.name || fallbackName || "";
  const showSecondary = Boolean(info && (info.paymentMethodType || info.iban));
  const ibanDisplay = info?.iban ? formatIban(info.iban) : "";

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
      {showSecondary && info ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-[13px] leading-[18px] text-muted-foreground">
          <span>{paymentMethodLabel(info.paymentMethodType)}</span>
          {ibanDisplay ? (
            <span>
              IBAN: <span className="knglmrt-num">{ibanDisplay}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
