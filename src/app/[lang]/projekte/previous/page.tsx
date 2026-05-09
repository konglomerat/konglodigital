import type { Metadata } from "next";
import WerkbereichTemplate from "../../werkbereiche/WerkbereichTemplate";

export const metadata: Metadata = {
  title: "Previous Projects – Konglo Digital",
};

export default function PreviousProjectsPage() {
  return <WerkbereichTemplate kicker="Projekt" title="Previous Projects" />;
}
