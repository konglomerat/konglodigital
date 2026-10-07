import type { Metadata } from "next";

import { getServerAccess } from "@/lib/server-session";

import AccessGuard from "../AccessGuard";
import RessortPage from "../RessortPage";
import { getRessort } from "../ressorts";

export const metadata: Metadata = {
  title: "Vorstand",
};

const LINKS = [
  {
    href: "/kofi",
    label: "KoFi",
    description: "Kosten und Finanzen nach Monat, Quartal und Jahr.",
  },
  {
    href: "/admin/vorstand/ehrenamtsbonus",
    label: "Anträge Ehrenamtsbonus",
    description:
      "Ehrenamtliche Arbeit prüfen und Zugangstage für das Folgequartal gewähren.",
  },
];

export default async function VorstandRessortPage() {
  const ressort = getRessort("vorstand");
  const access = await getServerAccess();
  // Nur Kacheln, die sich auch öffnen lassen.
  const links = LINKS.filter((link) =>
    (ressort.children ?? []).some(
      (child) => child.href === link.href && child.canOpen(access),
    ),
  );

  return (
    <AccessGuard check={ressort.canOpen}>
      <RessortPage
        title="Vorstand"
        subTitle="Finanzüberblick und Vorgänge des Vorstands."
        links={links}
      />
    </AccessGuard>
  );
}
