import type { Metadata } from "next";
import WerkbereichTemplate from "../../werkbereiche/WerkbereichTemplate";

export const metadata: Metadata = { title: "VHC – Konglo Digital" };

export default function VhcPage() {
  return <WerkbereichTemplate kicker="Projekt" title="VHC" />;
}
