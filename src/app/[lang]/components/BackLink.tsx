"use client";

// Zurück-Taste, die – wenn gewünscht – dorthin zurückführt, wo man vorher in
// der App war (z. B. der Werkbereich, aus dem man „Neue Buchung“ geöffnet hat),
// statt immer auf ein festes Ziel. Kam man von außen oder per Neuladen auf die
// Seite, gibt es keinen App-Verlauf; dann greift das feste `href`.
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";

// Pfade, die in diesem Tab per Client-Navigation besucht wurden. Lebt nur im
// Speicher: Ein Neuladen setzt ihn zurück – genau dann könnte history.back()
// die App verlassen.
const visitedPaths: string[] = [];

function recordPath(pathname: string) {
  const last = visitedPaths[visitedPaths.length - 1];
  if (last === pathname) {
    return;
  }
  // Zurück auf den vorletzten Eintrag: als Rückschritt werten, nicht als neuen.
  if (visitedPaths[visitedPaths.length - 2] === pathname) {
    visitedPaths.pop();
    return;
  }
  visitedPaths.push(pathname);
}

// Einmal im Root-Layout eingebunden, damit jeder Seitenwechsel mitzählt.
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) {
      recordPath(pathname);
    }
  }, [pathname]);
  return null;
}

export default function BackLink({
  href,
  label,
  icon,
  preferHistory = false,
}: {
  href: string;
  label: ReactNode;
  icon?: IconProp;
  preferHistory?: boolean;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          !preferHistory ||
          visitedPaths.length < 2 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        router.back();
      }}
      className="inline-flex w-fit shrink-0 items-center gap-2 knglmrt-border bg-card px-3 py-2 text-sm font-bold text-foreground transition hover:bg-primary-soft sm:px-4"
    >
      <FontAwesomeIcon icon={icon ?? faArrowLeft} className="h-3.5 w-3.5" />
      {/* Neben der Überschrift ist auf dem Telefon nur Platz für den Pfeil. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Link>
  );
}
