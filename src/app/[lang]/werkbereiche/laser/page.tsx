import type { Metadata } from "next";
import WerkbereichTemplate from "../WerkbereichTemplate";
import WichtigsteLinksTile from "../tiles/WichtigsteLinksTile";
import TermineTile from "../tiles/TermineTile";
import FaqTile from "../tiles/FaqTile";
import RessourcenTile from "../tiles/RessourcenTile";

export const metadata: Metadata = { title: "Laser – Konglo Digital" };

const FAQS = [
  {
    q: "Welche Materialien sind erlaubt?",
    a: "Holz, Acryl, Karton, Filz, Leder. Strikt verboten: PVC, ABS, alles Chlor- oder Bromhaltige – die Dämpfe greifen die Optik an.",
  },
  {
    q: "Wie groß darf das Werkstück maximal sein?",
    a: "Arbeitsfläche 600 × 300 mm. Größere Stücke nur außerhalb der offenen Werkstatt nach Absprache mit der Werkstattleitung.",
  },
  {
    q: "Welche Datei-Formate akzeptiert die Maschine?",
    a: "SVG oder DXF mit echten Vektoren. Schnittlinien rot (RGB 255 0 0), Gravur schwarz – Details im Laser-Wiki.",
  },
];

export default function LaserPage() {
  return (
    <WerkbereichTemplate title="Laser">
      <WichtigsteLinksTile />
      <TermineTile tag="laser" />
      <RessourcenTile tag="laser" featuredIds={[]} />
      <FaqTile faqs={FAQS} />
    </WerkbereichTemplate>
  );
}
