import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Buchdruck – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Pressen sind hier?",
    a: "Heidelberg-Tiegel und Boston-Tiegel für Auflagenarbeit, dazu eine Handpresse für Probedrucke und kleine Editionen.",
  },
  {
    q: "Welche Lettern stehen zur Verfügung?",
    a: "Bleisatz in mehreren Schriften und Größen, dazu Holzlettern für Plakate. Ablage nach Schriftkasten – bitte nach dem Druck zurücksortieren.",
  },
  {
    q: "Welches Papier eignet sich?",
    a: "Bütten, Hahnemühle und ähnliche, ab ca. 200 g/m². Eigenes Papier ausdrücklich willkommen, vorher kurz mit der Werkstattleitung abstimmen.",
  },
];

export default function BuchdruckPage() {
  return (
    <WerkbereichTemplate title="Buchdruck">
      <TermineTile tag="buchdruck" />
      <RessourcenTile tag="buchdruck" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
