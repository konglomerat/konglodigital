import { redirect } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCartShopping,
  faChartPie,
  faFolderOpen,
  faKey,
  faLayerGroup,
  faPrint,
  faTableList,
  faCube,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import PageWrapper from "../components/PageWrapper";
import PageTitle from "../components/PageTitle";

type MemberLink = {
  href: string;
  title: string;
  description: string;
  icon: IconProp;
};

const memberLinks: MemberLink[] = [
  {
    href: "/printers",
    title: "3D-Druck",
    description: "Druckjobs starten und verwalten",
    icon: faCube,
  },
  {
    href: "/printers/emptying",
    title: "Drucker entleeren",
    description: "Filament wechseln und Drucker leeren",
    icon: faPrint,
  },
  {
    href: "/printers/access-codes",
    title: "Drucker Zugangscodes",
    description: "Zugangscodes für 3D-Drucker einsehen",
    icon: faKey,
  },
  {
    href: "/checkout",
    title: "Warenkorb",
    description: "Offene Druckjobs und Produkte abrechnen",
    icon: faCartShopping,
  },
  {
    href: "/materialbestellung",
    title: "Materialbestellung",
    description: "Material für Projekte bestellen",
    icon: faLayerGroup,
  },
  {
    href: "/meine-buchungen",
    title: "Meine Buchungen",
    description: "Belege und Ausgaben verwalten",
    icon: faFolderOpen,
  },
  {
    href: "/budget",
    title: "Budget Werkbereiche",
    description: "Budgetübersicht der Werkbereiche",
    icon: faChartPie,
  },
  {
    href: "/balance",
    title: "Balance",
    description: "Kontostand und Transaktionen einsehen",
    icon: faTableList,
  },
  {
    href: "/account",
    title: "Profil",
    description: "Eigenes Profil und Einstellungen",
    icon: faUser,
  },
];

export default async function MitgliederPage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?redirectedFrom=/mitglieder");
  }

  return (
    <PageWrapper>
      <PageTitle title="Mitglieder-Bereich" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {memberLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
              <FontAwesomeIcon icon={link.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                {link.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {link.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}
