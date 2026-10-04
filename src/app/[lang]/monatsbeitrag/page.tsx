"use client";

// src/app/[lang]/monatsbeitrag/page.tsx — Tarifauswahl der Zugangskarte.
//
// Der aktuelle Tarif kommt live aus Campai über denselben Abruf wie die
// Kontoseite (`/api/account/campai-profile`). Die Kacheln selbst sind feste
// Beschreibungen der vier Stufen. Wechseln oder Aufladen ist noch nicht
// angebunden — die Taste unten zeigt nur, was passieren würde.
import { useState } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import { cn } from "@/components/knglmrt/FieldShell";
import Face from "@/components/knglmrt/Face";
import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import PageTitle from "../components/PageTitle";
import useCampaiProfile from "../account/useCampaiProfile";

type TariffGroup = "ohne" | "abo" | "punktekarte";

type TariffCard = {
  id: CampaiAccessTariff;
  group: TariffGroup;
  title: string;
  priceEuro: number;
  priceUnit: string;
  description: string;
  details: { label: string; value: string }[];
  /** Nummer des gezeichneten Gesichts, siehe `doodle-figures`. */
  face: number;
};

// Die Gesichter wie im Entwurf: jede Stufe hat ihr eigenes.
const TARIFFS: TariffCard[] = [
  {
    id: "keiner",
    group: "ohne",
    title: "Keine Karte",
    priceEuro: 0,
    priceUnit: "kein Beitrag",
    description:
      "Kein selbständiger Zugang, aber z. B. zur offenen Werkstatt kommst du trotzdem rein.",
    details: [
      { label: "Tage", value: "–" },
      { label: "Zahlung", value: "–" },
    ],
    face: 3,
  },
  {
    id: "abo_klein",
    group: "abo",
    title: "Abo Klein",
    priceEuro: 15,
    priceUnit: "pro Monat",
    description:
      "Zugang an 15 verschiedenen Tagen pro Quartal. Den Tarif kannst du nur 1× pro Quartal wechseln.",
    details: [
      { label: "Tage", value: "15 / Quartal" },
      { label: "Zahlung", value: "monatlich" },
    ],
    face: 8,
  },
  {
    id: "abo_gross",
    group: "abo",
    title: "Abo Groß",
    priceEuro: 30,
    priceUnit: "pro Monat",
    description:
      "Rund um die Uhr, alle Werkstattbereiche. Für die, die hier eh wohnen. Den Tarif kannst du nur 1× pro Quartal wechseln.",
    details: [
      { label: "Tage", value: "unbegrenzt" },
      { label: "Zahlung", value: "monatlich" },
    ],
    face: 17,
  },
  {
    id: "punktekarte",
    group: "punktekarte",
    title: "10er Karte",
    priceEuro: 50,
    priceUnit: "einmalig",
    description: "12 Monate gültig & personengebunden.",
    details: [
      { label: "Tage", value: "10 frei wählbar" },
      { label: "Zahlung", value: "einmalig" },
    ],
    face: 22,
  },
];

const GROUPS: { id: TariffGroup; label: string; span: string }[] = [
  { id: "ohne", label: "Ohne Karte", span: "xl:col-span-1" },
  { id: "abo", label: "Abo · Monatlich", span: "xl:col-span-2" },
  { id: "punktekarte", label: "Punktekarte · Einmalig", span: "xl:col-span-1" },
];

// Farbe je Rubrik: Überschrift, Linie darunter und der Preis in der Kachel.
const GROUP_TEXT: Record<TariffGroup, string> = {
  ohne: "text-muted-foreground",
  abo: "text-primary",
  punktekarte: "text-knglmrt-brown-100",
};

const GROUP_BORDER: Record<TariffGroup, string> = {
  ohne: "border-border",
  abo: "border-primary",
  punktekarte: "border-knglmrt-brown-100",
};

// Fläche der Kachel beim Überfahren und in der Auswahl — dieselbe Tint-Stufe
// (30), je Rubrik ein anderer Ton.
const GROUP_SURFACE: Record<TariffGroup, { hover: string; selected: string }> = {
  ohne: { hover: "hover:bg-knglmrt-paper-pink", selected: "bg-knglmrt-paper-pink" },
  abo: { hover: "hover:bg-knglmrt-blue-30", selected: "bg-knglmrt-blue-30" },
  punktekarte: { hover: "hover:bg-knglmrt-yellow-30", selected: "bg-knglmrt-yellow-30" },
};

const PRICE_TEXT: Record<TariffGroup, string> = {
  ohne: "text-foreground",
  abo: "text-primary",
  punktekarte: "text-knglmrt-brown-100",
};

const groupLabel = (group: TariffGroup) =>
  GROUPS.find((entry) => entry.id === group)?.label ?? "";

const tariffById = (id: CampaiAccessTariff) =>
  TARIFFS.find((tariff) => tariff.id === id) ?? TARIFFS[0];

const formatEuro = (euro: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(euro);

const summaryText = (target: TariffCard) => {
  switch (target.id) {
    case "keiner":
      return "Kein laufender Beitrag mehr. Die Änderung wird zum nächsten Monat wirksam.";
    case "abo_klein":
    case "abo_gross":
      return `Monatlich zu zahlen: ${formatEuro(target.priceEuro)}. Die Änderung wird zum nächsten Monat wirksam, danach ist der nächste Wechsel erst im folgenden Quartal möglich.`;
    case "punktekarte":
      return `Einmalig zu zahlen: ${formatEuro(target.priceEuro)} einmalig. Die 10 Tage sind ab Aufladung 12 Monate gültig. Kein laufender Beitrag.`;
  }
};

const submitLabel = (target: TariffCard, current: CampaiAccessTariff | null) => {
  if (target.id === "punktekarte") {
    return current === "punktekarte" ? "Jetzt nachladen" : "Jetzt aufladen";
  }
  if (target.id === "keiner") {
    return "Abo beenden";
  }
  return current === "abo_klein" || current === "abo_gross"
    ? "Tarif wechseln"
    : "Abo abschließen";
};

export default function MonatsbeitragPage() {
  const { membership, loading } = useCampaiProfile();
  const current = membership?.tariff ?? null;

  // Solange nichts gewählt ist, steht die Auswahl auf dem aktuellen Tarif.
  const [picked, setPicked] = useState<CampaiAccessTariff | null>(null);
  const selected = picked ?? current;

  const target = selected ? tariffById(selected) : null;
  // Eine 10er Karte lässt sich nachladen, jeder andere Tarif ist schon gebucht.
  const unchanged = selected === current && selected !== "punktekarte";

  return (
    <div className="flex flex-col gap-10">
      <PageTitle
        backLink={{ href: "/account", label: "Zurück zum Account" }}
        eyebrow="Mitgliedschaft · Zugangskarte"
        eyebrowClassName="text-muted-foreground!"
        title="Dein Tarif"
        titleClassName="text-primary!"
        subTitle="Mit der Zugangskarte kannst du selbständig die Räume im Rosenwerk betreten. Sie beinhaltet nicht die freie Nutzung aller Maschinen und Materialien. Je nach Werkbereich können für die Nutzung bestimmter Maschinen zusätzliche Kosten anfallen und Einweisungen erforderlich sein."
        subTitleClassName="text-foreground!"
      />
      <div className="grid gap-x-5 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((group) => (
          <p
            key={group.id}
            className={cn(
              "knglmrt-label hidden border-b pb-3 tracking-[.13em] xl:block",
              group.span,
              GROUP_TEXT[group.id],
              GROUP_BORDER[group.id],
            )}
          >
            {group.label}
          </p>
        ))}

        {TARIFFS.map((tariff) => {
          const isSelected = selected === tariff.id;
          const isCurrent = current === tariff.id;

          return (
            <div
              key={tariff.id}
              onClick={() => setPicked(tariff.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-5 p-7 transition-colors",
                isSelected
                  ? cn(
                      "knglmrt-border border-foreground",
                      GROUP_SURFACE[tariff.group].selected,
                    )
                  : cn(
                      "border border-transparent bg-muted",
                      GROUP_SURFACE[tariff.group].hover,
                    ),
              )}
            >
              <p
                className={cn(
                  "knglmrt-label -mb-2 tracking-[.13em] xl:hidden",
                  GROUP_TEXT[tariff.group],
                )}
              >
                {groupLabel(tariff.group)}
              </p>

              <div className="flex min-h-14 items-start justify-between gap-3">
                <Face
                  number={tariff.face}
                  size={72}
                  title=""
                  className="text-foreground"
                />
                {isCurrent ? <Badge tone="gebucht">Dein Tarif</Badge> : null}
              </div>

              <div className="flex flex-col gap-3">
                <h2>{tariff.title}</h2>
                <p className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      "font-[family-name:var(--font-num)] text-[34px] leading-none font-bold",
                      PRICE_TEXT[tariff.group],
                    )}
                  >
                    {tariff.priceEuro} €
                  </span>
                  <span className="text-muted-foreground">
                    {tariff.priceUnit}
                  </span>
                </p>
              </div>

              <p className="text-foreground">{tariff.description}</p>

              <dl className="mt-auto">
                {tariff.details.map((detail) => (
                  <div
                    key={detail.label}
                    className="flex items-baseline justify-between gap-3 border-t border-border py-2.5"
                  >
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd className="knglmrt-num text-right text-foreground">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <Choice
                kind="radio"
                name="tarif"
                value={tariff.id}
                checked={isSelected}
                onChange={() => setPicked(tariff.id)}
                label={
                  isSelected ? "Ausgewählt" : isCurrent ? "Aktuell" : "Auswählen"
                }
              />
            </div>
          );
        })}
      </div>

      <section className="flex flex-wrap items-center justify-between gap-5 bg-muted px-7 py-6">
        <div className="min-w-0 flex-1">
          {target ? (
            <>
              <p className="font-bold text-foreground">
                {current && current !== target.id
                  ? `${tariffById(current).title} → ${target.title}`
                  : target.title}
              </p>
              <p className="text-muted-foreground">
                {unchanged
                  ? "Das ist dein aktueller Tarif."
                  : summaryText(target)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {loading
                ? "Dein aktueller Tarif wird geladen …"
                : "Dein aktueller Tarif ist gerade nicht abrufbar. Wähle oben einen Tarif."}
            </p>
          )}
        </div>
        {/* Noch ohne Aktion — Wechsel und Aufladen folgen. */}
        <Button
          type="button"
          kind="emphasis"
          size="large"
          disabled={!target || unchanged}
        >
          {target ? submitLabel(target, current) : "Tarif wählen"}
        </Button>
      </section>
    </div>
  );
}
