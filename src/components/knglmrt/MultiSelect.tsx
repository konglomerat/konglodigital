"use client";

// Mehrfachauswahl im Systembild. Es gab sie im Export nicht — Select wählt
// genau eines, Combobox tippt genau eines — deshalb hier gebaut, aus denselben
// Teilen: Kontur und Innenabstand von FieldShell, Liste und Dreieck von Select.
//
// Das Gewählte steht als eckige Marke im Feld, dahinter läuft das Suchfeld
// weiter. Rückschritt in der leeren Suche nimmt die letzte Marke zurück — das
// ist die Geste, die man von jedem Mehrfachfeld erwartet.
import { useEffect, useId, useMemo, useRef, useState } from "react";

import FieldShell, {
  cn,
  fieldBareTextClassName,
  fieldEdgeClassName,
  fieldPaddingClassName,
  fieldPaddingLgClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";
import {
  Caret,
  OptionList,
  normalizeOptions,
  type SelectOption,
  type SelectOptionInput,
} from "@/components/knglmrt/Select";

export type MultiSelectProps = FieldStateProps & {
  label?: string;
  required?: boolean;
  /** Die gewählten Werte. Kontrolliert. */
  value: string[];
  options: ReadonlyArray<SelectOptionInput>;
  placeholder?: string;
  onChange: (values: string[], options: SelectOption[]) => void;
  /** Kreuz zum Leeren rechts im Feld. */
  clearable?: boolean;
  empty?: string;
  /** `lg` gibt dem Feld mehr Höhe — für Filterleisten. */
  size?: "md" | "lg";
  /**
   * Freie Eingaben erlauben: Was getippt ist und nicht in der Liste steht,
   * erscheint oben als „neu“ und lässt sich mit Enter übernehmen. Gewählte
   * Werte ohne passende Option bleiben dann als Marke stehen.
   */
  creatable?: boolean;
  /** Höchstzahl gewählter Werte — danach nimmt das Feld nichts mehr an. */
  maxSelected?: number;
  /** Höchstlänge einer freien Eingabe. */
  maxLength?: number;
  id?: string;
  className?: string;
};

export default function MultiSelect({
  label,
  required,
  value,
  options,
  placeholder = "auswählen",
  disabled,
  error,
  hint,
  onChange,
  clearable = true,
  empty = "kein Treffer",
  size = "md",
  creatable = false,
  maxSelected,
  maxLength,
  id,
  className,
}: MultiSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error || hint ? `${inputId}-message` : undefined;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => normalizeOptions(options), [options]);
  const resolve = (entry: string): SelectOption | undefined =>
    items.find((option) => option.value === entry) ??
    (creatable ? { value: entry, label: entry } : undefined);
  const selectedOptions = value
    .map(resolve)
    .filter((option): option is SelectOption => Boolean(option));
  const isFull = maxSelected !== undefined && value.length >= maxSelected;

  // Gewähltes bleibt in der Liste stehen (mit Markierung), damit man es dort
  // auch wieder abwählen kann.
  const typed = query.trim();
  const needle = typed.toLowerCase();
  const matches = needle
    ? items.filter((option) => option.label.toLowerCase().includes(needle))
    : items;
  const isKnown =
    items.some((option) => option.label.toLowerCase() === needle) ||
    value.some((entry) => entry.toLowerCase() === needle);
  const hits: SelectOption[] =
    creatable && typed && !isKnown
      ? [{ value: typed, label: typed, meta: "neu" }, ...matches]
      : matches;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(nextValues: string[]) {
    onChange(
      nextValues,
      nextValues
        .map(resolve)
        .filter((option): option is SelectOption => Boolean(option)),
    );
  }

  function toggle(option: SelectOption) {
    const isSelected = value.includes(option.value);
    if (!isSelected && isFull) return;
    commit(
      isSelected
        ? value.filter((entry) => entry !== option.value)
        : [...value, option.value],
    );
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (!hits.length) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + hits.length) % hits.length);
      return;
    }
    // Bei freier Eingabe übernimmt Enter auch ohne markierte Zeile den
    // ersten Treffer — meist genau das Getippte.
    const enterTarget =
      hits[activeIndex] ?? (creatable && typed ? hits[0] : undefined);
    if (event.key === "Enter" && open && enterTarget) {
      event.preventDefault();
      toggle(enterTarget);
      return;
    }
    if (event.key === "Backspace" && query === "" && value.length > 0) {
      commit(value.slice(0, -1));
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <FieldShell
      as="div"
      label={label}
      required={required}
      disabled={disabled}
      error={error}
      hint={hint}
      messageId={messageId}
      className={className}
    >
      <div ref={rootRef} className="relative">
        <div
          onMouseDown={(event) => {
            // Klick ins Feld gehört dem Suchfeld, nicht der Marke darunter.
            if ((event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            if (!disabled) {
              inputRef.current?.focus();
              setOpen(true);
            }
          }}
          className={cn(
            fieldEdgeClassName({ disabled, invalid: Boolean(error) }),
            size === "lg" ? fieldPaddingLgClassName : fieldPaddingClassName,
            "flex flex-wrap items-center gap-1.5",
            !disabled && "cursor-text",
            open && !disabled && "border-primary",
          )}
        >
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex max-w-full items-center gap-1.5 bg-muted px-1.5 text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)] text-foreground"
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${option.label} entfernen`}
                onClick={() =>
                  commit(value.filter((entry) => entry !== option.value))
                }
                className="cursor-pointer leading-none text-muted-foreground transition-colors hover:text-primary"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            id={inputId}
            role="combobox"
            autoComplete="off"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={
              open && activeIndex >= 0
                ? `${listboxId}-${activeIndex}`
                : undefined
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={selectedOptions.length === 0 ? placeholder : ""}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={cn(fieldBareTextClassName, "w-auto min-w-[6ch] flex-1")}
          />
          {clearable && value.length > 0 && !disabled ? (
            <button
              type="button"
              aria-label="Auswahl leeren"
              onClick={() => {
                commit([]);
                setQuery("");
              }}
              className="cursor-pointer leading-none text-muted-foreground transition-colors hover:text-primary"
            >
              ×
            </button>
          ) : null}
          <Caret open={open} disabled={disabled} />
        </div>
        {open && !disabled ? (
          <OptionList
            options={hits}
            selectedValues={value}
            activeIndex={activeIndex}
            listboxId={listboxId}
            onPick={toggle}
            onHover={setActiveIndex}
            empty={empty}
            highlight={query}
          />
        ) : null}
      </div>
    </FieldShell>
  );
}
