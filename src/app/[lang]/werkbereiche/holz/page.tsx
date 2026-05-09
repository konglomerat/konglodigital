import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Holz – Konglo Digital" };

const FAQS = [
  {
    q: "Brauche ich für jede Maschine eine eigene Einweisung?",
    a: "Ja – Tischkreissäge, Hobelmaschine und Standbohrmaschine haben jeweils eine eigene Einweisung. Bandschleifer und Handwerkzeuge laufen über die allgemeine Holz-Einweisung.",
  },
  {
    q: "Kann ich eigenes Holz mitbringen?",
    a: "Ja, solange es trocken und frei von Nägeln, Schrauben und Steinen ist. Beschichtete Spanplatten bitte vorher absprechen.",
  },
  {
    q: "Was passiert mit Verschnitt und Resten?",
    a: "Brauchbare Reste landen im Material-Regal und sind für alle frei nutzbar. Sägespäne in den Spänebehälter, der Rest in den Holzmüll.",
  },
];

export default function HolzPage() {
  return (
    <WerkbereichTemplate
      title="Holz"
      description="Voll ausgestattete Holzwerkstatt für Möbelbau, Reparaturen und kreative Projekte. Tischkreissäge, Bandschleifer, Hobelmaschine und Standbohrmaschine stehen nach Einweisung allen Mitgliedern zur Verfügung."
    >
      <TermineTile tag="holz" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
