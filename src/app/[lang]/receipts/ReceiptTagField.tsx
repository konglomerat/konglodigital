"use client";

// Tags für einen Beleg: Vorschläge aus Campai (meistgenutzte zuerst), neue
// lassen sich frei tippen. Dasselbe Feld in allen Buchungsformularen und in
// der Beleg-Sidebar.
import { useEffect, useMemo, useState } from "react";

import MultiSelect from "@/components/knglmrt/MultiSelect";
import type { SelectOption } from "@/components/knglmrt/Select";
import {
  MAX_RECEIPT_TAGS as MAX_TAGS,
  MAX_RECEIPT_TAG_LENGTH as MAX_TAG_LENGTH,
} from "@/lib/campai-receipts/tag-rules";

export type ReceiptTagSuggestion = { tag: string; usage: number };

// Einmal je Seitenaufruf laden; mehrere Felder teilen sich die Antwort.
let suggestionsPromise: Promise<ReceiptTagSuggestion[]> | null = null;

export const loadReceiptTagSuggestions = (): Promise<ReceiptTagSuggestion[]> => {
  if (!suggestionsPromise) {
    suggestionsPromise = fetch("/api/campai/receipts/tags")
      .then(async (response) => {
        if (!response.ok) throw new Error("Tags konnten nicht geladen werden.");
        const data = (await response.json()) as { tags?: ReceiptTagSuggestion[] };
        return Array.isArray(data.tags) ? data.tags : [];
      })
      .catch((error: unknown) => {
        suggestionsPromise = null;
        throw error;
      });
  }
  return suggestionsPromise;
};

/** Nach dem Speichern neuer Tags: beim nächsten Öffnen frisch laden. */
export const invalidateReceiptTagSuggestions = () => {
  suggestionsPromise = null;
};

type ReceiptTagFieldProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  hint?: string;
  /** Tags, die die App beim Anlegen selbst setzt und die mitzählen. */
  reservedCount?: number;
  disabled?: boolean;
  className?: string;
};

export default function ReceiptTagField({
  value,
  onChange,
  label = "Tags",
  hint = "Optional. Vorhandene Tags aus Campai wählen oder neue tippen, Enter übernimmt.",
  reservedCount = 0,
  disabled,
  className,
}: ReceiptTagFieldProps) {
  const [suggestions, setSuggestions] = useState<ReceiptTagSuggestion[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadReceiptTagSuggestions()
      .then((tags) => {
        if (!cancelled) setSuggestions(tags);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<SelectOption[]>(
    () =>
      suggestions.map((entry) => ({
        value: entry.tag,
        label: entry.tag,
        meta: entry.usage > 0 ? String(entry.usage) : undefined,
      })),
    [suggestions],
  );

  const maxSelected = Math.max(0, MAX_TAGS - reservedCount);

  return (
    <MultiSelect
      label={label}
      value={value}
      options={options}
      onChange={(tags) =>
        onChange(
          tags
            .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
            .filter(Boolean),
        )
      }
      creatable
      maxSelected={maxSelected}
      maxLength={MAX_TAG_LENGTH}
      placeholder="Tag wählen oder tippen"
      empty="Noch keine Tags — einfach tippen"
      hint={
        loadError
          ? "Vorschläge aus Campai nicht erreichbar — neue Tags lassen sich trotzdem tippen."
          : value.length >= maxSelected
            ? `Höchstens ${maxSelected} Tags.`
            : hint
      }
      disabled={disabled}
      className={className}
    />
  );
}
