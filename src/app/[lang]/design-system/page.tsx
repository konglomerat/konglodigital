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
import Choice, { ChoiceGroup } from "@/components/knglmrt/Choice";
import Combobox from "@/components/knglmrt/Combobox";
import DataTable from "@/components/knglmrt/DataTable";
import Dialog, { DialogPanel } from "@/components/knglmrt/Dialog";
import Button, {
  type ButtonKind,
  type ButtonSize,
} from "@/components/knglmrt/Button";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import Field, { type FieldKind } from "@/components/knglmrt/Field";
import Hand from "@/components/knglmrt/Hand";
import Notice from "@/components/knglmrt/Notice";
import SearchField from "@/components/knglmrt/SearchField";
import SectionNav from "@/components/knglmrt/SectionNav";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import Select from "@/components/knglmrt/Select";
import StatTile from "@/components/knglmrt/StatTile";
import Stepper from "@/components/knglmrt/Stepper";
import Textarea from "@/components/knglmrt/Textarea";
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

const FIELD_KINDS: FieldKind[] = ["text", "mono", "hand"];

const WERKBEREICHE = [
  { value: "siebdruck", label: "Siebdruck", meta: "1. OG" },
  { value: "holz", label: "Holzwerkstatt", meta: "EG" },
  { value: "metall", label: "Metallwerkstatt", meta: "Hof" },
  { value: "3d", label: "3D-Druck", meta: "1. OG" },
  { value: "textil", label: "Textil", meta: "gesperrt", disabled: true },
];

const MASCHINEN = [
  { value: "kreissaege", label: "Kreissäge", meta: "Holz" },
  { value: "bandsaege", label: "Bandsäge", meta: "Holz" },
  { value: "drehbank", label: "Drehbank", meta: "Metall" },
  { value: "lasercutter", label: "Lasercutter", meta: "Digital" },
];

// Beispielzeilen für die DataTable — erfundene, aber plausible Buchungen.
type Buchung = {
  tag: string;
  wer: string;
  maschine: string;
  zeit: string;
  status: BadgeTone;
  eigene?: boolean;
  storniert?: boolean;
};

const BUCHUNGEN: Buchung[] = [
  {
    tag: "2026-08-24",
    wer: "Ada Lovelace",
    maschine: "Kreissäge",
    zeit: "09:00–12:00",
    status: "gebucht",
    eigene: true,
  },
  {
    tag: "2026-08-25",
    wer: "Grace Hopper",
    maschine: "Lasercutter",
    zeit: "13:00–15:00",
    status: "offen",
  },
  {
    tag: "2026-08-26",
    wer: "Alan Turing",
    maschine: "Drehbank",
    zeit: "10:00–11:30",
    status: "wartet",
  },
  {
    tag: "2026-08-27",
    wer: "Hedy Lamarr",
    maschine: "Bandsäge",
    zeit: "16:00–18:00",
    status: "neutral",
    storniert: true,
  },
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
  const [bereich, setBereich] = useState("");
  const [maschine, setMaschine] = useState("");
  const [suche, setSuche] = useState("Siebdruck");
  const [dauer, setDauer] = useState(3);
  const [notiz, setNotiz] = useState("Absaugung läuft unrund.");
  const [absaugung, setAbsaugung] = useState(true);
  const [einweisung, setEinweisung] = useState<"ja" | "nein">("ja");
  const [erinnerung, setErinnerung] = useState(false);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [dangerOffen, setDangerOffen] = useState(false);

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
        title="Field"
        source="components/knglmrt/Field.tsx"
        hint="Das beschriftete Eingabefeld — die Grundform aller anderen Felder. Fokus färbt Kontur und Beschriftung pink, ein Fehler tut dasselbe und stellt seinen Satz darunter."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          {FIELD_KINDS.map((kind) => (
            <Field
              key={kind}
              kind={kind}
              label={`kind="${kind}"`}
              defaultValue={kind === "mono" ? "2026-08-28" : "Werkstattpass"}
            />
          ))}
          <Field label="placeholder" placeholder="noch nichts eingetragen" />
          <Field label="required" required defaultValue="Ada Lovelace" />
          <Field
            label="hint"
            defaultValue="DE89 3704 0044 0532 0130 00"
            kind="mono"
            hint="Wird nur für die Beitragsabbuchung verwendet."
          />
          <Field
            label="error"
            defaultValue="ada@"
            error="Das ist keine vollständige Adresse."
          />
          <Field label="disabled" disabled defaultValue="Gesperrt" />
        </div>
      </Section>

      <Section
        title="Textarea"
        source="components/knglmrt/Textarea.tsx"
        hint="Das mehrzeilige Feld. Der Zähler sitzt rechts unter der Kante und läuft in Fira Mono — überschritten wird er pink."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <Textarea
            label="Anmerkung"
            value={notiz}
            max={140}
            onChange={(event) => setNotiz(event.target.value)}
            hint="Steht später in der Werkstatt am Gerät."
          />
          <Textarea
            label="error"
            defaultValue="zu kurz"
            rows={3}
            error="Bitte beschreibe, was genau kaputt ist."
          />
        </div>
      </Section>

      <Section
        title="Select"
        source="components/knglmrt/Select.tsx"
        hint="Geschlossen ein Field mit Caret, offen fällt die Liste mit pinker Kontur darüber. Auf/Zu, Tastatur und Klick nach außen macht die Komponente selbst."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <Select
            label="Werkbereich"
            value={bereich}
            options={WERKBEREICHE}
            onChange={setBereich}
            hint="Die letzte Zeile ist disabled."
          />
          <Select
            label="error"
            value=""
            options={WERKBEREICHE}
            error="Ohne Werkbereich geht die Buchung nicht raus."
          />
          <Select
            label="disabled"
            disabled
            value="siebdruck"
            options={WERKBEREICHE}
          />
        </div>
      </Section>

      <Section
        title="Combobox"
        source="components/knglmrt/Combobox.tsx"
        hint="Tippen und wählen. Der getippte Teil jeder Zeile bleibt fett und pink stehen; gefiltert wird im Feld, solange keine eigene filter-Funktion kommt."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <Combobox
            label="Maschine"
            value={maschine}
            options={MASCHINEN}
            onChange={setMaschine}
            hint="Tippe „säge“."
          />
        </div>
      </Section>

      <Section
        title="SearchField"
        source="components/knglmrt/SearchField.tsx"
        hint="Lupe links, Trefferzahl und Kreuz rechts. Beide Zeichen sind geometrisch — gezeichnetes Material gibt es erst ab 40px."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <SearchField
            value={suche}
            count="4 Treffer"
            onChange={(event) => setSuche(event.target.value)}
            onClear={() => setSuche("")}
          />
          <SearchField
            value=""
            size="small"
            tone="quiet"
            placeholder='size="small" tone="quiet"'
            onChange={() => {}}
          />
        </div>
      </Section>

      <Section
        title="Stepper"
        source="components/knglmrt/Stepper.tsx"
        hint="Zahl zwischen zwei Tasten, alles in einer Kontur. Der Wert ist tippbar — zwölf Stunden klickt niemand zwölfmal."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <Stepper
            label="Dauer"
            value={dauer}
            unit="h"
            min={1}
            max={12}
            onChange={setDauer}
            hint="min={1} max={12}"
          />
          <Stepper
            label="disabled"
            disabled
            value={2}
            unit="h"
            onChange={() => {}}
          />
        </div>
      </Section>

      <Section
        title="Choice"
        source="components/knglmrt/Choice.tsx"
        hint="Kästchen, Punkt und Schalter — quadratisch mit Absicht. Darunter liegt ein echtes Feld, die Optik hängt an peer-*."
      >
        <div className="grid max-w-[840px] gap-8 sm:grid-cols-2">
          <ChoiceGroup label="checkbox" hint="Mehrfachauswahl.">
            <Choice
              label="Absaugung nötig"
              checked={absaugung}
              onChange={(event) => setAbsaugung(event.target.checked)}
            />
            <Choice
              label="Einweisung vorhanden"
              hint="Zweite Zeile über hint."
              checked={false}
              onChange={() => {}}
            />
            <Choice label="disabled" disabled checked readOnly />
          </ChoiceGroup>

          <ChoiceGroup label="radio" row>
            {(["ja", "nein"] as const).map((option) => (
              <Choice
                key={option}
                kind="radio"
                name="ds-einweisung"
                label={option}
                checked={einweisung === option}
                onChange={() => setEinweisung(option)}
              />
            ))}
          </ChoiceGroup>

          <ChoiceGroup label="switch">
            <Choice
              kind="switch"
              label="Erinnerung schicken"
              checked={erinnerung}
              onChange={(event) => setErinnerung(event.target.checked)}
            />
            <Choice kind="switch" label="disabled" disabled checked readOnly />
          </ChoiceGroup>
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
        title="DataTable"
        source="components/knglmrt/DataTable.tsx"
        hint="Dieselbe Tabelle wie oben, nur aus Daten statt aus Markup: Spalten beschreiben, Zeilen durchreichen. Eine Spalte rendert, was sie will — das Badge unten ist ein Badge, keine Prop."
      >
        <DataTable
          columns={[
            {
              key: "tag",
              label: "Tag",
              width: "150px",
              mono: true,
              cell: (row) => row.tag,
            },
            { key: "wer", label: "Wer", cell: (row) => row.wer },
            {
              key: "maschine",
              label: "Maschine",
              width: "170px",
              cell: (row) => row.maschine,
            },
            {
              key: "zeit",
              label: "Zeit",
              width: "160px",
              mono: true,
              cell: (row) => row.zeit,
            },
            {
              key: "status",
              label: "Status",
              width: "130px",
              cell: (row) => <Badge tone={row.status}>{row.status}</Badge>,
            },
          ]}
          rows={BUCHUNGEN}
          rowKey={(row) => row.tag}
          zebra
          rowTone={(row) => (row.eigene ? "rosa" : undefined)}
          rowMuted={(row) => Boolean(row.storniert)}
          footer={
            <>
              <Td colSpan={4}>Summe</Td>
              <Td className="knglmrt-num text-right">4 Buchungen</Td>
            </>
          }
        />
        <p className="mt-3 text-muted-foreground">
          zebra · rowTone=&quot;rosa&quot; auf der eigenen Zeile · rowMuted auf
          der stornierten · footer
        </p>

        <div className="mt-8 max-w-[520px]">
          <DataTable
            columns={[
              { key: "wer", label: "Wer", cell: (row: Buchung) => row.wer },
              {
                key: "zeit",
                label: "Zeit",
                width: "160px",
                mono: true,
                cell: (row: Buchung) => row.zeit,
              },
            ]}
            rows={[]}
            empty="Für diese Woche ist nichts gebucht."
          />
          <code className="knglmrt-num mt-2 block text-muted-foreground">
            rows={"{[]}"} · empty
          </code>
        </div>
      </Section>

      <Section
        title="Dialog"
        source="components/knglmrt/Dialog.tsx"
        hint="Eine Entscheidung, gerahmt: pinke Kappe, Kontur, der eine 3px-Offset-Schatten der Ansicht. Escape, Klick auf den Hintergrund und der Fokus zurück an die auslösende Taste gehören dazu."
      >
        <div className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-6">
          <Sample label="open">
            <Button kind="secondary" onClick={() => setDialogOffen(true)}>
              Dialog öffnen
            </Button>
          </Sample>
          <Sample label='tone="danger"'>
            <Button
              kind="danger-secondary"
              onClick={() => setDangerOffen(true)}
            >
              Löschen-Dialog öffnen
            </Button>
          </Sample>
        </div>

        <p className="mb-3 text-muted-foreground">
          Derselbe Rahmen ohne Hintergrund — DialogPanel, für Seiten, die ihn
          selbst platzieren:
        </p>
        <DialogPanel
          title="Buchung stornieren"
          text="Der Platz geht zurück in den Kalender und die Werkstatt sieht ihn sofort wieder als frei."
          footer={
            <>
              <Button kind="secondary">Behalten</Button>
              <Button kind="primary">Stornieren</Button>
            </>
          }
        />

        <Dialog
          open={dialogOffen}
          title="Buchung stornieren"
          text="Der Platz geht zurück in den Kalender und die Werkstatt sieht ihn sofort wieder als frei."
          confirmLabel="Stornieren"
          cancelLabel="Behalten"
          onConfirm={() => setDialogOffen(false)}
          onCancel={() => setDialogOffen(false)}
        />
        <Dialog
          open={dangerOffen}
          tone="danger"
          title="Beleg löschen"
          text="Der Beleg verschwindet endgültig, auch aus der Abrechnung des Monats."
          confirmLabel="Endgültig löschen"
          cancelLabel="Abbrechen"
          onConfirm={() => setDangerOffen(false)}
          onCancel={() => setDangerOffen(false)}
        />
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
        hint="Aus dem Export fehlen im Projekt noch Avatar und Card. Die Formularfelder und die Tabelle stehen — die alten Felder unter src/app/[lang]/components/ui/ laufen bis zur Umstellung weiter."
      >
        <div className="flex flex-wrap gap-2">
          {["Avatar", "Card"].map((name) => (
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
