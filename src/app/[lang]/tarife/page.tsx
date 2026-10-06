// src/app/[lang]/tarife/page.tsx — Tarife und Preise.
//
// Öffentliche Preisübersicht nach dem Entwurf „Tarife und Preise": eine
// Tabelle mit Mitglieder- und Gästespalte, darunter der Hinweis auf
// Einweisungen je Werkbereich und die beiden Wege hinein. Die Preise sind
// feste Werte; „Zugang buchen" ist noch nicht angebunden.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import { cn } from "@/components/knglmrt/FieldShell";
import Face from "@/components/knglmrt/Face";
import { findWerkbereich } from "@/lib/werkbereiche";
import PageTitle from "../components/PageTitle";
import WerkbereichMark from "../components/WerkbereichMark";

export const metadata: Metadata = {
  title: "Tarife und Preise",
};

type Rhythm = "monatlich" | "einmalig";

type Price =
  | { amount: string; rhythm: Rhythm; note?: string }
  | { amount?: undefined; note?: string };

type PriceRow = {
  name: string;
  lead: string;
  member: Price;
  guest: Price;
};

type PriceGroup = { title: string; rows: PriceRow[] };

const GROUPS: PriceGroup[] = [
  {
    title: "Abo · monatlich",
    rows: [
      {
        name: "Abo Klein",
        lead: "Uneingeschränkter Zugang an 15 verschiedenen Tagen pro Quartal",
        member: { amount: "15 €", rhythm: "monatlich" },
        guest: { note: "nur für Mitglieder" },
      },
      {
        name: "Abo Groß",
        lead: "Uneingeschränkt 24/7, alle Werkstattbereiche",
        member: { amount: "30 €", rhythm: "monatlich" },
        guest: { note: "nur für Mitglieder" },
      },
    ],
  },
  {
    title: "10er-Karte · einmalig",
    rows: [
      {
        name: "10er-Karte",
        lead: "10 frei wählbare Tage, 12 Monate gültig",
        member: {
          amount: "50 €",
          rhythm: "einmalig",
          note: "12 Monate gültig",
        },
        guest: {
          amount: "190 €",
          rhythm: "einmalig",
          note: "12 Monate gültig",
        },
      },
    ],
  },
  {
    title: "Zeitzugang · einmalig",
    rows: [
      {
        name: "1 Tag",
        lead: "Ein Tag Zugang",
        member: { note: "über Abo oder Karte" },
        guest: { amount: "20 €", rhythm: "einmalig" },
      },
      {
        name: "1 Woche",
        lead: "7 Tage am Stück",
        member: {},
        guest: { amount: "75 €", rhythm: "einmalig" },
      },
      {
        name: "1 Monat",
        lead: "Ein Monat am Stück",
        member: {},
        guest: { amount: "135 €", rhythm: "einmalig" },
      },
      {
        name: "1 Quartal",
        lead: "Drei Monate am Stück",
        member: {},
        guest: { amount: "333 €", rhythm: "einmalig" },
      },
    ],
  },
];

// Werkbereiche, deren Marken im Hinweis unter der Tabelle stehen.
const AREA_SLUGS = [
  "holz",
  "textil",
  "elektronik",
  "cnc",
  "3d-druck",
  "darkroom",
];

// Monatlich ist Markenpink, einmalig braun — Preis und Marke darunter.
const RHYTHM_TEXT: Record<Rhythm, string> = {
  monatlich: "text-primary",
  einmalig: "text-knglmrt-brown-100",
};

const RHYTHM_TAG: Record<Rhythm, string> = {
  monatlich: "bg-primary text-primary-foreground",
  einmalig:
    "bg-knglmrt-paper text-knglmrt-brown-100 shadow-[inset_0_0_0_1px_var(--knglmrt-brown-100)]",
};

// Die Mitgliederspalte ist hervorgehoben, die Gästespalte bleibt Papier.
// Fährt die Maus über eine Zelle, färbt sich die ganze Spalte eine Stufe
// kräftiger — per :has() auf der Tabelle, ohne Client-State. col-member und
// col-guest sind nur Marker für diesen Selektor.
const MEMBER_COLUMN =
  "col-member bg-knglmrt-paper-pink transition-colors group-has-[.col-member:hover]/table:bg-knglmrt-pink-15";
const GUEST_COLUMN =
  "col-guest bg-transparent transition-colors group-has-[.col-guest:hover]/table:bg-knglmrt-pink-15";

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_210px_210px]";
const CELL_RULE = "border-l-[0.5px] border-knglmrt-dark-30";
const COLUMN_LABEL =
  "text-[10px] leading-3 font-bold tracking-[.13em] uppercase";

function RhythmTag({
  className,
  children,
}: Readonly<{ className: string; children: ReactNode }>) {
  return (
    <span
      className={cn(
        "mt-1 self-start px-1.5 py-0.5 text-[10px] leading-3 font-bold tracking-[.1em] uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PriceCell({
  price,
  className,
}: Readonly<{ price: Price; className: string }>) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 px-[18px] py-3",
        CELL_RULE,
        className,
      )}
    >
      {price.amount ? (
        <>
          <span
            className={cn(
              "font-[family-name:var(--font-num)] text-[22px] leading-[1.1] font-bold",
              RHYTHM_TEXT[price.rhythm],
            )}
          >
            {price.amount}
          </span>
          <RhythmTag className={RHYTHM_TAG[price.rhythm]}>
            {price.rhythm}
          </RhythmTag>
        </>
      ) : (
        <span className="font-[family-name:var(--font-num)] text-[15px] leading-[1.1] text-muted-foreground">
          —
        </span>
      )}
      {price.note ? (
        <span className="text-[11px] leading-[14px] text-muted-foreground">
          {price.note}
        </span>
      ) : null}
    </div>
  );
}

export default function TarifePage() {
  const areas = AREA_SLUGS.map(findWerkbereich).filter(
    (area) => area !== undefined,
  );

  return (
    <div className="flex flex-col gap-10">
      <PageTitle
        backLink={{ href: "/verein", label: "Zurück zum Verein" }}
        title="Tarife und Preise"
        titleClassName="text-primary!"
        subTitle="Als Mitglied kommst du günstiger rein und hast die Wahl zwischen Abo und Punktekarte. Extern geht auch — tageweise oder mit der 10er-Karte."
        subTitleClassName="text-foreground!"
        customActions={<Face number={5} size={72} title="" />}
      />

      <div className="overflow-x-auto knglmrt-border">
        <div className="group/table min-w-[600px]">
          {/* Spaltenköpfe */}
          <div className={cn(ROW_GRID, "knglmrt-border-b")}>
            <div className="px-[18px] py-4" />
            <div
              className={cn(
                "flex flex-col gap-1 px-[18px] py-4",
                CELL_RULE,
                MEMBER_COLUMN,
              )}
            >
              <span className={cn(COLUMN_LABEL, "text-primary")}>Intern</span>
              <span className="font-display text-[23px] leading-none font-black">
                Mitglieder
              </span>
              <span className="text-[11px] leading-[14px] text-muted-foreground">
                Jahresbeitrag + Zugang
              </span>
            </div>
            <div
              className={cn(
                "flex flex-col gap-1 px-[18px] py-4",
                CELL_RULE,
                GUEST_COLUMN,
              )}
            >
              <span className={cn(COLUMN_LABEL, "text-muted-foreground")}>
                Extern
              </span>
              <span className="font-display text-[23px] leading-none font-black">
                Gäste
              </span>
              <span className="text-[11px] leading-[14px] text-muted-foreground">
                ohne Mitgliedschaft
              </span>
            </div>
          </div>

          {/* Jahresbeitrag */}
          <div className={cn(ROW_GRID, "knglmrt-border-b")}>
            <div className="flex flex-col gap-1.5 px-[18px] py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] leading-[18px] font-bold">
                  Jahresbeitrag
                </span>
                <Badge tone="wartet">Pflicht für Mitglieder</Badge>
              </div>
              <span className="text-xs leading-4 text-pretty text-muted-foreground">
                Macht dich zum Mitglied — der Zugang zu den Werkstätten kommt
                unten dazu. Mindestens 120 €, freiwillig mehr; du wählst im
                Antrag.
              </span>
            </div>
            <div
              className={cn(
                "flex flex-col justify-center gap-0.5 px-[18px] py-4",
                CELL_RULE,
                MEMBER_COLUMN,
              )}
            >
              <span className="font-[family-name:var(--font-num)] text-[22px] leading-[1.1] font-bold text-foreground">
                ab 120 €
              </span>
              <RhythmTag className="bg-foreground text-background">
                jährlich
              </RhythmTag>
              <span className="text-[11px] leading-[14px] text-muted-foreground">
                quartalsweise gezahlt
              </span>
            </div>
            <div
              className={cn(
                "flex flex-col justify-center gap-0.5 px-[18px] py-4",
                CELL_RULE,
                GUEST_COLUMN,
              )}
            >
              <span className="font-[family-name:var(--font-num)] text-[15px] leading-[1.1] text-muted-foreground">
                —
              </span>
              <span className="text-[11px] leading-[14px] text-muted-foreground">
                entfällt
              </span>
            </div>
          </div>

          {/* + Zugang nach Wahl */}
          <div
            className={cn(ROW_GRID, "border-b-[0.5px] border-knglmrt-dark-30")}
          >
            <div className="flex items-baseline gap-2 px-[18px] py-2.5">
              <span className="font-display text-[19px] leading-none font-black text-primary">
                +
              </span>
              <span className="text-[13px] font-bold">Zugang nach Wahl</span>
            </div>
            <div className={cn(CELL_RULE, MEMBER_COLUMN)} />
            <div className={cn(CELL_RULE, GUEST_COLUMN)} />
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className={cn(ROW_GRID, "bg-muted")}>
                <div
                  className={cn(
                    COLUMN_LABEL,
                    "px-[18px] py-2 text-muted-foreground",
                  )}
                >
                  {group.title}
                </div>
                <div className={CELL_RULE} />
                <div className={CELL_RULE} />
              </div>
              {group.rows.map((row) => (
                <div
                  key={row.name}
                  className={cn(
                    ROW_GRID,
                    "border-t-[0.5px] border-knglmrt-dark-30",
                  )}
                >
                  <div className="flex flex-col gap-[3px] px-[18px] py-3">
                    <span className="text-[15px] leading-[18px] font-bold">
                      {row.name}
                    </span>
                    <span className="text-xs leading-4 text-pretty text-muted-foreground">
                      {row.lead}
                    </span>
                  </div>
                  <PriceCell price={row.member} className={MEMBER_COLUMN} />
                  <PriceCell price={row.guest} className={GUEST_COLUMN} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="grid items-center gap-x-7 gap-y-4 bg-knglmrt-yellow-30 px-5 py-[18px] md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-1">
          <p className="text-sm leading-[18px] font-bold">Hinweis</p>
          <p className="text-[13px] leading-[18px] text-pretty">
            Enthalten ist nur der Zugang. Je nach Werkbereich brauchst du für
            bestimmte Maschinen eine Einweisung und/oder zahlst zusätzliche
            Gebühren.
          </p>
          <Link
            href="/werkbereiche"
            className="text-xs text-primary underline hover:text-knglmrt-brown-100"
          >
            Einweisungen und Gebühren je Werkbereich
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {areas.map((area) => (
            <WerkbereichMark key={area.slug} werkbereich={area} height={40} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-[18px] bg-knglmrt-paper-pink px-[26px] py-6">
          <div className="flex gap-0.5">
            <Face number={2} size={48} title="" />
            <Face number={11} size={48} title="" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-[23px] leading-none font-black">
              Mitglied werden
            </h2>
            <p className="text-[13px] leading-[18px] text-pretty">
              Jahresbeitrag 120, 150 oder 180 € — du wählst im Antrag, was du
              zahlen kannst. Schon mit einer 10er-Karte im Jahr günstiger als
              extern.
            </p>
          </div>
          <div className="col-span-full flex justify-end">
            <Button href="/registration" kind="emphasis" size="large">
              Mitgliedsantrag stellen
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-[18px] bg-muted px-[26px] py-6">
          <Face number={21} size={48} title="" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-[23px] leading-none font-black">
              Als Gast buchen
            </h2>
            <p className="text-[13px] leading-[18px] text-pretty">
              Einfach mal reinschnuppern: Tag, Woche, Monat, Quartal oder
              10er-Karte.
            </p>
          </div>
          <div className="col-span-full flex justify-end">
            {/* Noch ohne Ziel — die Buchung für Gäste folgt. */}
            <Button type="button" kind="secondary" size="large">
              Zugang buchen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
