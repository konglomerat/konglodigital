import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Siebdruck – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Rahmengrößen sind im Bestand?",
    a: "Standardrahmen in A4, A3 und A2. Größere Rahmen können auf Anfrage gespannt werden.",
  },
  {
    q: "Welche Farben dürfen wo verwendet werden?",
    a: "Plastisol-Farbe für Textil, wasserbasierte Farbe für Papier und Karton. Bitte Werkzeug und Sieb nach jeder Farbe gründlich auswaschen.",
  },
  {
    q: "Kann ich eigene T-Shirts mitbringen?",
    a: "Ja. Stoff sollte vorgewaschen sein, sonst kann der Druck nach der ersten Wäsche reißen.",
  },
];

export default function SiebdruckPage() {
  return (
    <WerkbereichTemplate title="Siebdruck">
      <TermineTile tag="siebdruck" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
