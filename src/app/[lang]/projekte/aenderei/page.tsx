import type { Metadata } from "next";
import WerkbereichTemplate from "../../werkbereiche/WerkbereichTemplate";

export const metadata: Metadata = { title: "Änderei – Konglo Digital" };

export default function AendereiPage() {
  return <WerkbereichTemplate kicker="Projekt" title="Änderei" />;
}
