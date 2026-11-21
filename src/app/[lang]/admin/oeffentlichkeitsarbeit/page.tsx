import type { Metadata } from "next";

import AccessGuard from "../AccessGuard";
import RessortPage from "../RessortPage";
import { getRessort } from "../ressorts";

export const metadata: Metadata = {
  title: "Öffentlichkeitsarbeit",
};

export default function OeffentlichkeitsarbeitRessortPage() {
  return (
    <AccessGuard check={getRessort("oeffentlichkeitsarbeit").canOpen}>
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
    </AccessGuard>
  );
}
