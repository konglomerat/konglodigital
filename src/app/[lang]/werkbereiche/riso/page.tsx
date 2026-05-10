import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Riso – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Farben gibt es?",
    a: "Acht Standardfarben, darunter Fluoro Pink und Federal Blue. Pro Druckgang eine Farbe – Mehrfarbendruck heißt mehrfach durch die Maschine.",
  },
  {
    q: "Welches Papier funktioniert?",
    a: "Naturpapier 80 – 160 g/m², kein gestrichenes oder beschichtetes. Recyclingpapier läuft sehr gut.",
  },
  {
    q: "Lohnt sich Riso bei kleinen Auflagen?",
    a: "Ab ca. 20 Stück wird's wirtschaftlich. Darunter eher Digitaldruck im Printshop nutzen.",
  },
];

export default function RisoPage() {
  return (
    <WerkbereichTemplate title="Riso">
      <TermineTile tag="riso" />
      <RessourcenTile tag="riso" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
