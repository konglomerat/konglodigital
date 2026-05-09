import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import WichtigsteLinksTile from "../tiles/WichtigsteLinksTile";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "3D Druck – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Filamente und Harze stehen zur Verfügung?",
    a: "PLA und PETG in Standardfarben sind im Materialshop vorrätig. Resin und Spezialfilamente nach Absprache mit der Werkstattleitung.",
  },
  {
    q: "Wie wird die Druckzeit berechnet?",
    a: "Slicer-Schätzung gilt als Richtwert. Abgerechnet wird tatsächliches Materialgewicht plus Maschinenzeit – Preise im Wiki.",
  },
  {
    q: "Kann ich Drucke über Nacht laufen lassen?",
    a: "Ja, sofern der Drucker eingewiesen und das Modell vorher erfolgreich getestet ist. Lange Drucke bitte vorab im Druck-Channel ankündigen.",
  },
];

export default function DreidruckPage() {
  return (
    <WerkbereichTemplate title="3D Druck">
      <WichtigsteLinksTile />
      <TermineTile tag="3d-druck" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
