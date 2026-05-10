import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import ProjectsTile from "../tiles/ProjectsTile";
import RessourcenTile from "../tiles/RessourcenTile";

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
      tools={[
        { label: "Materialbestellung buchen", href: "/split-invoice" },
        { label: "Auslagen rückerstatten", href: "/receipts/reimbursement" },
        { label: "Lagerplatz mieten", disabled: true },
      ]}
    >
      <TermineTile tag="holz" />
      <RessourcenTile
        tag="holz"
        featuredIds={[
          "328454ed-e117-42d3-8e51-82b99672299b",
          "53c2ea7b-d267-4a47-ac06-63ff611d5f21",
          "a7de4288-2406-482e-8775-c5b925c41cf0",
        ]}
      />
      <ProjectsTile workshopResourceId="ea40515b-22d2-45f5-bd1b-f4c70e1b8563" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
