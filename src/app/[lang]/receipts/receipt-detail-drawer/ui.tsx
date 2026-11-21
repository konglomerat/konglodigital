"use client";

// Kleine Bausteine der Beleg-Sidebar (Design-Handoff „Variante 2a“).
// Schriftgrößen folgen der Skala in knglmrt-theme.css, nicht den kleineren
// Rohwerten des Entwurfs.
import type { ButtonHTMLAttributes, ReactNode } from "react";

import Button from "@/components/knglmrt/Button";
import Face from "@/components/knglmrt/Face";

import { faceNumberForName } from "./normalize";

/** Abschnitts-/Gruppenlabel: uppercase, weit getrackt. */
export const sectionLabelClassName =
  "font-[family-name:var(--font-core)] text-[length:var(--ui-size-label)] font-bold uppercase leading-[18px] tracking-[.13em]";

/** Der pinke Textlink („Bearbeiten“, „+ Position hinzufügen“ …). */
export function TextLink({
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`cursor-pointer text-[length:var(--ui-size-label)] font-bold leading-[18px] text-primary transition-colors duration-200 hover:text-[var(--ui-action-hover)] disabled:cursor-default disabled:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className={`${sectionLabelClassName} m-0 text-foreground`}>
        {title}
      </h3>
      {action}
    </div>
  );
}

/** Lese-Ansicht: Label links (fest), Wert rechts (einzeilig, gekürzt). */
export function ReadGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
      {children}
    </dl>
  );
}

export function ReadRow({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  title?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <>
      <dt className="text-[length:var(--ui-size-label)] leading-[18px] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`m-0 min-w-0 truncate text-foreground ${mono ? "knglmrt-num leading-[25px]" : ""}`}
        title={title ?? (typeof value === "string" ? value : undefined)}
      >
        {empty ? "—" : value}
      </dd>
    </>
  );
}

/** Schließen-Kreuz aus zwei gedrehten Balken, kein Icon-Font. */
export function CloseCross({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Schließen"
      className="relative h-8 w-8 flex-none cursor-pointer hover:bg-[var(--ui-quiet-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
    >
      <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" />
      <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-foreground" />
    </button>
  );
}

/** Kleines CSS-Dreieck, zeigt nach unten (offen) oder oben. */
export function Caret({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-0 w-0 border-x-[5px] border-x-transparent ${
        open
          ? "border-t-[6px] border-t-primary"
          : "border-b-[6px] border-b-primary"
      }`}
    />
  );
}

export function Avatar({ name, size = 40 }: { name: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center overflow-hidden bg-[var(--knglmrt-tint-avatar)] dark:bg-primary-soft"
      style={{ width: size, height: size }}
    >
      <Face
        number={faceNumberForName(name)}
        size={Math.round(size * 0.85)}
        color="var(--foreground)"
      />
    </span>
  );
}

/** Der rosa Bearbeitungsblock: zwei Spalten, ragt seitlich um 12px hinaus. */
export function EditBlock({
  children,
  error,
  onCancel,
  onApply,
  applying,
  applyDisabled,
}: {
  children: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onApply: () => void;
  applying?: boolean;
  applyDisabled?: boolean;
}) {
  return (
    <div className="-mx-3 bg-primary-soft p-3">
      <div className="grid grid-cols-2 gap-3">{children}</div>
      {error ? <p className="mt-3 text-destructive">{error}</p> : null}
      <EditActions
        onCancel={onCancel}
        onApply={onApply}
        applying={applying}
        applyDisabled={applyDisabled}
      />
    </div>
  );
}

export function EditActions({
  onCancel,
  onApply,
  applying,
  applyDisabled,
  applyLabel = "Übernehmen",
}: {
  onCancel: () => void;
  onApply: () => void;
  applying?: boolean;
  applyDisabled?: boolean;
  applyLabel?: string;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <Button kind="quiet" size="chip" onClick={onCancel} disabled={applying}>
        Abbrechen
      </Button>
      <Button
        kind="primary"
        size="chip"
        onClick={onApply}
        loading={applying}
        disabled={applyDisabled}
      >
        {applyLabel}
      </Button>
    </div>
  );
}
