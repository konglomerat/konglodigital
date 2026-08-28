// Der gemeinsame Rahmen aller Formularfelder. Portiert aus dem Kopf von
// public/branding/controls_surfaces_tables-export/react/ui/Field.jsx, den sich
// dort jede Datei noch selbst kopiert hat: Label oben, Steuerelement, darunter
// Hinweis oder Fehler.
//
// Drei Regeln, die für jedes Feld gelten und deshalb hier stehen:
//   Kontur   2px (--hairline) um das Steuerelement — das ist, was ein Formular
//            zusammenhält. Radius 0.
//   Fokus    die Kontur wird pink, das Label auch. Kein Ring, kein Schatten.
//   Fehler   dieselbe pinke Kontur, dazu der Satz unter dem Feld.
// Der Fokuszustand ist CSS (`focus-within`), keine Prop — anders als im Export,
// der ihn zum Vorzeigen durchreichen musste.
import type { HTMLAttributes, ReactNode } from "react";

export type FieldStateProps = {
  /** Gesperrt: graue Fläche, Kontur --border, Beschriftung stumm. */
  disabled?: boolean;
  /** Fehlertext. Gesetzt heißt: Kontur und Label pink, Satz statt Hinweis. */
  error?: string;
  /** Erklärung unter dem Feld. Weicht dem Fehler. */
  hint?: string;
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Die Kontur um ein Steuerelement.
 * `focusWithin` schaltet den Fokuszustand auf den Rahmen um — für Felder, bei
 * denen der Rahmen nicht selbst das fokussierte Element ist (Select, Stepper,
 * SearchField).
 */
export function fieldEdgeClassName({
  disabled,
  invalid,
  focusWithin = true,
  surface = "bg-card",
}: {
  disabled?: boolean;
  invalid?: boolean;
  focusWithin?: boolean;
  /**
   * Die Fläche im Rahmen. Muss von hier kommen und nicht als zweite
   * bg-Klasse danebenstehen — welche von zwei Utilities gewinnt, entscheidet
   * Tailwinds Sortierung, nicht die Reihenfolge im className.
   */
  surface?: string;
}) {
  return cn(
    "knglmrt-border rounded-none transition-colors",
    disabled
      ? "border-border bg-muted text-muted-foreground"
      : cn(surface, "text-foreground"),
    invalid && !disabled && "border-primary",
    !disabled &&
      (focusWithin
        ? "focus-within:border-primary"
        : "focus:border-primary focus-visible:border-primary"),
  );
}

/**
 * Schriftbild im Feld: 16/19 — eine Stufe unter dem Fließtext. Radius 0,
 * keine Outline.
 * Enthält bewusst keine border-Klasse — `border-0` läge in Tailwinds
 * utilities-Layer und würde die Kontur aus `knglmrt-border` (components-Layer)
 * wieder abräumen, egal in welcher Reihenfolge die Klassen stehen.
 */
export const fieldTextClassName =
  "w-full min-w-0 rounded-none p-0 font-[family-name:var(--font-core)] text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)] text-foreground outline-none placeholder:text-muted-foreground disabled:text-muted-foreground";

/**
 * Für Eingabefelder, die *in* einem Rahmen sitzen (Combobox, Stepper): dieselbe
 * Schrift, aber ohne eigene Kontur — die trägt der Rahmen ringsum.
 */
export const fieldBareTextClassName = `${fieldTextClassName} border-0 bg-transparent`;

/** Innenabstand eines Steuerelements — an einer Stelle, damit alle gleich hoch sind. */
export const fieldPaddingClassName =
  "px-[var(--ui-field-pad-x)] py-[var(--ui-field-pad-y)]";

type FieldShellProps = FieldStateProps &
  Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  label?: ReactNode;
  /** Pflichtfeld: ein pinker Stern hinter der Beschriftung. */
  required?: boolean;
  /**
   * `label` umschließt das Steuerelement (Field, Textarea) — für alles, was
   * kein natives Eingabefeld ist (Select, Stepper, Choice), muss es `div` sein.
   */
  as?: "label" | "div";
  htmlFor?: string;
  /** id des Hinweis-/Fehlersatzes, damit ihn `aria-describedby` findet. */
  messageId?: string;
  className?: string;
  /** Zusatzklassen an der Beschriftung — für Umbruch, Breite, Sichtbarkeit. */
  labelClassName?: string;
  children: ReactNode;
};

export default function FieldShell({
  label,
  required,
  disabled,
  error,
  hint,
  as = "label",
  htmlFor,
  messageId,
  className,
  labelClassName,
  children,
  ...rest
}: FieldShellProps) {
  const Tag = as;
  const message = error || hint;

  return (
    <Tag
      {...rest}
      {...(as === "label" && htmlFor ? { htmlFor } : {})}
      className={cn("group flex min-w-0 flex-col gap-1.5", className)}
    >
      {label ? (
        <span
          className={cn(
            "knglmrt-label",
            disabled
              ? "text-muted-foreground"
              : error
                ? "text-primary"
                : "text-foreground group-focus-within:text-primary",
            labelClassName,
          )}
        >
          {label}
          {required ? <span className="ml-1 text-primary">*</span> : null}
        </span>
      ) : null}
      {children}
      {message ? (
        <span
          id={messageId}
          className={cn(
            "text-[13px] leading-[18px]",
            error && !disabled ? "text-primary" : "text-muted-foreground",
          )}
        >
          {message}
        </span>
      ) : null}
    </Tag>
  );
}
