"use client";

// Portiert aus knglmrt/components/ui/Field.jsx.
// Das beschriftete Eingabefeld — die Grundform aller anderen Felder.
//
// Anders als der Export: `state` ist verschwunden. Fokus macht CSS, gesperrt
// macht `disabled`, fehlerhaft macht `error` — Zustände, die die App wirklich
// hat, statt eines Aufzählungstyps zum Vorzeigen. Der Select-`kind` des Exports
// ist ebenfalls weg; dafür gibt es Select.tsx.
import { useId } from "react";
import type { InputHTMLAttributes, Ref } from "react";

import FieldShell, {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  fieldTextClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";

export type FieldKind =
  /** Der Normalfall: Fira Sans Condensed 18/25. */
  | "text"
  /** Zahlen, Daten, Beträge, IDs — Fira Mono. */
  | "mono"
  /** Der handschriftliche Eintrag: Permanent Marker auf paper-pink. */
  | "hand";

const KIND_CLASSNAME: Record<FieldKind, string> = {
  text: "",
  mono: "font-num tabular-nums",
  hand: "font-hand text-[20px] leading-[23px] tracking-[.12em] text-[var(--knglmrt-brown-100)]",
};

export type FieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "className"
> &
  FieldStateProps & {
    label?: string;
    required?: boolean;
    kind?: FieldKind;
    /** Klasse am äußeren Rahmen (Breite, Spalten) — nicht am <input>. */
    className?: string;
    /** Klasse an der Beschriftung — für Umbruch, Breite, Sichtbarkeit. */
    labelClassName?: string;
    /** Klasse am <input> selbst. */
    inputClassName?: string;
    ref?: Ref<HTMLInputElement>;
  };

export default function Field({
  label,
  required,
  kind = "text",
  disabled,
  error,
  hint,
  className,
  labelClassName,
  inputClassName,
  id,
  ref,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error || hint ? `${inputId}-message` : undefined;

  const input = (
    <input
      {...rest}
      ref={ref}
      id={inputId}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className={cn(
        fieldEdgeClassName({
          disabled,
          invalid: Boolean(error),
          // Das handschriftliche Feld steht auf paper-pink — der einzige
          // Fall, in dem ein Feld nicht weiß ist.
          surface: kind === "hand" ? "bg-primary-soft" : "bg-card",
        }),
        fieldPaddingClassName,
        fieldTextClassName,
        KIND_CLASSNAME[kind],
        inputClassName,
      )}
    />
  );

  // Ohne Beschriftung, Hinweis und Fehler gibt es nichts zu umschließen: das
  // Feld steht dann allein — etwa in einer Zelle oder unter einer Beschriftung,
  // die der Aufrufer selbst setzt.
  if (!label && !hint && !error) {
    return className ? <div className={className}>{input}</div> : input;
  }

  return (
    <FieldShell
      as="label"
      htmlFor={inputId}
      label={label}
      required={required}
      disabled={disabled}
      error={error}
      hint={hint}
      messageId={messageId}
      className={className}
      labelClassName={labelClassName}
    >
      {input}
    </FieldShell>
  );
}
