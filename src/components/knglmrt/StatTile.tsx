// Portiert aus knglmrt/components/ui/StatTile.jsx.
// Eine Zahl, ein Label, optional ein Balken. Die Zahl läuft in Fira Mono.
import type { ReactNode } from "react";

/** Abschnitt eines gestapelten Balkens — Anteile in Prozent des Tracks. */
export type StatTileSegment = {
  percent: number;
  /** Flächenfarbe; ohne Angabe die Primärfarbe. */
  className?: string;
};

type StatTileProps = {
  label: ReactNode;
  value: string;
  hint?: ReactNode;
  /** 0–100. Nur gesetzt, wenn es wirklich einen Verbrauch gibt. */
  percent?: number;
  /** Gestapelter Balken statt einer einzelnen Füllung. */
  segments?: StatTileSegment[];
  tone?: "weiss" | "grau" | "rosa";
  /** Zusatzinhalt unter dem Balken, z. B. eine Legende. */
  children?: ReactNode;
  /** Abgesetzte Zeile ganz unten — steht unter dem Hinweis. */
  footer?: ReactNode;
  /** Macht die Kachel zum Schalter — dann zählt auch `selected`. */
  onClick?: () => void;
  selected?: boolean;
  valueClassName?: string;
  className?: string;
};

const TONE_SURFACE: Record<NonNullable<StatTileProps["tone"]>, string> = {
  weiss: "bg-card knglmrt-border",
  grau: "bg-muted",
  rosa: "bg-primary-soft",
};

export default function StatTile({
  label,
  value,
  hint,
  percent,
  segments,
  tone = "weiss",
  children,
  footer,
  onClick,
  selected,
  valueClassName,
  className,
}: StatTileProps) {
  const isRosa = tone === "rosa";
  const bar = Math.max(0, Math.min(100, percent ?? 0));
  const mutedText = isRosa
    ? "text-[var(--knglmrt-brown-100)]"
    : "text-muted-foreground";

  const surface = `flex flex-col gap-[5px] px-[18px] py-4 ${TONE_SURFACE[tone]}${
    className ? ` ${className}` : ""
  }`;

  const body = (
    <>
      <span className={`knglmrt-caption ${mutedText}`}>{label}</span>
      <span
        className={`knglmrt-value whitespace-nowrap ${
          valueClassName ?? (isRosa ? "text-primary" : "text-foreground")
        }`}
      >
        {value}
      </span>
      {segments && segments.length > 0 ? (
        <span className="flex h-3 overflow-hidden bg-muted">
          {segments.map((segment, index) => (
            <span
              key={index}
              className={`block h-3 ${segment.className ?? "bg-primary"}`}
              style={{
                width: `${Math.max(0, Math.min(100, segment.percent))}%`,
              }}
            />
          ))}
        </span>
      ) : percent === undefined ? null : (
        <span className="block h-3 bg-muted">
          <span className="block h-3 bg-primary" style={{ width: `${bar}%` }} />
        </span>
      )}
      {children}
      {hint ? (
        <span className={`knglmrt-num whitespace-nowrap ${mutedText}`}>
          {hint}
        </span>
      ) : null}
      {footer ? (
        <span className={`mt-1.5 border-t border-border pt-1.5 ${mutedText}`}>
          {footer}
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className={surface}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${surface} text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2${
        isRosa ? "" : " hover:bg-primary-soft"
      }`}
    >
      {body}
    </button>
  );
}
