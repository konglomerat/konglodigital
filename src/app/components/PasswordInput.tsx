"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
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
      <input
        {...props}
        type={isVisible ? "text" : "password"}
        className={
          className
            ? `${className} pr-16`
            : "w-full rounded-md border border-zinc-200 bg-white px-4 py-2 pr-16 text-sm"
        }
      />
      <button
        type="button"
        onClick={() => setIsVisible((previous) => !previous)}
        aria-label={toggleLabel}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {toggleLabel}
      </button>
    </div>
  );
}
