// src/app/[lang]/werkbereiche/holz/page.tsx — Schaufenster für die Detailseite
// eines Werkbereichs. Bewusst als eine statische Seite geschrieben: alle Inhalte
// sind Beispieldaten und werden später durch CMS-gebundene Blöcke ersetzt.
// Vorlage: „Konglo Digital Prototyp" (Claude Design), Ansicht `page.werkbereich`.
import Link from "next/link";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import Badge from "@/components/knglmrt/Badge";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import Hand from "@/components/knglmrt/Hand";
import Notice from "@/components/knglmrt/Notice";
import {
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/knglmrt/Table";
import Button from "../../components/Button";
import PageTitle from "../../components/PageTitle";
import WerkbereichSideNav from "../WerkbereichSideNav";

export default function HolzwerkstattPage() {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)] xl:grid-cols-[212px_minmax(0,1fr)_300px]">
      <WerkbereichSideNav className="border-r border-foreground">
        <div className="px-3.5">
          <Divider number={4} height={9} color="var(--foreground)" />
        </div>
        <p className="px-3.5 text-muted-foreground">
          Jeder Werkbereich ist gleich aufgebaut — Self-Service nur mit
          Einweisung.
        </p>
      </WerkbereichSideNav>

      {/* ---------- Hauptspalte ---------- */}
      <div className="flex min-w-0 flex-col">
        <PageTitle
          backLink={{
            href: "/werkbereiche",
            label: "Zur Übersicht",
            icon: faArrowLeft,
          }}
          title="Holzwerkstatt"
          subTitle="120 m² für Plattenaufteilung, Massivholzbearbeitung und CNC-Fräsen — der größte Werkbereich im Haus. Material bestellst du selbst, abgerechnet wird über die nächste Mitgliedsrechnung."
        />

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone="neutral">Raum 4 · Erdgeschoss</Badge>
          <Badge tone="gebucht">geöffnet bis 22:00</Badge>
          <Badge tone="wartet">3 Maschinen mit Einweisung</Badge>
        </div>

        {/* ---------- Projekte & News ---------- */}
        <section className="mt-6 border-t border-foreground pt-6 pb-7">
          <h2 className="mb-3.5">Projekte &amp; News</h2>

          <div className="mb-5 grid gap-3.5 sm:grid-cols-2">
            <article className="border border-foreground bg-card transition hover:bg-primary-soft">
              <div className="flex h-[110px] items-center justify-center border-b border-foreground bg-muted">
                <Hand number={4} size={64} color="var(--foreground)" />
              </div>
              <div className="px-3.5 py-3">
                <div className="font-bold">Regal für den Lesesaal</div>
                <div className="knglmrt-num text-muted-foreground">
                  Mitgliedsprojekt · 2026
                </div>
              </div>
            </article>

            <article className="border border-foreground bg-card transition hover:bg-primary-soft">
              <div className="flex h-[110px] items-center justify-center border-b border-foreground bg-muted">
                <Face number={19} size={64} color="var(--foreground)" />
              </div>
              <div className="px-3.5 py-3">
                <div className="font-bold">Werkbank-Neubau</div>
                <div className="knglmrt-num text-muted-foreground">
                  Vereinsprojekt · 2025
                </div>
              </div>
            </article>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3.5 border-b border-border pb-3">
              <span className="knglmrt-num text-primary">18.08.2026</span>
              <span>
                Dickenhobel bis Ende August außer Betrieb — Ersatzteil ist
                bestellt.
              </span>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3.5 border-b border-border pb-3">
              <span className="knglmrt-num text-primary">11.08.2026</span>
              <span>
                Neue Absauganlage in Betrieb, kurze Nachschulung am
                Werkstattabend.
              </span>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3.5">
              <span className="knglmrt-num text-primary">02.08.2026</span>
              <span>Materialpreise aktualisiert, Sperrholz +8 %.</span>
            </div>
          </div>
        </section>

        {/* ---------- Ressourcen ---------- */}
        <section className="border-t border-foreground pt-6 pb-7">
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h2>Ressourcen</h2>
            <span className="knglmrt-num text-muted-foreground">
              Auszug aus dem Inventar
            </span>
          </div>
          <p className="mb-3.5 max-w-[560px] text-muted-foreground">
            Alles, was diesem Werkbereich zugeordnet ist — Maschinen, Werkzeug
            und Material mit Standort im Raum.
          </p>

          <Table>
            <THead>
              <Th className="w-[46%]">Eintrag</Th>
              <Th className="w-[27%]">Kategorie</Th>
              <Th className="w-[27%]">Standort</Th>
            </THead>
            <TBody>
              <Tr interactive>
                <Td>CNC-Fräse Stepcraft D840</Td>
                <Td className="text-muted-foreground">Maschine</Td>
                <Td className="text-muted-foreground">Raum 4 · Mitte</Td>
              </Tr>
              <Tr interactive>
                <Td>Bandsäge Metabo</Td>
                <Td className="text-muted-foreground">Maschine</Td>
                <Td className="text-muted-foreground">Raum 4 · Regal B2</Td>
              </Tr>
              <Tr interactive>
                <Td>Stechbeitel-Set (8-teilig)</Td>
                <Td className="text-muted-foreground">Werkzeug</Td>
                <Td className="text-muted-foreground">Raum 4 · Schublade 3</Td>
              </Tr>
              <Tr interactive>
                <Td>Sperrholz Birke 12 mm</Td>
                <Td className="text-muted-foreground">Material</Td>
                <Td className="text-muted-foreground">Raum 4 · Plattenlager</Td>
              </Tr>
              <Tr interactive>
                <Td>Fräser-Set 6 mm Schaft</Td>
                <Td className="text-muted-foreground">Verbrauch</Td>
                <Td className="text-muted-foreground">Raum 4 · Ausgabe</Td>
              </Tr>
            </TBody>
          </Table>

          <Link
            href="/resources"
            className="mt-3 flex items-center gap-3.5 bg-muted px-4 py-3.5 transition hover:bg-primary-soft"
          >
            <span className="flex-1">
              <span className="block font-bold">Alle 32 Einträge im Inventar</span>
              <span className="knglmrt-num block text-muted-foreground">
                Filter „Werkbereich: Holzwerkstatt“
              </span>
            </span>
            <span className="font-bold whitespace-nowrap text-primary">
              Öffnen
            </span>
          </Link>
        </section>

        {/* ---------- Ampelsystem ----------
            Ausnahme von der Palette: hier führen bewusst die Ampelfarben
            grün/gelb/rot, weil die Sektion genau das erklärt. */}
        <section className="border-t border-foreground pt-6 pb-7">
          <h2 className="mb-1">Ampelsystem</h2>
          <p className="mb-3.5 max-w-[560px] text-muted-foreground">
            Jede Maschine hat einen Status: frei nutzbar, Einweisung nötig oder
            gesperrt. Deinen Stand siehst du eingeloggt direkt daneben.
          </p>

          <div className="flex flex-col gap-0.5">
            <div className="bg-[#d7edd0] px-[18px] py-3.5">
              <div className="knglmrt-caption mb-1">Frei nutzbar</div>
              <div>
                Bandsäge · Kappsäge · Bohrmaschine · Handwerkzeug ·
                Schleifplätze
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-4 bg-[#fff4c5] px-[18px] py-3.5">
              <div className="min-w-0 flex-1">
                <div className="knglmrt-caption mb-1">Einweisung nötig</div>
                <div>
                  CNC-Fräse D840 · bestanden
                  <br />
                  Formatkreissäge · bestanden
                  <br />
                  Kantenschleifer · offen, Termin Sa 12.09.
                </div>
              </div>
              <Button href="/calendar" kind="primary" size="small">
                Termin buchen
              </Button>
            </div>

            <div className="bg-[#f6cccc] px-[18px] py-3.5">
              <div className="knglmrt-caption mb-1">
                Gesperrt oder nur mit Aufsicht
              </div>
              <div>
                Dickenhobel · defekt bis Ende August
                <br />
                Samstagsbetrieb · nur mit Aufsicht aus dem Team
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Häufige Fragen ---------- */}
        <section className="border-t border-foreground pt-6">
          <h2 className="mb-3.5">Häufige Fragen</h2>
          <div className="flex max-w-[640px] flex-col gap-3.5">
            <div>
              <div className="font-bold">Darf ich eigenes Holz mitbringen?</div>
              <div>
                Ja, solange es frei von Nägeln, Schrauben und Farbe ist. Altholz
                bitte vorher mit dem Team klären — Metallreste zerstören die
                Hobelmesser.
              </div>
            </div>
            <div>
              <div className="font-bold">Was kostet die Nutzung?</div>
              <div>
                Die Werkstattnutzung ist im Mitgliedsbeitrag enthalten.
                Abgerechnet werden Material und CNC-Laufzeit über die monatliche
                Rechnung.
              </div>
            </div>
            <div>
              <div className="font-bold">
                Wie lange darf ein Werkstück im Lagerplatz bleiben?
              </div>
              <div>
                Vier Wochen. Danach kannst du im Self-Service verlängern, sonst
                räumt das Team das Fach frei.
              </div>
            </div>
            <div>
              <div className="font-bold">Kann ich als Gast mitarbeiten?</div>
              <div>
                An den offenen Werkstattabenden ja, in Begleitung eines
                Mitglieds. Maschinen mit Einweisungspflicht bleiben Mitgliedern
                vorbehalten.
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Rechte Spalte ---------- */}
      <aside className="flex flex-col gap-3.5 md:col-span-2 xl:sticky xl:top-24 xl:col-span-1">
        <Notice tone="rosa">
          Material bestellen, Maschinen mieten, Defekte melden und Einweisungen
          buchen kannst du, sobald du angemeldet bist.
        </Notice>

        <div className="bg-muted px-[18px] py-4">
          <div className="knglmrt-caption mb-2 text-muted-foreground">
            Öffnungszeiten
          </div>
          <div className="mb-2 font-bold">Jetzt geöffnet bis 22:00</div>
          <div className="knglmrt-num flex justify-between border-t border-border py-1.5">
            <span>Mo–Fr</span>
            <span className="text-muted-foreground">10–22 Uhr</span>
          </div>
          <div className="knglmrt-num flex justify-between border-t border-border py-1.5">
            <span>Sa</span>
            <span className="text-muted-foreground">10–18 Uhr</span>
          </div>
          <div className="knglmrt-num flex justify-between border-t border-border py-1.5">
            <span>So</span>
            <span className="text-muted-foreground">geschlossen</span>
          </div>
          <div className="mt-2 text-muted-foreground">
            Samstags nur mit Aufsicht aus dem Team.
          </div>
        </div>

        <div className="border border-foreground bg-card px-[18px] py-4">
          <div className="knglmrt-caption mb-2.5 text-muted-foreground">
            Standort
          </div>
          <div className="flex h-[150px] items-center justify-center bg-muted">
            <Face number={6} size={72} color="var(--foreground)" />
          </div>
          <div className="mt-2.5 font-bold">Raum 4 · Erdgeschoss</div>
          <div className="text-muted-foreground">
            Hinter dem Innenhof, Zugang mit Zugangskarte.
          </div>
        </div>
      </aside>
    </div>
  );
}
