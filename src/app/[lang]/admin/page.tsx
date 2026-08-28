import type { Metadata } from "next";

import RessortPage from "./RessortPage";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminRessortPage() {
  return (
    <RessortPage
      title="Admin"
      subTitle="Zugänge und Kontaktdaten der Mitglieder verwalten."
      links={[
        {
          href: "/admin/users",
          label: "Benutzer",
          description: "Zugänge, Rollen und Einladungen verwalten.",
        },
        {
          href: "/admin/contacts",
          label: "Mitglieder",
          description: "Campai-Kontakte einsehen und verknüpfen.",
        },
      ]}
    />
  );
}
