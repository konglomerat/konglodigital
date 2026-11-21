import type { Metadata } from "next";

import AntraegeClient from "./AntraegeClient";

export const metadata: Metadata = {
  title: "Anträge Mitgliedschaft",
};

export const dynamic = "force-dynamic";

export default function VorstandAntraegePage() {
  return <AntraegeClient />;
}
