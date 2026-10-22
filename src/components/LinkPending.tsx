"use client";

// Rückmeldung, solange ein angeklickter <Link> auf die neue Seite wartet.
// useLinkStatus liest den nächsten <Link> darüber — diese Bausteine müssen
// also *innerhalb* eines Links stehen. Außerhalb melden sie nie "pending".
import { useLinkStatus } from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";

export const useLinkPending = () => useLinkStatus().pending;

/**
 * Zeigt `fallback` (meist das Icon der Taste) und tauscht es gegen einen
 * Spinner, solange der Link lädt.
 */
export function LinkPendingSpinner({
  fallback = null,
  className = "h-4 w-4",
}: {
  fallback?: ReactNode;
  className?: string;
}) {
  const pending = useLinkPending();
  if (!pending) return <>{fallback}</>;
  return (
    <FontAwesomeIcon
      icon={faSpinner}
      aria-hidden="true"
      className={`${className} animate-spin`}
    />
  );
}

/**
 * Schleier mit Spinner über einem großen Kartenlink, solange er lädt. Der
 * Link braucht `relative`.
 */
export function LinkPendingOverlay() {
  const pending = useLinkPending();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/60"
    >
      <FontAwesomeIcon
        icon={faSpinner}
        className="h-6 w-6 animate-spin text-primary"
      />
    </span>
  );
}
