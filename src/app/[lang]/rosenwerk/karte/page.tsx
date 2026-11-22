import type { Metadata } from "next";
import { loadMapInventory } from "@/lib/rosenwerk/data";
import MapExplorer from "./MapExplorer";
export const metadata: Metadata = {
  title: "Rosenwerk entdecken · Gelände & Werkstätten",
  description:
    "Die interaktive 3D-Karte des Rosenwerks: Gelände, Werkstätten, Inventar und KuSS-Container am Jagdweg in Dresden.",
};
export default async function RosenwerkMapPage() {
  const data = await loadMapInventory();
  return <MapExplorer {...data} />;
}
