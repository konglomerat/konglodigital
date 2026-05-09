import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Metall – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Verfahren stehen zur Verfügung?",
    a: "Schweißen (MAG und WIG), Drehen, Fräsen, Trennen und Biegen. Plasmaschneiden auf Anfrage.",
  },
  {
    q: "Wie ist es mit Schutzkleidung?",
    a: "Schweißschirm, Lederschürze und Handschuhe sind vor Ort. Eigene Sicherheitsschuhe und feste Kleidung sind Pflicht.",
  },
  {
    q: "Wo bekomme ich Material?",
    a: "Reststücke im Lager sind frei nutzbar. Größere Mengen werden gemeinsam bestellt – Eintrag in die Bestellliste an der Tafel.",
  },
];

export default function MetallPage() {
  return (
    <WerkbereichTemplate title="Metall">
      <TermineTile tag="metall" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
