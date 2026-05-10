import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Elektronik – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Geräte stehen zur Verfügung?",
    a: "Lötplätze mit Heißluft, Multimeter, Oszilloskop, regelbare Netzgeräte und Lupen. Programmiergeräte für gängige Mikrocontroller im Schrank.",
  },
  {
    q: "Bauteile vor Ort?",
    a: "Standard-Widerstände, Kondensatoren und LEDs liegen im offenen Sortiment. Spezielle Bauteile bitte selbst mitbringen oder über die Sammelbestellung ordern.",
  },
  {
    q: "Brauche ich Vorerfahrung zum Löten?",
    a: "Nein – die Anfänger-Einweisung deckt sicheres Löten und Bauteilkunde ab. Reicht für Steckplatinen und einfache Reparaturen.",
  },
];

export default function ElektronikPage() {
  return (
    <WerkbereichTemplate title="Elektronik">
      <TermineTile tag="elektronik" />
      <RessourcenTile tag="elektronik" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
