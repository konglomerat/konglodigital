import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Beton – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Mischungen werden hier verarbeitet?",
    a: "Feinbeton, Architekturbeton und Gips. GFK und andere Verbundwerkstoffe nur nach Absprache mit der Werkstattleitung.",
  },
  {
    q: "Wie lange dauert das Aushärten?",
    a: "24 – 48 Stunden für entformfähig, volle Festigkeit nach ca. 28 Tagen. Werkstücke bitte beschriften und in der Trockenzone lagern.",
  },
  {
    q: "Wo baue ich die Schalung?",
    a: "Holzschalungen entstehen am besten in der Holzwerkstatt. Silikonformen können im Beton-Bereich direkt gegossen werden.",
  },
];

export default function BetonPage() {
  return (
    <WerkbereichTemplate title="Beton">
      <TermineTile tag="beton" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
