"use client";

// Portiert aus knglmrt/components/ui/Stepper.jsx.
// Zahl zwischen zwei Tasten, alles in einer Kontur. Der Wert läuft in Fira Mono
// — wie jede Zahl im System — und ist zusätzlich tippbar, damit man 12 nicht
// zwölfmal klicken muss.
import { useId } from "react";

import FieldShell, {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";

export type StepperProps = FieldStateProps & {
  label?: string;
  required?: boolean;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Einheit hinter der Zahl — "h", "Stk", "€". */
  unit?: string;
  name?: string;
  id?: string;
  className?: string;
};

const stepButtonClassName =
  "flex w-[33px] shrink-0 cursor-pointer items-center justify-center self-stretch text-[15px] leading-none transition-colors hover:bg-ui-quiet-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:cursor-default disabled:text-muted-foreground";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function Stepper({
  label,
  required,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  unit,
  disabled,
  error,
  hint,
  name,
  id,
  className,
}: StepperProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = error || hint ? `${inputId}-message` : undefined;

  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;

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
      <div
        className={cn(
          fieldEdgeClassName({ disabled, invalid: Boolean(error) }),
          "flex items-stretch divide-x-[var(--hairline-width)] divide-[var(--hairline-color)]",
          disabled && "divide-[var(--border)]",
        )}
      >
        <button
          type="button"
          disabled={atMin}
          aria-label="weniger"
          onClick={() => onChange(clamp(value - step, min, max))}
          className={stepButtonClassName}
        >
          –
        </button>
        <div
          className={cn(
            fieldPaddingClassName,
            "flex flex-1 items-center justify-center gap-1",
          )}
        >
          <input
            type="number"
            id={inputId}
            name={name}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) onChange(clamp(next, min, max));
            }}
            className="knglmrt-num w-full min-w-0 rounded-none border-0 bg-transparent p-0 text-center outline-none disabled:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {unit ? (
            <span className="knglmrt-num shrink-0 text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={atMax}
          aria-label="mehr"
          onClick={() => onChange(clamp(value + step, min, max))}
          className={stepButtonClassName}
        >
          +
        </button>
      </div>
    </FieldShell>
  );
}
