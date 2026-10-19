"use client";

// Unterprojekte eines Werkbereichs (dreistellige Kostenstelle 2) als
// Mehrfachauswahl. Leere Auswahl heißt: alle. Das Gruppieren nach Projekt
// sitzt mit im aufgeklappten Feld — es gehört zur selben Frage.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import Choice from "@/components/knglmrt/Choice";
import FieldShell from "@/components/knglmrt/FieldShell";

export type ProjectFilterOption = {
  key: string;
  label: string;
  count: number;
  /** Saldo in Cent. */
  saldo: number;
};

type ProjectFilterProps = {
  options: ProjectFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  formatAmount: (cents: number) => string;
  groupByProject: boolean;
  onGroupByProjectChange: (value: boolean) => void;
  /** Zusatzklasse am aufgeklappten Feld. */
  panelClassName?: string;
};

export default function ProjectFilter({
  options,
  value,
  onChange,
  formatAmount,
  groupByProject,
  onGroupByProjectChange,
  panelClassName,
}: ProjectFilterProps) {
  const buttonId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selected = useMemo(() => new Set(value), [value]);
  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : options;
  }, [options, query]);

  const selectedOptions = options.filter((option) => selected.has(option.key));
  const selectionSaldo = (
    selectedOptions.length > 0 ? selectedOptions : options
  ).reduce((sum, option) => sum + option.saldo, 0);

  const buttonLabel =
    selectedOptions.length === 0
      ? `Alle (${options.length})`
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} von ${options.length}`;

  const toggle = (key: string) => {
    onChange(
      selected.has(key)
        ? value.filter((entry) => entry !== key)
        : [...value, key],
    );
  };

  return (
    <FieldShell
      as="div"
      htmlFor={buttonId}
      label="Projekt"
      className="relative shrink-0"
    >
      <div ref={containerRef}>
        <button
          id={buttonId}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="project-filter-panel"
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex h-[38px] max-w-[320px] shrink-0 items-center gap-3 whitespace-nowrap knglmrt-border bg-card px-4 transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <span className="truncate font-bold">
            {buttonLabel}
            {groupByProject ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · gruppiert
              </span>
            ) : null}
          </span>
          <FontAwesomeIcon
            icon={faChevronDown}
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen ? (
          <div
            id="project-filter-panel"
            role="dialog"
            aria-label="Projekte filtern"
            className={`absolute left-0 top-full z-30 mt-2 w-[min(400px,calc(100vw-2rem))] border border-primary bg-popover text-popover-foreground ${panelClassName ?? ""}`}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Projekt suchen …"
              aria-label="Projekt suchen"
              autoFocus
              className="w-full border-b border-border bg-transparent px-5 py-3 placeholder:text-muted-foreground focus-visible:outline-none"
            />

            <ul className="max-h-[320px] overflow-y-auto">
              {visibleOptions.length === 0 ? (
                <li className="px-5 py-3 text-muted-foreground">
                  Kein Projekt gefunden.
                </li>
              ) : (
                visibleOptions.map((option) => (
                  <li
                    key={option.key}
                    className="flex items-start justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0"
                  >
                    <Choice
                      className="min-w-0"
                      checked={selected.has(option.key)}
                      onChange={() => toggle(option.key)}
                      label={<span className="font-bold">{option.label}</span>}
                      hint={`${option.count} ${option.count === 1 ? "Buchung" : "Buchungen"}`}
                    />
                    <span
                      className={`knglmrt-num shrink-0 pt-1 ${
                        option.saldo < 0 ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {formatAmount(option.saldo)}
                    </span>
                  </li>
                ))
              )}
            </ul>

            <div className="border-t border-border px-5 py-3">
              <Choice
                kind="switch"
                checked={groupByProject}
                onChange={(event) =>
                  onGroupByProjectChange(event.target.checked)
                }
                label="Nach Projekt gruppieren"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border bg-muted px-5 py-3">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-primary hover:text-[var(--link-color-hover)]"
              >
                Alle anzeigen
              </button>
              <span>
                Auswahl{" "}
                <span
                  className={`knglmrt-num font-bold! ${selectionSaldo < 0 ? "text-primary" : ""}`}
                >
                  {formatAmount(selectionSaldo)}
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
