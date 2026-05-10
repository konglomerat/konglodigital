import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = {
  title: "Kunststoffschmiede – Konglo Digital",
};

const FAQS = [
  {
    q: "Welche Verfahren sind möglich?",
    a: "Extrusion, Pressen und Spritzguss mit Plasticpreneur-Maschinen. Schreddern eigener Reste vor Ort möglich.",
  },
  {
    q: "Welche Kunststoffe darf ich einbringen?",
    a: "HDPE, PP und LDPE sind freigegeben. PVC, PET und gemischte Kunststoffe sind nicht erlaubt – Trennung vorab nötig.",
  },
  {
    q: "Kann ich eigene Formen verwenden?",
    a: "Ja, Aluminium- und Stahlformen lassen sich direkt nutzen. Form-Design gerne in CAD vorbereiten und mit der Werkstattleitung abstimmen.",
  },
];

export default function KunststoffschmiedePage() {
  return (
    <WerkbereichTemplate title="Kunststoffschmiede">
      <TermineTile tag="kunststoffschmiede" />
      <RessourcenTile tag="kunststoffschmiede" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
