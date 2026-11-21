// src/app/[lang]/components/PageSkeleton.tsx — Bausteine für die
// loading.tsx-Skelette. Nach einem Klick ersetzt das Skelett sofort den
// Inhaltsbereich (Kopf und Fuß bleiben stehen), bis die neue Seite da ist.
// Höhen folgen der Typoskala (--ui-line-*), damit nichts springt.
import type { ReactNode } from "react";

/** Grauer Platzhalter-Balken; Breite und Höhe kommen per className. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <span className={`block bg-muted ${className}`} />;
}

/** Seitentitel samt Unterzeile, wie PageTitle. */
export function SkeletonTitle({ withSubTitle = true }: { withSubTitle?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <SkeletonBar className="h-[var(--ui-line-title)] w-[min(420px,80%)]" />
      {withSubTitle ? (
        <SkeletonBar className="mt-2 h-[var(--ui-line-body)] w-[min(560px,95%)]" />
      ) : null}
    </div>
  );
}

/** Ein paar Textzeilen, die letzte kürzer. */
export function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex max-w-[600px] flex-col gap-2">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBar
          key={index}
          className={`h-[var(--ui-size-body)] ${index === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Kartenraster, etwa für Beiträge oder Termine. */
export function SkeletonCards({
  count = 6,
  className = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`grid gap-5 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="knglmrt-border bg-card">
          <SkeletonBar className="aspect-[4/3] w-full" />
          <div className="flex flex-col gap-2 p-4">
            <SkeletonBar className="h-[var(--ui-line-card)] w-3/4" />
            <SkeletonBar className="h-[var(--ui-size-body)] w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Rahmen jedes Skeletts: pulsiert, ist für Screenreader eine Statusmeldung
 * und blendet mit kurzer Verzögerung ein.
 */
export function PageSkeleton({
  children,
  label = "Seite wird geladen.",
}: {
  children?: ReactNode;
  label?: string;
}) {
  return (
    <div role="status" className="knglmrt-skeleton-in">
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-8">
        {children ?? (
          <>
            <SkeletonTitle />
            <SkeletonParagraph lines={4} />
            <SkeletonCards count={3} />
          </>
        )}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
