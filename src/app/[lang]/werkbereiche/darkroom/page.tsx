import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Darkroom – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Vergrößerer stehen zur Verfügung?",
    a: "Drei Vergrößerer für Kleinbild und Mittelformat. Großformat-Equipment auf Anfrage – nicht ständig aufgebaut.",
  },
  {
    q: "Welches Papier und welche Chemie nutzen wir?",
    a: "Standard: SW-Barytpapier und neutraler Entwickler. Eigenes Papier und eigene Chemie sind erlaubt; Schalen vorher gründlich spülen.",
  },
  {
    q: "Brauche ich Vorerfahrung in der Dunkelkammer?",
    a: "Nein. In der Anfänger-Einweisung gehen wir Filmentwicklung und das Vergrößern Schritt für Schritt durch.",
  },
];

export default function DarkroomPage() {
  return (
    <WerkbereichTemplate title="Darkroom">
      <TermineTile tag="darkroom" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
