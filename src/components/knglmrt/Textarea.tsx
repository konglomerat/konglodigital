"use client";

// Portiert aus knglmrt/components/ui/Textarea.jsx.
// Das mehrzeilige Feld. Gleiche Kontur wie Field; der Zähler sitzt rechts unter
// der Kante und läuft — wie jede Zahl im System — in Fira Mono.
import { useId } from "react";
import type { Ref, TextareaHTMLAttributes } from "react";

import {
  cn,
  fieldEdgeClassName,
  fieldPaddingClassName,
  fieldTextClassName,
  type FieldStateProps,
} from "@/components/knglmrt/FieldShell";

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> &
  FieldStateProps & {
    label?: string;
    required?: boolean;
    counter?: number;
    className?: string;
    labelClassName?: string;
    textareaClassName?: string;
    ref?: Ref<HTMLTextAreaElement>;
  };

export default function Textarea({
  label,
  required,
  disabled,
  error,
  hint,
  counter,
  rows = 3,
  className,
  labelClassName,
  textareaClassName,
  id,
  value,
  defaultValue,
  ref,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const messageId = error || hint ? `${textareaId}-message` : undefined;
  const length = String(value ?? defaultValue ?? "").length;
  const over = counter != null && length > counter;

  const control = (
    <textarea
      {...rest}
      ref={ref}
      id={textareaId}
      rows={rows}
      disabled={disabled}
      value={value}
      defaultValue={defaultValue}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
      className={cn(
        fieldEdgeClassName({ disabled, invalid: Boolean(error) }),
        fieldPaddingClassName,
        fieldTextClassName,
        "resize-y",
        textareaClassName,
      )}
    />
  );

  // Ohne Beschriftung, Hinweis, Fehler und Zähler steht das Feld allein.
  if (!label && !hint && !error && counter == null) {
    return className ? <div className={className}>{control}</div> : control;
  }

  return (
    <label
      htmlFor={textareaId}
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
      {control}
      {error || hint || counter != null ? (
        <span className="flex items-baseline justify-between gap-2.5">
          <span
            id={messageId}
            className={cn(
              "text-[13px] leading-[18px]",
              error && !disabled ? "text-primary" : "text-muted-foreground",
            )}
          >
            {error || hint}
          </span>
          {counter != null ? (
            <span
              className={cn(
                "knglmrt-num shrink-0",
                over ? "text-primary" : "text-muted-foreground",
              )}
            >
              {length}/{counter}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}
