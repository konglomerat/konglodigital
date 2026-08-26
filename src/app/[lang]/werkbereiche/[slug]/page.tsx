// src/app/[lang]/werkbereiche/[slug]/page.tsx — Subpage nach beschlossener
// Struktur (Variante 1c): Einleitung → Projekte & News → Ressourcen →
// Budget & Barkasse → Einweisungen → FAQ, rechts die Self-Service-Spalte.
// Wo noch kein Endpoint hängt, steht ein Leerzustand — keine erfundenen Daten.
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";
import Button from "../../components/Button";
import Notice from "@/components/knglmrt/Notice";
import { findWerkbereich } from "@/lib/werkbereiche";
import { getUserRoles } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import WerkbereichMark from "../../components/WerkbereichMark";
import WerkbereichFinanzen from "../WerkbereichFinanzen";

// Übergangsweise: die bestehenden Self-Service-Routen hängen hier fachlich,
// bleiben aber unter ihrer alten URL erreichbar.
const SELF_SERVICE: Record<
  string,
  { href: string; label: string; hint: string }[]
> = {
  "3d-druck": [
    {
      href: "/printers",
      label: "Drucker & Druckjobs",
      hint: "Auftrag anlegen und abrechnen",
    },
    {
      href: "/printers/emptying",
      label: "Drucker entleeren",
      hint: "Bauraum freimelden",
    },
    {
      href: "/printers/access-codes",
      label: "Drucker-Zugang",
      hint: "Zugangscode abrufen",
    },
  ],
  holz: [
    {
      href: "/split-invoice",
      label: "Materialbestellung",
      hint: "Sammelbestellung anlegen und aufteilen",
    },
  ],
};

export default async function WerkbereichPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const werkbereich = findWerkbereich(slug);
  if (!werkbereich) notFound();

  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);
  const userRoles = await getUserRoles(supabase, userData.user);
  // `werkbereich_lead` ist bereichsgebunden und noch ohne Zuordnung — daher vorerst nicht.
  const canSeeFinanzDetails =
    isAuthenticated &&
    (userRoles.includes("admin") || userRoles.includes("buchhaltung"));

  const selfService = SELF_SERVICE[werkbereich.slug] ?? [];
  const sectionClassName = "border-t border-foreground py-6";
  const h2ClassName = "mb-3.5";
  const emptyClassName = "text-muted-foreground";

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Werkbereiche", href: "/werkbereiche" },
            { label: werkbereich.name },
          ]}
        />

        <div className="mb-2.5 flex items-start gap-4">
          <WerkbereichMark werkbereich={werkbereich} height={54} />
          <h1>{werkbereich.name}</h1>
        </div>
        <p className="knglmrt-lead mb-2 max-w-[620px]">
          {werkbereich.description}
        </p>

        <section className={sectionClassName}>
          <h2 className={h2ClassName}>Projekte &amp; News</h2>
          <p className="mb-3.5 max-w-[560px] text-muted-foreground">
            Was hier gebaut wurde und was gerade ansteht — Mitgliedsprojekte,
            Vereinsprojekte und Meldungen aus dem Bereich.
          </p>
          <p className={emptyClassName}>
            Noch keine Beiträge für diesen Werkbereich.{" "}
            <Link href="/projects" className="font-bold text-primary">
              Alle Projekte ansehen
            </Link>
          </p>
        </section>

        <section className={sectionClassName}>
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h2 className="m-0">Ressourcen</h2>
            <span className="knglmrt-num text-muted-foreground">
              Auszug aus dem Inventar
            </span>
          </div>
          <p className="mb-3.5 max-w-[560px] text-muted-foreground">
            Alles, was diesem Werkbereich zugeordnet ist — Maschinen, Werkzeug
            und Material mit Standort im Raum.
          </p>
          <Link
            href={`/resources?werkbereich=${werkbereich.slug}`}
            className="flex items-center gap-3.5 bg-muted px-4 py-3.5 transition hover:bg-primary-soft"
          >
            <span className="flex-1">
              <span className="block font-bold">Einträge im Inventar</span>
              <span className="knglmrt-num block text-muted-foreground">
                Filter „Werkbereich: {werkbereich.name}“
              </span>
            </span>
            <span className="whitespace-nowrap font-bold text-primary">
              Öffnen
            </span>
          </Link>
        </section>

        {isAuthenticated ? (
          <WerkbereichFinanzen
            werkbereichName={werkbereich.name}
            canSeeDetails={canSeeFinanzDetails}
            sectionClassName={sectionClassName}
            headingClassName={h2ClassName}
          />
        ) : null}

        <section className={sectionClassName}>
          <h2 className={h2ClassName}>Einweisungen &amp; Freigaben</h2>
          <p className="mb-3.5 max-w-[560px] text-muted-foreground">
            Jede Maschine hat einen Status: frei nutzbar, Einweisung nötig oder
            gesperrt. Deinen eigenen Stand siehst du eingeloggt direkt daneben.
          </p>
          <p className={emptyClassName}>
            Die Einweisungsstände sind noch nicht angebunden. Termine stehen
            solange im{" "}
            <Link href="/calendar" className="font-bold text-primary">
              Kalender
            </Link>
            .
          </p>
        </section>

        <section className="border-t border-foreground pt-6">
          <h2 className={h2ClassName}>Häufige Fragen</h2>
          <p className={emptyClassName}>
            Für {werkbereich.name} sind noch keine Fragen hinterlegt. Schreib
            uns über den{" "}
            <a
              href="https://support.konglomerat.org"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary"
            >
              Support
            </a>
            , dann landet die Antwort hier.
          </p>
        </section>
      </div>

      <aside className="flex flex-col gap-3.5 xl:sticky xl:top-24">
        {isAuthenticated ? (
          selfService.length > 0 ? (
            <div className="bg-[var(--knglmrt-dark-100)] px-[18px] py-4 text-white">
              <div className="knglmrt-caption mb-2.5 text-[var(--knglmrt-dark-30)]">
                Self-Service
              </div>
              {selfService.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="block border-t border-[var(--knglmrt-dark-60)] py-2.5 transition hover:text-[var(--knglmrt-pink-60)]"
                >
                  <span className="block font-bold">{action.label}</span>
                  <span className="knglmrt-num block text-[var(--knglmrt-dark-30)]">
                    {action.hint}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Notice tone="grau" title="Self-Service">
              Für {werkbereich.name} gibt es noch keine Self-Service-Aktion.
              Melde dich im Bereich beim Team.
            </Notice>
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            <Notice tone="rosa">
              Material bestellen, Maschinen buchen und Einweisungen anfragen
              kannst du, sobald du angemeldet bist.
            </Notice>
            <div className="flex gap-2">
              <Button href="/login" kind="primary">
                Anmelden
              </Button>
              <Button href="/register" kind="secondary">
                Mitglied werden
              </Button>
            </div>
          </div>
        )}

        <div className="bg-muted px-[18px] py-4">
          <div className="knglmrt-caption mb-2 text-muted-foreground">
            Offene Werkstatt
          </div>
          <p className="mb-2 text-muted-foreground">
            Wann der Bereich betreut geöffnet ist, steht im Vereinskalender.
          </p>
          <Link href="/calendar" className="font-bold text-primary">
            Termine ansehen
          </Link>
        </div>

        <div className="border border-foreground bg-card px-[18px] py-4">
          <div className="knglmrt-caption mb-2 text-muted-foreground">
            Verein
          </div>
          <p className="mb-2 text-muted-foreground">
            Zugangskarte, Hausordnung und Beitrag — alles rund um deine
            Mitgliedschaft.
          </p>
          <Link href="/verein" className="font-bold text-primary">
            Zum Vereinsbereich
          </Link>
        </div>
      </aside>
    </div>
  );
}
