"use client";

// Portiert aus knglmrt/components/ui/Combobox.jsx.
// Tippen und wählen. Gleiche Kontur wie Field, gleiche Liste wie Select — der
// getippte Teil jeder Zeile bleibt fett und pink stehen.
//
// Wie bei Select hält die Komponente ihr Auf/Zu selbst (der Export tat das
// nicht) und filtert die Optionen, solange keine eigene `filter`-Funktion
// übergeben wird. Wer serverseitig sucht, setzt `filter={(o) => o}`.
import { useEffect, useId, useRef, useState } from "react";

import FieldShell, {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  fieldBareTextClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";
import {
  Caret,
  OptionList,
  normalizeOptions,
  type SelectOption,
  type SelectOptionInput,
} from "@/components/knglmrt/Select";

export type ComboboxProps = FieldStateProps & {
  label?: string;
  required?: boolean;
  /** Der getippte Text. Kontrolliert. */
  value: string;
  options: ReadonlyArray<SelectOptionInput>;
  placeholder?: string;
  /** Bei jedem Tastendruck. */
  onChange: (value: string) => void;
  /** Wenn eine Zeile gewählt wurde. Ohne das passiert beim Klick nichts. */
  onPick?: (option: SelectOption) => void;
  /** Eigene Filterung — Standard ist "enthält den getippten Text". */
  filter?: (options: SelectOption[], query: string) => SelectOption[];
  empty?: string;
  name?: string;
  id?: string;
  className?: string;
};

function defaultFilter(options: SelectOption[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    option.label.toLowerCase().includes(needle),
  );
}

export default function Combobox({
  label,
  required,
  value,
  options,
  placeholder = "tippen zum Suchen",
  disabled,
  error,
  hint,
  onChange,
  onPick,
  filter = defaultFilter,
  empty = "kein Treffer",
  name,
  id,
  className,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error || hint ? `${inputId}-message` : undefined;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const hits = filter(normalizeOptions(options), value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(option: SelectOption) {
    onPick?.(option);
    onChange(option.label);
    setOpen(false);
    setActiveIndex(-1);
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
    if (event.key === "Enter" && open && hits[activeIndex]) {
      event.preventDefault();
      pick(hits[activeIndex]);
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
          className={cn(
            fieldEdgeClassName({ disabled, invalid: Boolean(error) }),
            fieldPaddingClassName,
            "flex items-center gap-2.5",
            open && !disabled && "border-primary",
          )}
        >
          <input
            type="text"
            id={inputId}
            name={name}
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
            placeholder={placeholder}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={fieldBareTextClassName}
          />
          <Caret open={open} disabled={disabled} />
        </div>
        {open && !disabled ? (
          <OptionList
            options={hits}
            activeIndex={activeIndex}
            listboxId={listboxId}
            onPick={pick}
            onHover={setActiveIndex}
            empty={empty}
            highlight={value}
          />
        ) : null}
      </div>
    </FieldShell>
  );
}
