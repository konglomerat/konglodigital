"use client";

// Eine Zeile, mehrere Schalter, genau einer aktiv. Optisch keine eigene
// Erfindung: der Rahmen ist die eine Kontur des Systems, jedes Segment ist die
// Taste aus Button.tsx — aktiv gefüllt, sonst still.
import type { ReactNode } from "react";

import Button, { type ButtonSize } from "@/components/knglmrt/Button";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  size?: ButtonSize;
  className?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "chip",
  className,
}: SegmentedControlProps<T>) {
  const containerClassName = [
    // Die eine Kontur sitzt am Rahmen, die Haarlinien dazwischen zeichnet
    // `divide` — die Segmente selbst bleiben randlos.
    "inline-flex knglmrt-border divide-x-[var(--hairline-width)] divide-[var(--hairline-color)] bg-card",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName} role="group">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Button
            key={option.value}
            kind={isActive ? "primary" : "ghost"}
            size={size}
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className="border-0"
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
