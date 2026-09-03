"use client";

import { useState, type InputHTMLAttributes } from "react";

import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  showLabel?: string;
  hideLabel?: string;
};

export default function PasswordInput({
  className,
  showLabel = "Show",
  hideLabel = "Hide",
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? hideLabel : showLabel;

  return (
    <div className="relative">
      <Field
        {...props}
        type={isVisible ? "text" : "password"}
        inputClassName={className ? `${className} pr-16` : "pr-16"}
      />
      <Button
        kind="ghost"
        size="chip"
        onClick={() => setIsVisible((previous) => !previous)}
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 h-auto text-muted-foreground"
      >
        {toggleLabel}
      </Button>
    </div>
  );
}
