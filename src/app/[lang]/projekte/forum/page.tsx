import type { Metadata } from "next";
import WerkbereichTemplate from "../../werkbereiche/WerkbereichTemplate";

export const metadata: Metadata = { title: "FOR:UM – Konglo Digital" };

export default function ForumPage() {
  return <WerkbereichTemplate kicker="Projekt" title="FOR:UM" />;
}
