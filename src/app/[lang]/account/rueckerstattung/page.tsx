// Rückerstattung aus Mitgliedersicht: dasselbe Formular wie in der
// Buchhaltung, aber ohne Kreditorensuche — Name und eigene IBAN statt dessen.
// Einreichen darf jedes angemeldete Mitglied, die Berechtigung prüft die API.
import type { Metadata } from "next";

import Button from "@/components/knglmrt/Button";
import PageTitle from "@/app/[lang]/components/PageTitle";
import {
  getServerMemberProfile,
  getServerSession,
} from "@/lib/server-session";

import ReimbursementForm from "../../receipts/reimbursement/ReimbursementForm";

export const metadata: Metadata = {
  title: "Rückerstattung einreichen",
};

export const dynamic = "force-dynamic";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export default async function MemberReimbursementPage() {
  const { user } = await getServerSession();

  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle
          backLink={{ href: "/account", label: "Zurück" }}
          title="Rückerstattung einreichen"
        />
        <section className="knglmrt-border bg-card p-[18px]">
          <h2 className="mb-1">Anmeldung erforderlich</h2>
          <p className="mb-4 text-muted-foreground">
            Bitte melde dich an, um eine Rückerstattung einzureichen.
          </p>
          <Button
            size="small"
            href="/login?redirectedFrom=/account/rueckerstattung"
            kind="primary"
          >
            Anmelden
          </Button>
        </section>
      </div>
    );
  }

  // Vorbelegt mit dem Namen aus dem Profil; die Kontoinhaber*in kann
  // trotzdem jemand anderes sein, deshalb bleibt das Feld editierbar.
  const metadata = user.user_metadata ?? {};
  const memberProfile = await getServerMemberProfile();
  const defaultName =
    text(memberProfile?.campaiName) ||
    text(metadata.campai_name) ||
    [text(metadata.first_name), text(metadata.last_name)]
      .filter(Boolean)
      .join(" ");

  return <ReimbursementForm mode="member" defaultName={defaultName} />;
}
