import type { Metadata } from "next";

import RessortPage from "../RessortPage";

export const metadata: Metadata = {
  title: "Vorstand",
};

export default function VorstandRessortPage() {
  return (
    <RessortPage
      title="Vorstand"
      subTitle="Finanzüberblick und Vorgänge des Vorstands."
      links={[
        {
          href: "/kofi",
          label: "KoFi",
          description: "Kosten und Finanzen nach Monat, Quartal und Jahr.",
        },
        {
          label: "Anträge",
          description: "Anträge an den Vorstand einreichen und bearbeiten.",
          comingSoon: true,
        },
      ]}
    />
  );
}
