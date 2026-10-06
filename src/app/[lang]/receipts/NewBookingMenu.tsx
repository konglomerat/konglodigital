"use client";

// Alle Wege zum Buchen hinter einer Taste, nach Anlass gruppiert.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";

const BOOKING_GROUPS = [
  {
    label: "Beleg erfassen",
    links: [
      {
        href: "/receipts/income",
        label: "Einnahme erfassen",
        description: "Zuschüsse, Fördergelder, Bareinnahmen",
      },
      {
        href: "/receipts/expense",
        label: "Ausgabe erfassen",
        description: "Beleg für eine Ausgabe hinzufügen",
      },
      {
        href: "/receipts/eigenbeleg",
        label: "Eigenbeleg",
        description: "Wenn es keinen Originalbeleg gibt",
      },
    ],
  },
  {
    label: "Rechnungen",
    links: [
      {
        href: "/receipts/invoice",
        label: "Rechnung erstellen",
        description: "Neue Rechnung direkt anlegen",
      },
      {
        href: "/receipts/pretix-import",
        label: "pretix-Import",
        description: "Rechnungen aus pretix-Bestellungen erzeugen",
      },
    ],
  },
  {
    label: "Für Mitglieder",
    links: [
      {
        href: "/receipts/reimbursement",
        label: "Rückerstattung",
        description: "Auslagen zur Erstattung einreichen",
      },
    ],
  },
];

export default function NewBookingMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <Button
        kind="emphasis"
        size="large"
        className="whitespace-nowrap"
        icon={faPlus}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="new-booking-menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        {/* Auf dem Telefon reicht „Buchung" — die Taste soll neben der
            Brotkrume Platz finden. */}
        <span className="hidden sm:inline">Neue </span>Buchung
      </Button>

      {isOpen ? (
        <div
          id="new-booking-menu"
          className="absolute right-0 top-full z-30 mt-2 w-[min(380px,calc(100vw-2rem))] border border-primary bg-popover text-popover-foreground"
        >
          {BOOKING_GROUPS.map((group, index) => (
            <div
              key={group.label}
              className={`flex flex-col pb-2 pt-3 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <p className="knglmrt-label px-5 pb-1 text-muted-foreground">
                {group.label}
              </p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="flex flex-col px-5 py-2 transition hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none"
                >
                  <span className="font-bold text-foreground">{link.label}</span>
                  <span className="text-muted-foreground">{link.description}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
