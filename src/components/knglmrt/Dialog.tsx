"use client";

// Portiert aus knglmrt/components/ui/Dialog.jsx.
// Eine Entscheidung, gerahmt: pinke Kappe mit der Frage in getrackten
// Versalien, darunter ein Satz Konsequenz und die zwei Tasten.
//
// Der 3px-Offset-Schatten ist der eine Schatten der Ansicht — steht dahinter
// eine Taste mit kind="emphasis", nimm ihr die Betonung, solange der Dialog
// offen ist.
//
// Zwei Abweichungen vom Export:
//   · Die Abbrechen-Taste ist keine unterstrichene Textzeile mehr, sondern die
//     normale secondary-Taste. Pink bleibt so allein bei der Bestätigung.
//   · Der Dialog ist ein echter Modal: Portal auf <body>, Escape, Klick auf den
//     Hintergrund, Fokus wandert in den Rahmen und danach zurück. Der Export
//     war nur die Attrappe dafür.
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import Button from "@/components/knglmrt/Button";

/** Der Client-Check hat nichts zu abonnieren — der Wert ändert sich nie. */
function subscribeToNothing() {
  return () => {};
}

export type DialogProps = {
  open: boolean;
  /** Die Frage. Steht in der pinken Kappe. */
  title: string;
  /** Der Satz darunter. Alternativ `children` für mehr als einen Satz. */
  text?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  /** Abbrechen, Escape, Klick auf den Hintergrund — alles landet hier. */
  onCancel: () => void;
  /** Löschen und Verwerfen: die Bestätigung wird zur Danger-Taste. */
  tone?: "normal" | "danger";
  /** Breite des Rahmens. Standard 420px. */
  width?: number | string;
  /** Zeigt keine Tasten — für Dialoge, die ihre Handlung selbst mitbringen. */
  actions?: ReactNode;
};

/**
 * Der Rahmen ohne Hintergrund. Für den Musterbogen und für Fälle, in denen die
 * Seite den Rahmen selbst platziert.
 */
export function DialogPanel({
  title,
  text,
  children,
  footer,
  width = 420,
  titleId,
  className,
  ref,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  titleId?: string;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      style={{ width, maxWidth: "100%" }}
      className={`knglmrt-border knglmrt-emphasis-shadow bg-card outline-none${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="knglmrt-border-b bg-primary-soft px-5 py-2.5">
        <h2 id={titleId} className="knglmrt-caption text-primary">
          {title}
        </h2>
      </div>
      <div className="flex flex-col gap-3.5 px-5 pb-4 pt-4">
        {text ? <p>{text}</p> : null}
        {children}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export default function Dialog({
  open,
  title,
  text,
  children,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
  tone = "normal",
  width,
  actions,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // createPortal braucht das document — auf dem Server gibt es keins. Der
  // Store liefert beim Server-Rendern false und danach true, ohne dass ein
  // Effekt State setzen muss.
  const onClient = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      // Tab bleibt im Rahmen: ein Modal, aus dem der Fokus hinausläuft, ist
      // für Tastatur und Screenreader keins.
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onCancel]);

  if (!open || !onClient) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // Der Hintergrund ist die stille Fläche des Systems, kein schwarzer Schleier.
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--muted)_92%,transparent)] p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <DialogPanel
        ref={panelRef}
        titleId={titleId}
        title={title}
        text={text}
        width={width}
        footer={
          actions ?? (
            <>
              <Button kind="secondary" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                kind={tone === "danger" ? "danger-primary" : "primary"}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </>
          )
        }
      >
        {children}
      </DialogPanel>
    </div>,
    document.body,
  );
}
