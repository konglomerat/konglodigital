// src/app/[lang]/verein/page.tsx — Einstieg in den Vereinsbereich.
// Kartenraster auf die bestehenden Routen, Muster wie /werkbereiche.
import Link from "next/link";

import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";

type VereinLink = {
  href: string;
  title: string;
  description: string;
  external?: boolean;
};

const VEREIN_LINKS: VereinLink[] = [
  {
    href: "/calendar",
    title: "Kalender",
    description:
      "Offene Werkstatt, Workshops, Plenum und Belegungen — alle Termine im Haus.",
  },
  {
    href: "/volkshaus/buchen",
    title: "Volkshaus buchen",
    description:
      "Räume für Veranstaltungen anfragen — auch für Gruppen von außerhalb.",
  },
  {
    href: "/monatsbeitrag",
    title: "Mitgliedschaft & Beitrag",
    description:
      "Beitragsstufe einsehen und anpassen, Zahlungsweise ändern.",
  },
  {
    href: "/projects",
    title: "Projekte",
    description:
      "Vereins- und Mitgliedsprojekte, an denen gerade gebaut wird.",
  },
  {
    href: "/werkbereiche",
    title: "Werkbereiche",
    description:
      "Alle Werkstätten mit Maschinen, Ressourcen und Einweisungen.",
  },
  {
    href: "https://konglomerat.org",
    title: "Über uns",
    description:
      "Selbstverständnis, Satzung, Vorstand und Jahresberichte auf konglomerat.org.",
    external: true,
  },
];

export default function VereinPage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Verein" }]} />
      <h1 className="mb-2.5">Verein</h1>
      <p className="knglmrt-lead mb-6 max-w-[620px]">
        Wer wir sind, wie du mitmachst und was demnächst im Haus passiert.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {VEREIN_LINKS.map((link) => {
          const className =
            "flex flex-col gap-1.5 border border-foreground bg-card p-[18px] transition hover:bg-primary-soft";
          const content = (
            <>
              <span className="knglmrt-card-title">{link.title}</span>
              <span className="text-muted-foreground">{link.description}</span>
            </>
          );

          return link.external ? (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={className}
            >
              {content}
            </a>
          ) : (
            <Link key={link.href} href={link.href} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
