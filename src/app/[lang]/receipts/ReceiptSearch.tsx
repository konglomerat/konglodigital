"use client";

// Suche der Buchungstabelle. Eingeklappt eine Taste wie die übrigen Filter,
// damit die Filterzeile Platz behält; ausgeklappt Suchfeld und die Auswahl,
// worin gesucht wird.
// „/" springt von überall ins Feld, Escape leert und klappt zu.
import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

import FieldShell from "@/components/knglmrt/FieldShell";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import SearchField from "@/components/knglmrt/SearchField";

type ReceiptSearchProps<T extends string> = {
  value: string;
  onChange: (value: string) => void;
  scope: T;
  scopes: ReadonlyArray<{ value: T; label: string }>;
  onScopeChange: (scope: T) => void;
};

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function ReceiptSearch<T extends string>({
  value,
  onChange,
  scope,
  scopes,
  onScopeChange,
}: ReceiptSearchProps<T>) {
  const controlId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Eine laufende Suche bleibt sichtbar, auch wenn der Fokus woanders ist.
  const isExpanded = isOpen || value !== "";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const close = () => {
    onChange("");
    setIsOpen(false);
  };

  const scopeLabel =
    scopes.find((option) => option.value === scope)?.label ?? "";

  if (!isExpanded) {
    return (
      <FieldShell
        as="div"
        htmlFor={controlId}
        label="Suche"
        className="shrink-0"
      >
        <button
          id={controlId}
          type="button"
          onClick={() => setIsOpen(true)}
          title="Buchungen durchsuchen (/)"
          className="inline-flex h-[38px] shrink-0 items-center gap-3 whitespace-nowrap knglmrt-border bg-card px-4 transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="font-bold">{scopeLabel}</span>
        </button>
      </FieldShell>
    );
  }

  return (
    <FieldShell as="div" htmlFor={controlId} label="Suche" className="shrink-0">
      <div
        ref={containerRef}
        role="search"
        className="flex items-center"
        onBlur={(event) => {
          if (
            !value &&
            !containerRef.current?.contains(event.relatedTarget as Node | null)
          ) {
            setIsOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            close();
          }
        }}
      >
        <SearchField
          ref={inputRef}
          id={controlId}
          size="small"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClear={close}
          placeholder={
            scope === scopes[0]?.value ? "Suchen" : `${scopeLabel} …`
          }
          aria-label="Buchungen durchsuchen"
          className="h-[38px] w-[clamp(110px,26cqw,240px)]"
        />
        <NativeSelect
          aria-label="Suchen in"
          title="Suchen in"
          value={scope}
          onChange={(event) => onScopeChange(event.target.value as T)}
          className="-ml-px w-auto max-w-[clamp(84px,20cqw,180px)] shrink-0"
          selectClassName="h-[38px] py-0 text-muted-foreground"
        >
          {scopes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </FieldShell>
  );
}
