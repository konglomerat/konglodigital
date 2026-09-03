"use client";

// Das native Auswahlfeld. Select.tsx ist die eigene Liste des Systems (mit
// meta-Spalte, Tastatur und pinker Kontur); hier steht die Variante für Listen,
// die im Markup als <option> stehen — lange Kontenpläne, Länderlisten, alles,
// was der Browser selbst besser scrollt als wir.
//
// Optisch derselbe Rahmen wie Field; das Dreieck des Browsers weicht dem
// geometrischen Caret des Systems.
import { useId } from "react";
import type { Ref, SelectHTMLAttributes } from "react";

import FieldShell, {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  fieldTextClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";
import { Caret } from "@/components/knglmrt/Select";

export type NativeSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> &
  FieldStateProps & {
    label?: string;
    required?: boolean;
    /** Klasse am äußeren Rahmen (Breite, Spalten) — nicht am <select>. */
    className?: string;
    /** Klasse an der Beschriftung — für Umbruch, Breite, Sichtbarkeit. */
    labelClassName?: string;
    /** Klasse am <select> selbst. */
    selectClassName?: string;
    ref?: Ref<HTMLSelectElement>;
  };

export default function NativeSelect({
  label,
  required,
  disabled,
  error,
  hint,
  className,
  labelClassName,
  selectClassName,
  id,
  children,
  ref,
  ...rest
}: NativeSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = error || hint ? `${selectId}-message` : undefined;

  const control = (
    <span className="relative block w-full">
      <select
        {...rest}
        ref={ref}
        id={selectId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(
          fieldEdgeClassName({ disabled, invalid: Boolean(error) }),
          fieldPaddingClassName,
          fieldTextClassName,
          "appearance-none pr-7",
          selectClassName,
        )}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-[var(--ui-field-pad-x)] flex items-center">
        <Caret disabled={disabled} />
      </span>
    </span>
  );

  if (!label && !hint && !error) {
    return className ? <div className={className}>{control}</div> : control;
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
      labelClassName={labelClassName}
    >
      {control}
    </FieldShell>
  );
}
