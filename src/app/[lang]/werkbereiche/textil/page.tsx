import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Textil – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Maschinen sind verfügbar?",
    a: "Pfaff Quilt 4.0, Bernina 720, Industrie-Overlock und eine Stickmaschine. Bügelstation und Zuschneidetisch im Vorraum.",
  },
  {
    q: "Bekomme ich Garn vor Ort?",
    a: "Standardgarn in vielen Farben ist da. Spezialgarne, Knöpfe und besonderes Zubehör bitte selbst mitbringen.",
  },
  {
    q: "Gibt es Schnittmuster zum Mitnehmen?",
    a: "Ja, eine Sammlung an Standardschnitten liegt im Schrank. Eigene Schnitte können direkt am Tisch ausgelegt werden.",
  },
];

export default function TextilPage() {
  return (
    <WerkbereichTemplate title="Textil">
      <TermineTile tag="textil" />
      <RessourcenTile tag="textil" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
