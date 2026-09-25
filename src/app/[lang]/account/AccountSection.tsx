"use client";

// src/app/[lang]/account/AccountSection.tsx — die Bausteine, aus denen die
// Kontoseite besteht.
//
// Die Seite zeigt im Ruhezustand nur Gelesenes: je Rubrik eine Überschrift,
// rechts die Handlungen, darunter ein Raster aus Beschriftung und Wert. Keine
// Kacheln, keine Rahmen — die Rubriken trennt eine Linie.
//
// Geändert wird an Ort und Stelle: die Taste in der Kopfzeile klappt unter dem
// Raster einen kleinen Dialog auf, der genau die Felder dieser Taste trägt.
// Deshalb führt jede Rubrik höchstens einen offenen Dialog, und die zugehörige
// Taste zeigt das auch an.
import type { FormEvent, ReactNode } from "react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import Button from "@/components/knglmrt/Button";

export function AccountSection({
  id,
  title,
  badge,
  actions,
  highlight,
  children,
}: {
  id: string;
  title: string;
  /**
   * Blasse Fläche statt Trennlinie — für die eine Rubrik, die oben hervorsticht.
   * Die Rubrik danach verzichtet dann ebenfalls auf ihre Linie.
   */
  highlight?: boolean;
  /** Statusmarke neben der Überschrift, z. B. „Läuft aus". */
  badge?: ReactNode;
  /** Die Tasten rechts in der Kopfzeile. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // `scroll-mt`: ein Sprung per Anker darf nicht unter dem klebenden
      // Seitenkopf landen. Die erste Rubrik trägt keine Trennlinie.
      className={
        highlight
          ? "scroll-mt-[96px] bg-primary-soft p-6 sm:p-7 [&+section]:border-t-0 [&+section]:pt-0"
          : "scroll-mt-[96px] border-t border-border pt-7 first:border-t-0 first:pt-0"
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="m-0">{title}</h2>
        {badge}
        {actions ? (
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Das Raster aus Beschriftung und Wert. Drei Spalten, wie im Entwurf. */
export function DataGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  );
}

export function DataField({
  label,
  value,
  hint,
  mono,
  wide,
  action,
}: {
  label: string;
  /** Leer oder `null` wird zum Gedankenstrich — nie zu einer leeren Zeile. */
  value?: ReactNode;
  hint?: ReactNode;
  /** Zahlen, Daten, Beträge, Nummern laufen in Fira Mono. */
  mono?: boolean;
  /** Nimmt zwei Spalten, z. B. für eine mehrzeilige Adresse. */
  wide?: boolean;
  /** Kleine Taste direkt hinter dem Wert, z. B. der Stift zum Bearbeiten. */
  action?: ReactNode;
}) {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim() === "");

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      {/* Beschriftung wie an den Formularfeldern des DS; der Wert steht
          immer in Fließtextgröße darüber hinaus — auch in Fira Mono, deren
          eigene Größe (`knglmrt-num`) sonst kleiner wäre als das Label. */}
      <dt className="knglmrt-label font-medium! text-foreground">{label}</dt>
      <dd
        className={`mt-1.5 text-[length:var(--ui-size-body)] font-medium leading-6 ${
          mono && !empty
            ? "font-[family-name:var(--font-num)] tabular-nums"
            : ""
        }`}
      >
        {empty ? <span className="text-muted-foreground">—</span> : value}
        {action ? <span className="ml-2 inline-flex">{action}</span> : null}
      </dd>
      {hint ? (
        <dd className="mt-1 text-[15px] leading-5 text-muted-foreground">
          {hint}
        </dd>
      ) : null}
    </div>
  );
}

/**
 * Die Taste, die einen Dialog auf- und wieder zuklappt — tertiär mit kleinem
 * Zeichen, damit sie neben den Kontur-Tasten der Rubriken leise bleibt. Offen
 * läuft sie in der Hover-Farbe, sonst sieht man der Reihe nicht an, welcher
 * Dialog gerade unten steht.
 */
export function EditToggle({
  open,
  controls,
  icon,
  onClick,
  children,
  disabled,
}: {
  open: boolean;
  controls: string;
  icon: IconProp;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      kind="tertiary"
      size="small"
      icon={icon}
      disabled={disabled}
      aria-expanded={open}
      aria-controls={controls}
      className={[
        "disabled:cursor-default disabled:text-muted-foreground",
        open ? "text-[var(--ui-action-hover)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * Der kleine Dialog unter dem Raster. Er ist ein eigenes Formular: was hier
 * gespeichert wird, ist genau das, was seine Taste versprochen hat.
 */
export function InlineEditor({
  id,
  title,
  saving,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  id: string;
  title: string;
  saving: boolean;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <form id={id} onSubmit={onSubmit} className="mt-6 knglmrt-border p-[18px]">
      <div className="knglmrt-label mb-4 text-primary">{title}</div>
      <div className="flex max-w-[560px] flex-col gap-4">{children}</div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" kind="primary" size="small" disabled={saving}>
          {saving ? "Wird gespeichert …" : "Speichern"}
        </Button>
        <Button
          type="button"
          kind="quiet"
          size="small"
          disabled={saving}
          onClick={(event) => {
            event.preventDefault();
            onCancel();
          }}
        >
          Abbrechen
        </Button>
      </div>
      {error ? <p className="mt-3 text-destructive">{error}</p> : null}
    </form>
  );
}
