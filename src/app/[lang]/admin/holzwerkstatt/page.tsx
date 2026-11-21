import type { Metadata } from "next";

import AccessGuard from "../AccessGuard";
import RessortPage from "../RessortPage";
import { getRessort } from "../ressorts";

export const metadata: Metadata = {
  title: "Holzwerkstatt",
};

export default function HolzwerkstattRessortPage() {
  return (
    <AccessGuard check={getRessort("holzwerkstatt").canOpen}>
      <RessortPage
        title="Holzwerkstatt"
        subTitle="Verwaltung der Holzwerkstatt."
        links={[
          {
            href: "/split-invoice",
            label: "Sammelbestellungen aufteilen",
            description:
              "Eine Lieferantenrechnung auf die Mitbesteller aufteilen und als Rechnungen in Campai buchen.",
          },
        ]}
      />
    </AccessGuard>
  );
}
