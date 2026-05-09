import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = {
  title: "Materialvermittlung – Konglo Digital",
};

const FAQS = [
  {
    q: "Was wird hier vermittelt?",
    a: "Reststücke, Spenden und Tauschangebote aus allen Werkbereichen. Schwerpunkt Holz, Metall, Kunststoff und Textil.",
  },
  {
    q: "Wer darf Material abholen?",
    a: "Mitglieder bedienen sich frei. Gäste fragen einmal kurz bei der Werkstattleitung.",
  },
  {
    q: "Wie funktioniert die Abgabe von eigenem Material?",
    a: "Während der Sprechstunde direkt vorbeibringen oder vorher per Mail anfragen. Klein und sortenrein hilft uns enorm.",
  },
];

export default function MaterialvermittlungPage() {
  return (
    <WerkbereichTemplate title="Materialvermittlung">
      <TermineTile tag="materialvermittlung" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
