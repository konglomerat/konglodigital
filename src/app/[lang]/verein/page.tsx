// src/app/[lang]/verein/page.tsx — die Vereinsseite nach dem Prototyp
// "Konglo Digital Prototyp.dc.html" (Claude Design):
// Über uns + Kalender nebeneinander → Freunde & Förderer → Das #Rosenwerk.
// Der Kalender hängt in einer eigenen Suspense-Grenze; alles andere steht
// sofort, ohne auf den Google-Feed zu warten.
import { Suspense } from "react";
import { faFileLines } from "@fortawesome/free-solid-svg-icons";

import PageTitle from "../components/PageTitle";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import Hand from "@/components/knglmrt/Hand";
import StatTile from "@/components/knglmrt/StatTile";
import { WERKBEREICHE } from "@/lib/werkbereiche";
import Button from "@/components/knglmrt/Button";
import VereinCalendar, { VereinCalendarSkeleton } from "./VereinCalendar";

// TODO: Sobald die Dokumente als PDF liegen (public/ oder CMS), hier die
// Direktlinks eintragen — bis dahin führt jede Zeile auf die Vereinsseite.
const WICHTIGE_LINKS = [
  { label: "Vereinssatzung", href: "https://konglomerat.org" },
  { label: "Beitragsordnung", href: "https://konglomerat.org" },
  { label: "Merkblatt Datenschutz", href: "https://konglomerat.org" },
];

// Die Logodateien liegen unter public/branding/foerderer/ — siehe das
// README dort. Fehlt eine Datei, trägt der Alt-Text den Namen.
const FOERDERER = [
  {
    name: "Stiftungsgemeinschaft anstiftung & ertomis",
    href: "https://anstiftung.de/",
    logo: "/branding/foerderer/anstiftung.png",
  },
  {
    name: "Verbund Offener Werkstätten",
    href: "https://offene-werkstaetten.org/de",
    logo: "/branding/foerderer/verbund-offener-werkstaetten.gif",
  },
  {
    name: "Kulturbüro Dresden",
    href: "https://kulturbuero-dresden.de/",
    logo: "/branding/foerderer/kulturbuero-dresden.jpg",
  },
  {
    name: "Netzwerk Immovielien",
    href: "https://netzwerk-immovielien.de/",
    logo: "/branding/foerderer/netzwerk-immovielien.png",
  },
  {
    name: "IfM — Initiativen für Materialkreisläufe",
    href: "https://material-initiativen.org/",
    logo: "/branding/foerderer/ifm.png",
  },
  {
    name: "nytt.Materialdepot",
    href: "https://www.nytt-materialdepot.de/",
    logo: "/branding/foerderer/nytt-materialdepot.svg",
  },
];

const NACHBARSCHAFT = [
  {
    title: "Werkstattfreunde",
    body: "Werkstadtpiraten e.V. · Freifunk Dresden",
  },
  {
    title: "Solidarische Landwirtschaft",
    body: "Abholstation von LebensWurzeln, Weites Feld und deinHof",
  },
  {
    title: "Unternehmer:innen",
    body: "1mal1japan · holypoly · City Fitness Dresden",
  },
  {
    title: "Sport",
    body: "Freie Dresdner Pole Dance Trainingsgemeinschaft",
  },
  {
    title: "Zeitgenössische Kunst in den Ateliers",
    body:
      "Christian Rätsch · Rita Grechen · Ina Weise · Jonas & Clausnitzer · " +
      "Juan Miguel Restrepo Valdes · Jana Morgenstern · Susanne Bartel · " +
      "Stephanie Laeger · Stefan Brock",
  },
];

const captionClassName =
  "knglmrt-caption mb-2 block text-[var(--knglmrt-brown-100)]";

export default function VereinPage() {
  return (
    <div>
      <PageTitle title="Konglomerat e.V." className="mb-2.5" />
      {/* Subheadline: nicht knglmrt-lead — die Rollenklasse setzt 21px und
          gewinnt gegen jede Tailwind-Größe. Hier die Rolle direkt aufgebaut. */}
      <p className="mb-1.5 max-w-[620px] text-pretty font-[family-name:var(--font-narrow)] text-[28px] font-semibold leading-[34px] text-primary">
        Die gemeinsame Lust am Selbermachen
      </p>
      <div className="mb-8 max-w-[420px]">
        <Divider height={9} color="var(--primary)" />
      </div>

      {/* Über uns links, Kalender rechts — im Prototyp 1.25fr / 1fr. */}
      <div className="mb-11 grid items-start gap-9 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h2 className={captionClassName}>Über uns</h2>
          {/* Das Motto steht jetzt als Subheadline über der Seite — hier
              läuft der Satz um die gezeichnete Hand. */}
          <Hand number={4} size={96} className="float-right mb-2 ml-5" />
          <p className="mb-3 max-w-[600px] text-pretty">
            Im gemeinsamen Selbermachen sieht das Konglomerat großes Potential,
            die Geschicke der Welt in die eigenen Hände zu nehmen. Von dieser
            Intention angetrieben fördert der Verein auf vielfältige Weise eine{" "}
            <strong>Kultur der Marke Eigenbau</strong>.
          </p>
          <p className="mb-3 max-w-[600px] text-pretty">
            Zweck des Vereins ist es, handwerkliche, kulturelle, künstlerische
            und soziale Projekte aus der Zivilgesellschaft organisatorisch und
            technisch zu unterstützen. Dazu kommen eigene Kooperationsprojekte
            in Stadtentwicklung, Community Building, nachhaltigem Wirtschaften
            und Umweltbildung — und Beratung beim Aufbau von
            Gemeinschaftswerkstätten aller Art.
          </p>
          <p className="mb-[18px] max-w-[600px] text-pretty">
            Unsere gemeinsame Vision ist eine kooperative Gesellschaft, in der
            selbstverursachte Probleme nicht auf entfernte Länder oder
            zukünftige Generationen abgewälzt, sondern lokal und
            transdisziplinär gelöst werden.
          </p>

          <div>
            <h3 className={captionClassName}>Wichtige Links</h3>
            <div className="flex flex-wrap gap-3">
              {WICHTIGE_LINKS.map((link) => (
                <Button
                  key={link.label}
                  href={link.href}
                  kind="secondary"
                  icon={faFileLines}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Der Kalender lädt nach: die Textspalte oben steht schon. */}
        <div className="lg:sticky lg:top-[78px]">
          <Suspense fallback={<VereinCalendarSkeleton />}>
            <VereinCalendar />
          </Suspense>
        </div>
      </div>

      {/* Fläche bis an die Fensterkanten, Inhalt zurück in den Rahmen
          von <main> (max-w-[1600px], px-3 / md:px-7). */}
      <section className="knglmrt-full-bleed mb-11 bg-primary-soft py-[30px]">
        <div className="mx-auto w-full max-w-[1600px] px-3 md:px-7">
          <div className="grid items-start gap-[26px] sm:grid-cols-[110px_1fr]">
            <Face number={19} size={110} color="var(--primary)" />
            {/* Text links, die Logowand als zweite Spalte rechts daneben. */}
            <div className="grid items-start gap-[26px] lg:grid-cols-[1fr_minmax(0,340px)]">
              <div>
                <h2 className="mb-2.5 text-[length:var(--ui-size-title)] leading-[var(--ui-line-title)] text-primary">
                  Freunde &amp; Förderer
                </h2>
                <p className="knglmrt-lead mb-3 max-w-[620px]">
                  Was wären wir nur ohne unsere großartigen Förder:innen,
                  Freunde und das beste Netzwerk?
                </p>
                <p className="mb-4 max-w-[620px]">
                  Als Fördermitglied nutzt du die Werkstätten und Maschinen zu
                  Mitgliedstarifen und bestimmst mit, mit welchen Themen wir uns
                  beschäftigen und welche Workshops wir dringend zusammen machen
                  sollten.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button href="/register" kind="primary">
                    Fördermitglied werden
                  </Button>
                  <Button
                    href="https://konglomerat.org"
                    kind="secondary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Anmeldebogen (PDF)
                  </Button>
                </div>
              </div>
              <div>
                <h3 className={captionClassName}>Netzwerk und Förderer</h3>
                <div className="grid grid-cols-2 gap-2">
                  {FOERDERER.map((foerderer) => (
                    <a
                      key={foerderer.href}
                      href={foerderer.href}
                      target="_blank"
                      rel="noreferrer"
                      title={foerderer.name}
                      className="flex h-[76px] items-center justify-center px-3 py-2.5 transition hover:opacity-75"
                    >
                      {/* Kein next/image: die Logos sind fremde Marken in
                        unterschiedlichen Formaten, object-contain hält sie heil. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={foerderer.logo}
                        alt={foerderer.name}
                        className="max-h-full w-full object-contain"
                      />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="knglmrt-border-t pt-[26px]">
        <h2 className="text-[length:var(--ui-size-title)] leading-[var(--ui-line-title)]">
          Das #Rosenwerk
        </h2>
        <div className="knglmrt-lead mb-4">
          Die Dresdner Selbstmachzentrale auf 800 m²
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="mb-3 max-w-[600px] text-pretty">
              Das #Rosenwerk liegt in einem rund 8.000 m² großen
              Industriekomplex nahe der Innenstadt — zwischen Löbtauer
              Heizkraftwerk, Hauptbahnhof und Dresden Mitte, zentral und
              trotzdem im blinden Fleck urbaner Wahrnehmung.
            </p>
            <p className="mb-4 max-w-[600px] text-pretty">
              Seit dem 01.01.2015 mietet der Verein hier rund 800 m² Räume und
              Freiflächen und baut sie zur Produktionsbasis für eigene wie
              fremde, private wie gesellschaftliche Projekte aus. Die offene
              Werkstatt im Zentrum stellt Geräte und Verfahren bereit, die über
              die Möglichkeiten des Einzelnen hinausgehen — nutzbar von der
              Nachbarschaft bis zum produzierenden Gewerbe.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Fläche"
                value="800 m²"
                hint="Räume und Freiflächen"
                tone="rosa"
              />
              <StatTile
                label="Seit"
                value="2015"
                hint="ehrenamtlich betrieben"
                tone="grau"
              />
              <StatTile
                label="Werkbereiche"
                value={String(WERKBEREICHE.length)}
                hint="High bis Low Tech"
                tone="grau"
              />
            </div>
          </div>

          <div>
            <h3 className={captionClassName}>
              Das #RW sind wir und unsere Nachbarschaft
            </h3>
            <div className="flex flex-col">
              {NACHBARSCHAFT.map((eintrag) => (
                <div
                  key={eintrag.title}
                  className="border-t border-border py-2.5 last:border-b"
                >
                  <div className="font-bold">{eintrag.title}</div>
                  {eintrag.body}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Schlussbild: Terrazzo-Kachel des DS, darauf das eine weiße Panel
          mit der 3px paper-pink Keyline. */}
      <section className="knglmrt-full-bleed knglmrt-terrazzo-fein-rosa mt-11 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-[1600px] px-3 md:px-7">
          <div className="knglmrt-panel mx-auto max-w-[720px] px-7 py-8 sm:px-10">
            <h2 className="mb-2.5">Praxis für nachhaltige Entwicklung</h2>
            <p className="mb-3 text-pretty">
              Offene Werkstätten setzen der Ohnmacht des Konsumenten das
              Selbstwirksamkeitsprinzip entgegen: Dinge selbst gestalten,
              reparieren, verstehen — buchstäblich begreifen.
            </p>
            <div className="text-[var(--knglmrt-brown-100)]">
              Mitglied im Verbund offener Werkstätten e.V.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
