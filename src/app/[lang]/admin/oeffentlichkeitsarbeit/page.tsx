import type { Metadata } from "next";

import RessortPage from "../RessortPage";

export const metadata: Metadata = {
  title: "Öffentlichkeitsarbeit",
};

export default function OeffentlichkeitsarbeitRessortPage() {
  return (
    <RessortPage
      title="Öffentlichkeitsarbeit"
      subTitle="Inhalte für Newsletter und Storys zusammenstellen."
      links={[
        {
          href: "/admin/generate-newsletter",
          label: "Newsletter erzeugen",
          description: "Beiträge auswählen und den Versand vorbereiten.",
        },
        {
          href: "/admin/generate-story",
          label: "Storys erzeugen",
          description: "Story-Entwürfe aus Beiträgen erstellen.",
        },
      ]}
    />
  );
}
