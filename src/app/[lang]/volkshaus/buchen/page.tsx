import type { Metadata } from "next";

import BookingWizard from "./BookingWizard";

export const metadata: Metadata = {
  title: "Raum im Volkshaus Cotta anfragen",
  description:
    "Räume, Termin und Ausstattung wählen, Preis berechnen und eine Nutzungsanfrage an das Neue Volkshaus Cotta senden.",
};

const getInitialDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const tomorrow = new Date(
    Date.UTC(values.year, values.month - 1, values.day + 1),
  );
  return tomorrow.toISOString().slice(0, 10);
};

export default function VolkshausBookingPage() {
  return <BookingWizard initialDate={getInitialDate()} />;
}
