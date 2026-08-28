"use client";

// Portiert aus knglmrt/components/ui/SearchField.jsx.
// Die Suchzeile: Lupe links, Treffer­zahl und Kreuz rechts, Kontur rundum.
// Beide Zeichen sind geometrisch gezeichnet (SVG, 1px) — unter 40px gibt es im
// System keine gezeichneten Figuren.
import { useId } from "react";
import type { InputHTMLAttributes, Ref } from "react";

import { cn, type FieldStateProps } from "@/components/knglmrt/FieldShell";

export type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "className" | "type"
> &
  Pick<FieldStateProps, "disabled"> & {
    value: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    /** Leert das Feld. Ohne das erscheint kein Kreuz. */
    onClear?: () => void;
    /** Rechts in Fira Mono — "4 Treffer". */
    count?: string | number;
    size?: "small" | "medium";
    /** `quiet` setzt die Zeile auf paper-grey — für Filterleisten. */
    tone?: "paper" | "quiet";
    className?: string;
    ref?: Ref<HTMLInputElement>;
  };

export default function SearchField({
  value,
  onChange,
  onClear,
  count,
  size = "medium",
  tone = "paper",
  disabled,
  placeholder = "Suchen",
  id,
  className,
  ref,
  ...rest
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-2.5 knglmrt-border rounded-none transition-colors",
        size === "small"
          ? "px-2 py-1"
          : "px-[var(--ui-field-pad-x)] py-[var(--ui-field-pad-y)]",
        disabled
          ? "border-border bg-muted"
          : cn(
              tone === "quiet" ? "bg-muted" : "bg-card",
              "focus-within:border-primary",
            ),
        className,
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 13 13"
        aria-hidden="true"
        className={cn(
          "block shrink-0",
          disabled
            ? "text-muted-foreground"
            : "text-foreground group-focus-within:text-primary",
        )}
      >
        <circle
          cx="5.2"
          cy="5.2"
          r="4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="8.4"
          y1="8.4"
          x2="12.4"
          y2="12.4"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        type="search"
        role="searchbox"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground disabled:text-muted-foreground",
          size === "small"
            ? "text-[14px] leading-[18px]"
            : "text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)]",
        )}
      />
      {count != null ? (
        <span className="knglmrt-num shrink-0 text-muted-foreground">
          {count}
        </span>
      ) : null}
      {value && onClear && !disabled ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Suche leeren"
          className="shrink-0 cursor-pointer leading-none text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <svg width="13" height="13" viewBox="0 0 11 11" aria-hidden="true">
            <line
              x1="1"
              y1="1"
              x2="10"
              y2="10"
              stroke="currentColor"
              strokeWidth="1"
            />
            <line
              x1="10"
              y1="1"
              x2="1"
              y2="10"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
