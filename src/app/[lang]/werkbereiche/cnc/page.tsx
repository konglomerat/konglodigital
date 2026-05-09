import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import WichtigsteLinksTile from "../tiles/WichtigsteLinksTile";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "CNC – Konglo Digital" };

const FAQS = [
  {
    q: "Mit welcher Software erzeuge ich den G-Code?",
    a: "Empfohlen sind Fusion 360 (für 3D) und VCarve / Carbide Create (für 2.5D). Lizenzen liegen am Werkstattrechner; für eigene Projekte nutzbar.",
  },
  {
    q: "Welche Werkstückgrößen passen?",
    a: "Maximaler Verfahrweg 1200 × 800 × 100 mm. Spannmittel und Opferplatte vor Ort, eigene erlaubt.",
  },
  {
    q: "Welche Materialien lassen sich fräsen?",
    a: "Holz, MDF, Multiplex, Aluminium und Kunststoffe. Für Stahl bitte Werkstattleitung ansprechen – andere Vorschubwerte nötig.",
  },
];

export default function CncPage() {
  return (
    <WerkbereichTemplate title="CNC">
      <WichtigsteLinksTile />
      <TermineTile tag="cnc" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
