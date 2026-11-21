import type { Metadata } from "next";

import { getServerAccess } from "@/lib/server-session";

import AccessGuard from "./AccessGuard";
import RessortPage from "./RessortPage";
import { getRessort } from "./ressorts";

export const metadata: Metadata = {
  title: "Admin",
};

const LINKS = [
  {
    href: "/admin/users",
    label: "Benutzer",
    description: "Zugänge, Einladungen, Rollen und Campai-Verknüpfung.",
  },
  {
    href: "/admin/contacts",
    label: "Mitglieder",
    description: "Campai-Kontakte einsehen und verknüpfen.",
  },
];

export default async function AdminRessortPage() {
  const ressort = getRessort("admin");
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
        title="Admin"
        subTitle="Zugänge, Rollen und Kontaktdaten der Mitglieder verwalten."
        links={links}
      />
    </AccessGuard>
  );
}
