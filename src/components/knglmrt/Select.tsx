"use client";

// Portiert aus knglmrt/components/ui/Select.jsx.
// Geschlossen ist das Feld ein Field mit Caret; offen fällt die Liste mit
// pinker Kontur darüber. Radius 0, kein Schatten, ausgewählt = paper-pink.
//
// Der Export war absichtlich zustandslos (`open` kam von außen), weil er nur
// Zustände zeigen musste. Hier hält die Komponente ihr Auf/Zu selbst — inkl.
// Klick nach außen und Tastatur — und lässt sich über `open`/`onOpenChange`
// trotzdem von außen steuern, wenn eine Seite das braucht.
import { useEffect, useId, useRef, useState } from "react";

import FieldShell, {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";

export type SelectOption = {
  value: string;
  label: string;
  /** Rechts in der Zeile, Fira Mono — Etage, Kürzel, Preis. */
  meta?: string;
  disabled?: boolean;
};

/** Optionen dürfen auch nackte Strings sein: value und label sind dann gleich. */
export type SelectOptionInput = SelectOption | string;

export function normalizeOptions(
  options: ReadonlyArray<SelectOptionInput>,
): SelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

/** Die Liste, die unter Select und Combobox hängt. */
export function OptionList({
  options,
  value,
  activeIndex,
  listboxId,
  onPick,
  onHover,
  empty,
  highlight,
}: {
  options: SelectOption[];
  value?: string;
  activeIndex: number;
  listboxId: string;
  onPick: (option: SelectOption) => void;
  onHover?: (index: number) => void;
  empty?: string;
  /** Der getippte Teil einer Zeile, der fett und pink stehen bleibt. */
  highlight?: string;
}) {
  return (
    <div
      id={listboxId}
      role="listbox"
      className="absolute left-0 right-0 top-full z-20 -mt-[var(--hairline-width)] max-h-64 overflow-y-auto knglmrt-border border-primary bg-card"
    >
      {options.length === 0 ? (
        <div className={cn(fieldPaddingClassName, "text-muted-foreground")}>
          {empty ?? "kein Treffer"}
        </div>
      ) : (
        options.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return (
            <div
              key={option.value}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              onMouseEnter={onHover ? () => onHover(index) : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={option.disabled ? undefined : () => onPick(option)}
              className={cn(
                "flex items-baseline justify-between gap-2.5 px-[var(--ui-field-pad-x)] py-1",
                "text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)]",
                index > 0 && "border-t border-border",
                option.disabled
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer",
                selected && "bg-primary-soft",
                active && !selected && "bg-ui-tint-zebra",
              )}
            >
              <span className={cn(selected && "font-semibold")}>
                {renderHighlight(option.label, highlight)}
              </span>
              {option.meta ? (
                <span className="knglmrt-num shrink-0 text-muted-foreground">
                  {option.meta}
                </span>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function renderHighlight(label: string, query?: string) {
  const needle = query?.trim().toLowerCase();
  if (!needle) return label;
  const at = label.toLowerCase().indexOf(needle);
  if (at < 0) return label;
  return (
    <>
      {label.slice(0, at)}
      <b className="font-bold text-primary">
        {label.slice(at, at + needle.length)}
      </b>
      {label.slice(at + needle.length)}
    </>
  );
}

/**
 * Das Dreieck rechts im Feld — geometrisch, nie ein gezeichnetes Zeichen.
 * `block` ist Pflicht und keine Kosmetik: als inline-Element ignoriert der
 * Kasten h-0/w-0 (Breite und Höhe gelten nicht für nicht-ersetzte
 * inline-Boxen), das Dreieck hinge dann an der Grundlinie der umgebenden
 * Zeile — und rutscht mit jeder anderen Schriftgröße woandershin. In einem
 * Flex-Container fiel das nie auf, weil Flex-Items ohnehin blockifiziert
 * werden; außerhalb (NativeSelect) sehr wohl.
 */
export function Caret({
  open,
  disabled,
}: {
  open?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-0 w-0 shrink-0 border-x-[5px] border-t-[6px] border-x-transparent transition-transform",
        disabled ? "border-t-border" : "border-t-foreground",
        open && "rotate-180",
      )}
    />
  );
}

export type SelectProps = FieldStateProps & {
  label?: string;
  required?: boolean;
  value?: string;
  options: ReadonlyArray<SelectOptionInput>;
  placeholder?: string;
  onChange?: (value: string, option: SelectOption) => void;
  /** Auf/Zu von außen steuern. Ohne das hält die Komponente es selbst. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  name?: string;
  id?: string;
  className?: string;
};

export default function Select({
  label,
  required,
  value,
  options,
  placeholder = "bitte wählen",
  disabled,
  error,
  hint,
  onChange,
  open: openProp,
  onOpenChange,
  name,
  id,
  className,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = error || hint ? `${selectId}-message` : undefined;
  const listboxId = `${selectId}-listbox`;

  const items = normalizeOptions(options);
  const selected = items.find((option) => option.value === value);

  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  function setOpen(next: boolean) {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
    if (next) {
      setActiveIndex(items.findIndex((option) => option.value === value));
    }
  }

  // Klick daneben schließt. Ein offenes Menü, das offen bleibt, ist ein Fehler.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(option: SelectOption) {
    onChange?.(option.value, option);
    setOpen(false);
  }

  function step(delta: number) {
    if (!items.length) return;
    let next = activeIndex;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + delta + items.length) % items.length;
      if (!items[next].disabled) break;
    }
    setActiveIndex(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else step(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (items[activeIndex] && !items[activeIndex].disabled)
        pick(items[activeIndex]);
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
        <button
          type="button"
          id={selectId}
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          onClick={() => setOpen(!open)}
          onKeyDown={onKeyDown}
          className={cn(
            fieldEdgeClassName({
              disabled,
              invalid: Boolean(error),
              focusWithin: false,
            }),
            fieldPaddingClassName,
            "flex w-full cursor-pointer items-center justify-between gap-2.5 text-left outline-none",
            "text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)]",
            open && !disabled && "border-primary",
          )}
        >
          <span
            className={cn(
              "truncate",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <Caret open={open} disabled={disabled} />
        </button>
        {open && !disabled ? (
          <OptionList
            options={items}
            value={value}
            activeIndex={activeIndex}
            listboxId={listboxId}
            onPick={pick}
            onHover={setActiveIndex}
          />
        ) : null}
        {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      </div>
    </FieldShell>
  );
}
