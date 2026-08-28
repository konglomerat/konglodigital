// src/app/[lang]/design-system/page.tsx — der Musterbogen.
// Zeigt jede Komponente aus src/components/knglmrt/ mit allen Varianten, die
// sie kennt. Kein eigenes Styling: was hier steht, kommt aus den Komponenten
// selbst — fällt eine Variante aus dem Rahmen, sieht man es auf dieser Seite
// zuerst.
"use client";

import { useState } from "react";
import {
  faArrowRight,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import PageTitle from "../components/PageTitle";
import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";
import Button, {
  type ButtonKind,
  type ButtonSize,
} from "@/components/knglmrt/Button";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import Hand from "@/components/knglmrt/Hand";
import Notice from "@/components/knglmrt/Notice";
import SectionNav from "@/components/knglmrt/SectionNav";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import StatTile from "@/components/knglmrt/StatTile";
import {
  Table,
  TBody,
  Td,
  TFoot,
  THead,
  Th,
  Tr,
} from "@/components/knglmrt/Table";

const BUTTON_KINDS: ButtonKind[] = [
  "primary",
  "secondary",
  "emphasis",
  "quiet",
  "ghost",
  "tertiary",
  "danger-primary",
  "danger-secondary",
];

const BUTTON_SIZES: ButtonSize[] = ["chip", "small", "medium", "large"];

const BADGE_TONES: BadgeTone[] = [
  "offen",
  "wartet",
  "gebucht",
  "neutral",
  "neu",
  "kontur",
];

const NOTICE_TONES = ["rosa", "gelb", "blau", "grau"] as const;
const STAT_TONES = ["weiss", "grau", "rosa"] as const;
const DIVIDER_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

// Die Bibliothek der gezeichneten Figuren ist im Bundle auf die tatsächlich
// genutzten Motive gekürzt (siehe doodle-figures.ts) — mehr gibt es hier nicht
// zu zeigen.
const FACE_NUMBERS = [6, 19] as const;
const HAND_NUMBERS = [4] as const;

/** Ein Abschnitt: Überschrift, Einordnung, darunter die Muster. */
function Section({
  title,
  source,
  hint,
  children,
}: {
  title: string;
  source: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="knglmrt-caption mb-1 text-[var(--knglmrt-brown-100)]">
        {title}
      </h2>
      <p className="knglmrt-num mb-1 text-muted-foreground">{source}</p>
      {hint ? (
        <p className="mb-3 max-w-[640px] text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mb-4 max-w-[320px]">
        <Divider height={7} color="var(--primary)" />
      </div>
      {children}
    </section>
  );
}

/** Ein einzelnes Muster mit seinem Prop-Wert darunter. */
function Sample({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex min-h-[44px] items-center">{children}</div>
      <code className="knglmrt-num text-muted-foreground">{label}</code>
    </div>
  );
}

export default function DesignSystemPage() {
  const [segment, setSegment] = useState<"liste" | "karte">("liste");

  return (
    <div>
      <PageTitle
        eyebrow="Musterbogen"
        title="Design System"
        subTitle="Jede Komponente aus src/components/knglmrt/ mit allen Varianten, die sie kennt. Wer etwas Neues baut, nimmt es von hier — und trägt es hier nach."
        className="mb-10"
      />

      <Section
        title="Button"
        source="components/knglmrt/Button.tsx"
        hint="Acht Varianten, vier Größen. Größe und Variante sind unabhängig: eine kleine primäre Taste bleibt pink."
      >
        <div className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-6">
          {BUTTON_KINDS.map((kind) => (
            <Sample key={kind} label={`kind="${kind}"`}>
              <Button kind={kind}>Platz buchen</Button>
            </Sample>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-6">
          {BUTTON_SIZES.map((size) => (
            <Sample key={size} label={`size="${size}"`}>
              <Button kind="secondary" size={size}>
                Platz buchen
              </Button>
            </Sample>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <Sample label="icon">
            <Button kind="primary" icon={faPlus}>
              Hinzufügen
            </Button>
          </Sample>
          <Sample label='iconPosition="right"'>
            <Button kind="primary" icon={faArrowRight} iconPosition="right">
              Weiter
            </Button>
          </Sample>
          <Sample label="icon={<Face />}">
            <Button kind="secondary" icon={<Face number={6} size={24} />}>
              Verwaltung
            </Button>
          </Sample>
          <Sample label="iconOnly">
            <Button
              kind="danger-secondary"
              iconOnly
              icon={faTrash}
              aria-label="Löschen"
            />
          </Sample>
          <Sample label="loading">
            <Button kind="primary" loading>
              Wird gespeichert
            </Button>
          </Sample>
          <Sample label="disabled">
            <Button kind="primary" disabled>
              Gesperrt
            </Button>
          </Sample>
          <Sample label="href">
            <Button kind="secondary" href="/design-system">
              Als Link
            </Button>
          </Sample>
        </div>

        <div className="mt-8 max-w-[420px]">
          <Sample label="fullWidth">
            <Button kind="primary" fullWidth>
              Über die ganze Zeile
            </Button>
          </Sample>
        </div>
      </Section>

      <Section
        title="SegmentedControl"
        source="components/knglmrt/SegmentedControl.tsx"
        hint="Eine Zeile, mehrere Schalter, genau einer aktiv. Die Segmente sind Buttons, die Kontur sitzt am Rahmen."
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <Sample label={`value="${segment}"`}>
            <SegmentedControl
              value={segment}
              onChange={setSegment}
              options={[
                { value: "liste" as const, label: "Liste" },
                { value: "karte" as const, label: "Karte" },
              ]}
            />
          </Sample>
          <Sample label='size="small"'>
            <SegmentedControl
              value={segment}
              size="small"
              onChange={setSegment}
              options={[
                { value: "liste" as const, label: "Liste" },
                { value: "karte" as const, label: "Karte" },
              ]}
            />
          </Sample>
        </div>
      </Section>

      <Section
        title="Badge"
        source="components/knglmrt/Badge.tsx"
        hint="Statusmarke, 10px uppercase, nie rund. Die Palette kennt kein Grün und kein Rot — Status läuft über die Tints."
      >
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          {BADGE_TONES.map((tone) => (
            <Sample key={tone} label={`tone="${tone}"`}>
              <Badge tone={tone}>{tone}</Badge>
            </Sample>
          ))}
        </div>
      </Section>

      <Section
        title="Notice"
        source="components/knglmrt/Notice.tsx"
        hint="Tint-Block ohne Kontur und ohne Rundung, optional mit Kopfzeile."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {NOTICE_TONES.map((tone) => (
            <div key={tone}>
              <Notice tone={tone} title={`tone="${tone}"`}>
                Absaugung ist defekt, Ersatzteil kommt Freitag.
              </Notice>
            </div>
          ))}
          <div>
            <Notice tone="grau">Ohne Kopfzeile — nur der Satz.</Notice>
          </div>
        </div>
      </Section>

      <Section
        title="StatTile"
        source="components/knglmrt/StatTile.tsx"
        hint="Eine Zahl, ein Label, optional ein Balken. Zahlen laufen in Fira Mono."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_TONES.map((tone) => (
            <StatTile
              key={tone}
              tone={tone}
              label={`tone="${tone}"`}
              value="128"
              hint="letzte 30 Tage"
            />
          ))}
          <StatTile
            label="percent={62}"
            value="62 %"
            percent={62}
            hint="Materialbudget"
          />
        </div>
      </Section>

      <Section
        title="Table"
        source="components/knglmrt/Table.tsx"
        hint="Primitive statt einer fertigen Tabelle: Table · THead · Th · TBody · Tr · Td · TFoot · TableEmpty."
      >
        <Table>
          <THead>
            <Th>Werkbereich</Th>
            <Th>Status</Th>
            <Th className="text-right">Betrag</Th>
          </THead>
          <TBody>
            <Tr interactive>
              <Td>Siebdruck</Td>
              <Td>
                <Badge tone="gebucht">gebucht</Badge>
              </Td>
              <Td className="knglmrt-num text-right">24,00 €</Td>
            </Tr>
            <Tr interactive>
              <Td>Holzwerkstatt</Td>
              <Td>
                <Badge tone="offen">offen</Badge>
              </Td>
              <Td className="knglmrt-num text-right">96,50 €</Td>
            </Tr>
          </TBody>
          <TFoot>
            <Td colSpan={2}>Summe</Td>
            <Td className="knglmrt-num text-right">120,50 €</Td>
          </TFoot>
        </Table>
      </Section>

      <Section
        title="SectionNav"
        source="components/knglmrt/SectionNav.tsx"
        hint="Bereichsnavigation als eckige Chips: aktiv schwarze Fläche, sonst Kontur."
      >
        <SectionNav
          ariaLabel="Beispiel-Bereichsnavigation"
          activeKey="profil"
          items={[
            { key: "profil", label: "Profil", href: "/design-system" },
            { key: "beitrag", label: "Beitrag", href: "/design-system" },
            { key: "belege", label: "Belege", href: "/design-system" },
          ]}
        />
      </Section>

      <Section
        title="Breadcrumbs"
        source="components/knglmrt/Breadcrumbs.tsx"
        hint="Fira Mono 12/16, Trenner ' / ', der letzte Eintrag ohne Link."
      >
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Verwaltung", href: "/design-system" },
            { label: "Design System" },
          ]}
        />
      </Section>

      <Section
        title="Divider"
        source="components/knglmrt/Divider.tsx"
        hint="Sechs gezeichnete Linien. Als CSS-Maske gerendert, nimmt also jede Farbe an."
      >
        <div className="flex max-w-[520px] flex-col gap-6">
          {DIVIDER_NUMBERS.map((number) => (
            <div key={number}>
              <Divider number={number} color="var(--primary)" />
              <code className="knglmrt-num mt-2 block text-muted-foreground">
                number={number}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Face / Hand"
        source="components/knglmrt/Face.tsx · Hand.tsx"
        hint="Die gezeichneten Figuren. Im Bundle liegen nur die tatsächlich genutzten Motive — die volle Bibliothek hat 93 Einträge und gehört nicht hierher."
      >
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          {FACE_NUMBERS.map((number) => (
            <Sample key={`face-${number}`} label={`Face number={${number}}`}>
              <Face number={number} size={76} />
            </Sample>
          ))}
          {HAND_NUMBERS.map((number) => (
            <Sample key={`hand-${number}`} label={`Hand number={${number}}`}>
              <Hand number={number} size={76} />
            </Sample>
          ))}
          <Sample label='color="var(--primary)"'>
            <Face number={6} size={76} color="var(--primary)" />
          </Sample>
          <Sample label="flip">
            <Hand number={4} size={76} flip />
          </Sample>
        </div>
      </Section>

      <Section
        title="Noch nicht portiert"
        source="public/branding/controls_surfaces_tables-export/react/ui/"
        hint="Aus dem Export fehlen im Projekt noch: Field, Select, Combobox, SearchField, Textarea, Stepper, Choice, Avatar, Card, Dialog. Die Formularfelder laufen bis dahin über src/app/[lang]/components/ui/form."
      >
        <div className="flex flex-wrap gap-2">
          {[
            "Field",
            "Select",
            "Combobox",
            "SearchField",
            "Textarea",
            "Stepper",
            "Choice",
            "Avatar",
            "Card",
            "Dialog",
          ].map((name) => (
            <Badge key={name} tone="neutral">
              {name}
            </Badge>
          ))}
        </div>
      </Section>

      <Section
        title="Icon-Taste im Kontext"
        source="components/knglmrt/Button.tsx"
        hint="Die stille Variante bleibt im Ruhezustand unsichtbar und meldet sich erst beim Überfahren."
      >
        <div className="flex flex-wrap items-center gap-2 knglmrt-border bg-card px-3 py-2">
          <span className="mr-auto">Beleg 2026-0042</span>
          <Button kind="ghost" iconOnly icon={faPlus} aria-label="Hinzufügen" />
          <Button kind="ghost" iconOnly icon={faTrash} aria-label="Löschen" />
          <Button kind="ghost" iconOnly icon={faXmark} aria-label="Schließen" />
        </div>
      </Section>
    </div>
  );
}
