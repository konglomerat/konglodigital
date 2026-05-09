import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";

export const metadata: Metadata = { title: "Neuweltbib – Konglo Digital" };

const FAQS = [
  {
    q: "Worum geht es in der Neuweltbib?",
    a: "Eine kuratierte Bibliothek mit Schwerpunkt Material, Making und neue Welten. Bücher zu Handwerk, Design, Theorie und Utopien.",
  },
  {
    q: "Kann ich Bücher ausleihen?",
    a: "Mitglieder dürfen ausleihen, Eintrag in die Liste am Eingang reicht. Gäste lesen vor Ort.",
  },
  {
    q: "Wann hat die Bib geöffnet?",
    a: "Während der offenen Werkstattzeiten zugänglich. Stille-Zonen sind als solche markiert.",
  },
];

export default function NeuweltbibPage() {
  return (
    <WerkbereichTemplate title="Neuweltbib">
      <TermineTile tag="neuweltbib" />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
