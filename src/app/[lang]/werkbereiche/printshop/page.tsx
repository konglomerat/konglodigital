import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Printshop – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Druckverfahren bietet der Printshop?",
    a: "Digitaldruck (Toner und Inkjet), Risograph und kleinere Offset-Aufträge auf Anfrage. Für Buchdruck und Siebdruck siehe die jeweiligen Werkbereiche.",
  },
  {
    q: "In welchem Format soll ich Dateien anliefern?",
    a: "PDF/X-1a oder PDF/X-4, 300 dpi, mit 3 mm Beschnitt. Schriften eingebettet, Sonderfarben als Volltonkanal benannt.",
  },
  {
    q: "Wie schnell bekomme ich kleine Auflagen?",
    a: "Same-Day für Auflagen bis 50 Stück, sofern die Datei druckfertig ist. Ansonsten 1 – 3 Werkstatt-Tage.",
  },
];

export default function PrintshopPage() {
  return (
    <WerkbereichTemplate title="Printshop">
      <TermineTile tag="printshop" />
      <RessourcenTile tag="printshop" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
