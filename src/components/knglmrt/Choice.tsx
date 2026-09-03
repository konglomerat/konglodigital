"use client";

// Portiert aus knglmrt/components/ui/Choice.jsx.
// Kästchen, Punkt und Schalter — quadratisch und geometrisch, mit Absicht:
// gezeichnetes Material gibt es im System erst ab 40px.
//
// Anders als der Export liegt darunter ein echtes <input>: Tastatur, Formular­
// versand und Screenreader kommen so von selbst, die Optik hängt an `peer-*`.
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/components/knglmrt/FieldShell";

export type ChoiceKind = "checkbox" | "radio" | "switch";

export type ChoiceProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  /** Ohne Beschriftung steht nur das Kästchen — dann gehört ein aria-label dazu. */
  label?: ReactNode;
  kind?: ChoiceKind;
  /** Zweite Zeile unter der Beschriftung, still. */
  hint?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

// Fokus ist auch hier die schwarze Outline — sie sitzt auf der Attrappe, weil
// das echte Feld unsichtbar ist.
const focusClassName =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]";

export default function Choice({
  label,
  kind = "checkbox",
  hint,
  disabled,
  className,
  ref,
  ...rest
}: ChoiceProps) {
  return (
    <label
      className={cn(
        "inline-flex items-start gap-2.5",
        disabled ? "cursor-default opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <input
        {...rest}
        ref={ref}
        type={kind === "radio" ? "radio" : "checkbox"}
        role={kind === "switch" ? "switch" : undefined}
        disabled={disabled}
        className="peer sr-only"
      />
      {kind === "checkbox" ? (
        <span
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0 knglmrt-border",
            disabled ? "border-border bg-muted" : "border-foreground bg-card",
            "peer-checked:bg-foreground peer-checked:shadow-[inset_0_0_0_4px_var(--card)]",
            focusClassName,
          )}
        />
      ) : null}
      {kind === "radio" ? (
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center knglmrt-border",
            disabled ? "border-border bg-muted" : "border-foreground bg-card",
            // Der Punkt sitzt im Kasten, ist also kein Geschwister des Feldes —
            // peer-checked muss ihn von hier aus treffen.
            "peer-checked:[&>span]:bg-primary",
            focusClassName,
          )}
        >
          <span className="h-2.5 w-2.5 bg-transparent" />
        </span>
      ) : null}
      {kind === "switch" ? (
        <span
          className={cn(
            "mt-0.5 flex h-6 w-11 shrink-0 items-center justify-start p-[2px] transition-colors",
            "knglmrt-border",
            disabled ? "border-border bg-muted" : "border-foreground bg-card",
            "peer-checked:justify-end peer-checked:bg-[var(--knglmrt-pink-30)]",
            "peer-checked:[&>span]:bg-primary",
            focusClassName,
          )}
        >
          <span
            className={cn(
              "h-4 w-4 transition-colors",
              disabled ? "bg-border" : "bg-foreground",
            )}
          />
        </span>
      ) : null}
      {label || hint ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-foreground">{label}</span>
          {hint ? (
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/** Mehrere Choices unter einer Beschriftung — Radio-Sätze und Checkbox-Listen. */
export function ChoiceGroup({
  label,
  hint,
  error,
  children,
  row = false,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  /** Nebeneinander statt untereinander. */
  row?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label ? (
        <legend
          className={cn("knglmrt-label", error ? "text-primary" : "text-foreground")}
        >
          {label}
        </legend>
      ) : null}
      <div className={cn("flex gap-x-6 gap-y-2", row ? "flex-wrap" : "flex-col")}>
        {children}
      </div>
      {error || hint ? (
        <span
          className={cn(
            "text-[13px] leading-[18px]",
            error ? "text-primary" : "text-muted-foreground",
          )}
        >
          {error || hint}
        </span>
      ) : null}
    </fieldset>
  );
}
