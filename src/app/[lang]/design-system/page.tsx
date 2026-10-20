// src/app/[lang]/design-system/page.tsx — der Musterbogen.
// Zeigt jede Komponente aus src/components/knglmrt/ mit allen Varianten, die
// sie kennt. Kein eigenes Styling: was hier steht, kommt aus den Komponenten
// selbst — fällt eine Variante aus dem Rahmen, sieht man es auf dieser Seite
// zuerst.
"use client";

import { useEffect, useState } from "react";
import {
  faArrowRight,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import * as solidIcons from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import PageTitle from "../components/PageTitle";
import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";
import Choice, { ChoiceGroup } from "@/components/knglmrt/Choice";
import Combobox from "@/components/knglmrt/Combobox";
import MultiSelect from "@/components/knglmrt/MultiSelect";
import DataTable from "@/components/knglmrt/DataTable";
import Dialog, { DialogPanel } from "@/components/knglmrt/Dialog";
import Button, {
  type ButtonKind,
  type ButtonSize,
} from "@/components/knglmrt/Button";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import Field, { type FieldKind } from "@/components/knglmrt/Field";
import FieldShell from "@/components/knglmrt/FieldShell";
import FormSection from "@/components/knglmrt/FormSection";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Hand from "@/components/knglmrt/Hand";
import { DOODLE_FIGURES } from "@/components/knglmrt/doodle-figures";
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

// Die Palette aus knglmrt-theme.css — Ebene 1, die einzige Stelle mit
// Hex-Werten. Die Rampe läuft 100 / 60 / 30 (Prozent-Tints).
type ColorToken = { name: string; note?: string };
type ColorFamily = { name: string; tokens: ColorToken[] };

const PALETTE: ColorFamily[] = [
  {
    name: "pink",
    tokens: [
      { name: "--knglmrt-pink-100", note: "Markenfarbe, nur Akzent" },
      { name: "--knglmrt-pink-60" },
      { name: "--knglmrt-pink-30" },
      { name: "--knglmrt-pink-15", note: "zarte Kachelkontur" },
    ],
  },
  {
    name: "yellow",
    tokens: [
      { name: "--knglmrt-yellow-120", note: "Hover, trägt weiße Schrift" },
      { name: "--knglmrt-yellow-100", note: "Erinnerung, Konfetti" },
      { name: "--knglmrt-yellow-60" },
      { name: "--knglmrt-yellow-30" },
    ],
  },
  {
    name: "blue",
    tokens: [
      { name: "--knglmrt-blue-100", note: "kühle Tints, Konfetti" },
      { name: "--knglmrt-blue-60" },
      { name: "--knglmrt-blue-30" },
    ],
  },
  {
    name: "green",
    tokens: [
      { name: "--knglmrt-green-100", note: "success" },
      { name: "--knglmrt-green-60" },
      { name: "--knglmrt-green-30" },
    ],
  },
  {
    name: "red",
    tokens: [
      { name: "--knglmrt-red-100", note: "destructive" },
      { name: "--knglmrt-red-60" },
      { name: "--knglmrt-red-30" },
    ],
  },
  {
    name: "brown",
    tokens: [
      { name: "--knglmrt-brown-120", note: "Hover, trägt weiße Schrift" },
      { name: "--knglmrt-brown-100", note: "Handschrift, Link-Hover" },
      { name: "--knglmrt-brown-60" },
      { name: "--knglmrt-brown-30" },
    ],
  },
  {
    name: "dark",
    tokens: [
      { name: "--knglmrt-dark-100", note: "invertierte Flächen, Fließtext" },
      { name: "--knglmrt-dark-60", note: "stille Schrift" },
      { name: "--knglmrt-dark-30", note: "Haarlinien" },
    ],
  },
  {
    name: "ink",
    tokens: [
      { name: "--knglmrt-ink", note: "Artwork und Kontur" },
      { name: "--knglmrt-ink-soft", note: "nur Werkbereich-Marken" },
    ],
  },
  {
    name: "paper",
    tokens: [
      { name: "--knglmrt-paper", note: "das Blatt" },
      { name: "--knglmrt-paper-pink", note: "Tint-Band" },
      { name: "--knglmrt-paper-grey", note: "Summenzeilen" },
    ],
  },
  {
    name: "tint",
    tokens: [
      { name: "--knglmrt-tint-avatar", note: "unter dem Gesicht im Avatar" },
      { name: "--knglmrt-tint-zebra", note: "Zebra-Zeile in DataTable" },
      { name: "--knglmrt-tint-quiet-hover", note: "leise Taste, gehovert" },
    ],
  },
];

const PALETTE_TOKENS = PALETTE.flatMap((family) => family.tokens);

const BUTTON_KINDS: ButtonKind[] = [
  "primary",
  "secondary",
  "emphasis",
  "quiet",
  "ghost",
  "tertiary",
  "admin",
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

// Die Terrazzo-Flächen aus knglmrt-theme.css (.knglmrt-terrazzo-*). Im Dark
// Mode fallen sie alle auf die neutrale Kartenfläche zurück.
const TERRAZZO_CLASSES = [
  { name: "fein-rosa", note: "fein, zartrosa – Standard" },
  { name: "grob-rosa", note: "grob, zartrosa" },
  { name: "grob-blau", note: "grob, hellblau" },
  { name: "grob-grau", note: "grob, warmgrau" },
  { name: "grob-hellgrau", note: "grob, kühles Hellgrau" },
  { name: "hellgelb", note: "grob, cremegelb" },
  { name: "kraeftig-gelb", note: "grob, Akzentfläche" },
  { name: "kraeftig-blau", note: "grob, Akzentfläche" },
  { name: "kraeftig-pink", note: "grob, Akzentfläche" },
];

// Alle Font-Awesome-Icons, die irgendwo in src/ verwendet werden.
const USED_ICONS = [
  "Binary",
  "faAddressBook",
  "faArrowDown",
  "faArrowLeft",
  "faArrowRight",
  "faArrowRotateLeft",
  "faArrowTrendDown",
  "faArrowTrendUp",
  "faArrowUp",
  "faArrowUpRightFromSquare",
  "faArrowsLeftRight",
  "faArrowsRotate",
  "faBan",
  "faBars",
  "faBolt",
  "faBoxOpen",
  "faBoxesStacked",
  "faBullhorn",
  "faCalendarCheck",
  "faCalendarDays",
  "faCamera",
  "faCar",
  "faChartPie",
  "faCheck",
  "faChevronDown",
  "faChevronLeft",
  "faChevronRight",
  "faChevronUp",
  "faCircleCheck",
  "faCircleExclamation",
  "faCircleInfo",
  "faClipboardCheck",
  "faClock",
  "faClone",
  "faCodeCompare",
  "faColumns",
  "faCopy",
  "faCouch",
  "faCube",
  "faCubesStacked",
  "faDesktop",
  "faDiagramProject",
  "faDisplay",
  "faDoorOpen",
  "faDownload",
  "faEllipsis",
  "faEnvelope",
  "faEuroSign",
  "faFileArrowDown",
  "faFileArrowUp",
  "faFileCircleCheck",
  "faFileCirclePlus",
  "faFileImport",
  "faFileInvoice",
  "faFileLines",
  "faFilePdf",
  "faFileSignature",
  "faFilter",
  "faFloppyDisk",
  "faFolderOpen",
  "faGear",
  "faGears",
  "faGraduationCap",
  "faGripVertical",
  "faHammer",
  "faHandshake",
  "faHouse",
  "faIndustry",
  "faKey",
  "faLaptop",
  "faLayerGroup",
  "faLink",
  "faList",
  "faListCheck",
  "faLocationDot",
  "faMagnifyingGlass",
  "faMap",
  "faMicrochip",
  "faMicrophone",
  "faMinus",
  "faMobileScreen",
  "faMoneyBillTransfer",
  "faMoon",
  "faMusic",
  "faNoteSticky",
  "faPalette",
  "faPaperPlane",
  "faPen",
  "faPenToSquare",
  "faPercent",
  "faPlug",
  "faPlus",
  "faReceipt",
  "faRepeat",
  "faRightLeft",
  "faRotate",
  "faRotateLeft",
  "faSatellite",
  "faSave",
  "faScrewdriverWrench",
  "faShieldHalved",
  "faShirt",
  "faSliders",
  "faSort",
  "faSortDown",
  "faSortUp",
  "faSpinner",
  "faSun",
  "faTable",
  "faTableCellsLarge",
  "faTabletScreenButton",
  "faTag",
  "faTent",
  "faTrash",
  "faTree",
  "faTriangleExclamation",
  "faUpRightFromSquare",
  "faUser",
  "faUsers",
  "faVolumeHigh",
  "faWandMagicSparkles",
  "faWarehouse",
  "faXmark",
  "file",
  "matches",
  "src/app/api/admin/story-image/samplecover.png",
] as const;

const BRAND_MARKS = [
  "logo/KNGLMRT_Bildmarke.svg",
  "logo/KNGLMRT_Wortmarke.svg",
  "KNGLMRT_Wortbildmarke_hoch.png",
  "logo/konglodigital-logo.svg",
  "logo/konglodigital-logo-white.svg",
];

const WERKBEREICH_MARKS = [
  "3d-druck.svg",
  "beton.png",
  "buchdruck.svg",
  "cnc.svg",
  "elektronik.svg",
  "foto-film.svg",
  "holz.svg",
  "k.svg",
  "laser.png",
  "materialvermittung.svg",
  "printshop.svg",
  "siebdruck.svg",
  "textil.svg",
];

// Alle Motive, die im Bundle liegen (doodle-figures.ts), aufsteigend.
const figureNumbers = (prefix: "Faces" | "Hands") =>
  Object.keys(DOODLE_FIGURES)
    .filter((key) => key.startsWith(prefix))
    .map((key) => Number(key.slice(prefix.length)))
    .sort((a, b) => a - b);
const FACE_NUMBERS = figureNumbers("Faces");
const HAND_NUMBERS = figureNumbers("Hands");

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

// Alle Textstile, die verwendet werden dürfen — von groß nach klein. Größen
// stehen ausschließlich in knglmrt-theme.css (--ui-size-*); Komponenten nehmen
// die Klasse oder das Element, keine eigenen Pixelwerte. Kleiner als der
// Fließtext sind nur Caption, Num, Label und Tag — und die nie für Fließtext.
const TYPE_STYLES: {
  name: string;
  /** Wie man den Stil bekommt: Element oder Klasse. */
  usage: string;
  use: string;
  sample: string;
  as: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
}[] = [
  {
    name: "Seitentitel",
    usage: "<h1> · PageTitle",
    use: "Ein Titel pro Seite.",
    sample: "Design System",
    as: "h1",
  },
  {
    name: "Sektion",
    usage: "<h2>",
    use: "Überschrift eines Seitenabschnitts, z. B. „Für Mitglieder“.",
    sample: "Was gibt’s Neues",
    as: "h2",
  },
  {
    name: "Lead",
    usage: ".knglmrt-lead",
    use: "Einleitender Satz unter einem großen Titel.",
    sample: "Hier findest du alles zur Werkstatt.",
    as: "p",
    className: "knglmrt-lead",
  },
  {
    name: "Kartentitel",
    usage: "<h3> · .knglmrt-card-title",
    use: "Titel in Karten, Kacheln und Unterabschnitten.",
    sample: "Ehrenamtsbonus beantragen",
    as: "h3",
  },
  {
    name: "Fließtext",
    usage: "<p> (body)",
    use: "Alles Lesbare: Absätze, Beschreibungen, Kacheltexte. Die Untergrenze für Text.",
    sample: "Stunden für den Verein auf den Beitrag anrechnen.",
    as: "p",
  },
  {
    name: "Augenbraue",
    usage: ".knglmrt-caption",
    use: "Die einzige Augenbraue: über Titeln (PageTitle, Hero), Abschnittsmarken.",
    sample: "Musterbogen",
    as: "p",
    className: "knglmrt-caption text-primary",
  },
  {
    name: "Daten",
    usage: ".knglmrt-num",
    use: "Daten, Zeiten, Beträge, IDs, Mitgliedsnummer.",
    sample: "Mitglied seit 03/2024 · Nr. 0187",
    as: "span",
    className: "knglmrt-num",
  },
  {
    name: "Kennzahl",
    usage: ".knglmrt-value",
    use: "Die eine Zahl auf einer StatTile.",
    sample: "48,00 €",
    as: "span",
    className: "knglmrt-value",
  },
  {
    name: "Label",
    usage: ".knglmrt-label",
    use: "Beschriftung von Feldern und StatTiles.",
    sample: "E-Mail-Adresse",
    as: "span",
    className: "knglmrt-label",
  },
  {
    name: "Tag",
    usage: ".knglmrt-tag · Badge",
    use: "Nur in Statusmarken. Kleinste Größe im System.",
    sample: "Coming Soon",
    as: "span",
    className: "knglmrt-tag",
  },
];

// Spalten der Typografie-Tabelle: Muster, Stil, Schrift, Größe, Zeilenhöhe, Gewicht.
const TYPE_GRID =
  "grid gap-x-6 gap-y-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_150px_60px_100px_70px] md:items-baseline";

/** Kopf der Typografie-Tabelle. */
function TypeHeader() {
  return (
    <div className={`${TYPE_GRID} hidden border-b border-border pb-2 md:grid`}>
      {["Muster", "Stil", "Schrift", "Größe", "Zeilenhöhe", "Gewicht"].map((label) => (
        <span key={label} className="knglmrt-label text-muted-foreground">
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Eine Zeile der Typografie: Muster, Name und Verwendung, dann die
 * gemessenen Werte — dicht wie eine Tabelle, damit alle Stile auf einen
 * Blick passen.
 */
function TypeRow({ style }: { style: (typeof TYPE_STYLES)[number] }) {
  const [metrics, setMetrics] = useState<{
    family: string;
    size: string;
    lineHeight: string;
    weight: string;
  } | null>(null);
  const Tag = style.as;

  return (
    <div className={`${TYPE_GRID} border-b border-border py-2`}>
      <Tag
        ref={(element: HTMLElement | null) => {
          if (!element || metrics) return;
          // Gemessen statt abgeschrieben: was hier steht, ist, was rendert.
          const computed = getComputedStyle(element);
          const lineHeight = parseFloat(computed.lineHeight);
          setMetrics({
            family: computed.fontFamily.split(",")[0].replace(/["']/g, ""),
            size: `${parseFloat(computed.fontSize)}px`,
            lineHeight: lineHeight ? `${lineHeight}px` : "normal",
            weight: computed.fontWeight,
          });
        }}
        className={`m-0 truncate ${style.className ?? ""}`}
      >
        {style.sample}
      </Tag>
      <p className="m-0 text-muted-foreground">
        <span className="font-bold text-foreground">{style.name}</span>{" "}
        <code className="knglmrt-num text-foreground">{style.usage}</code> —{" "}
        {style.use}
      </p>
      <code className="knglmrt-num truncate">{metrics?.family}</code>
      <code className="knglmrt-num">{metrics?.size}</code>
      <code className="knglmrt-num">{metrics?.lineHeight}</code>
      <code className="knglmrt-num">{metrics?.weight}</code>
    </div>
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

/**
 * Liest die aufgelösten Werte der Palette vom <html>-Element — einmal beim
 * Mount, damit unter jedem Feld der tatsächliche Hex-Wert steht.
 */
function useResolvedColors(names: string[]) {
  const [values, setValues] = useState<Record<string, string>>({});
  const key = names.join(",");

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const name of key.split(",")) {
      next[name] = style.getPropertyValue(name).trim();
    }
    setValues(next);
  }, [key]);

  return values;
}

/**
 * Eine Farbfamilie als Zeile: die Abstufungen nebeneinander, darunter Stufe
 * und Hex-Wert. Die Verwendung steht im Tooltip.
 */
function ColorRow({
  family,
  values,
}: {
  family: ColorFamily;
  values: Record<string, string>;
}) {
  const prefix = `--knglmrt-${family.name}`;
  return (
    <div className="flex items-start gap-3">
      <code className="knglmrt-num w-14 shrink-0 pt-2">{family.name}</code>
      <div className="grid flex-1 grid-cols-4 gap-px">
        {family.tokens.map((token) => {
          const step = token.name.replace(prefix, "").replace(/^-/, "") || "–";
          return (
            <div
              key={token.name}
              title={`${token.name}${token.note ? ` — ${token.note}` : ""}`}
            >
              <div
                className="knglmrt-border h-8 w-full"
                style={{ background: `var(${token.name})` }}
              />
              <code className="knglmrt-tag block truncate">
                {step}{" "}
                <span className="text-muted-foreground">
                  {values[token.name] || ""}
                </span>
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [segment, setSegment] = useState<"liste" | "karte">("liste");
  const [bereich, setBereich] = useState("");
  const [maschine, setMaschine] = useState("");
  const [maschinen, setMaschinen] = useState<string[]>(["bandsaege"]);
  const [suche, setSuche] = useState("Siebdruck");
  const [dauer, setDauer] = useState(3);
  const [notiz, setNotiz] = useState("Absaugung läuft unrund.");
  const [absaugung, setAbsaugung] = useState(true);
  const [einweisung, setEinweisung] = useState<"ja" | "nein">("ja");
  const [erinnerung, setErinnerung] = useState(false);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [dangerOffen, setDangerOffen] = useState(false);
  const values = useResolvedColors(PALETTE_TOKENS.map((t) => t.name));

  return (
    <div>
      <PageTitle
        eyebrow="Musterbogen"
        title="Design System"
        subTitle="Jede Komponente aus src/components/knglmrt/ mit allen Varianten, die sie kennt. Wer etwas Neues baut, nimmt es von hier — und trägt es hier nach."
        className="mb-10"
      />

      <Section
        title="Palette"
        source="src/app/knglmrt-theme.css"
        hint="Die Markenfarben — die einzige Stelle im Projekt mit Hex-Werten. Alles andere sind Rollen, die hierauf zeigen. Im Dark Mode unverändert."
      >
        <div className="grid max-w-[1100px] gap-x-8 gap-y-2 md:grid-cols-2">
          {PALETTE.map((family) => (
            <ColorRow key={family.name} family={family} values={values} />
          ))}
        </div>
      </Section>

      <Section
        title="Terrazzo"
        source="src/app/knglmrt-theme.css · public/branding/backgrounds"
        hint="Alle Flächenvarianten als Klasse .knglmrt-terrazzo-*. Im Dark Mode ersetzt die Kartenfläche das Muster."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TERRAZZO_CLASSES.map((t) => (
            <div key={t.name}>
              <div
                className={`knglmrt-border h-24 w-full knglmrt-terrazzo-${t.name}`}
              />
              <code className="knglmrt-num mt-1 block break-all">
                terrazzo-{t.name}
              </code>
              <p className="knglmrt-tag text-muted-foreground">{t.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Typografie"
        source="src/app/knglmrt-theme.css · --ui-size-*"
        hint="Alle Textstile, die es gibt — von groß nach klein. Größen nie als Pixelwert in Komponenten schreiben, sondern Element oder Klasse von hier nehmen. Fließtext (18px) ist die Untergrenze für alles Lesbare; kleiner sind nur Caption, Daten, Label und Tag."
      >
        <div className="max-w-[1300px]">
          <TypeHeader />
          {TYPE_STYLES.map((style) => (
            <TypeRow key={style.name} style={style} />
          ))}
        </div>
      </Section>

      <Section
        title="Button"
        source="components/knglmrt/Button.tsx"
        hint="Primary: volle Markenfarbe ohne Rahmen. Secondary: dieselbe Farbe mit 25 % Deckkraft, ebenfalls ohne Rahmen. Vier Größen, unabhängig von der Variante."
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
            counter={140}
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
        title="NativeSelect"
        source="components/knglmrt/NativeSelect.tsx"
        hint="Die Auswahl mit <option>-Kindern — für lange Kontenpläne und alles, was der Browser selbst besser scrollt. Gleicher Rahmen wie Field, das Dreieck des Browsers weicht dem Caret des Systems."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <NativeSelect label="Werkbereich" defaultValue="holz">
            {WERKBEREICHE.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            label="error"
            error="Bitte einen Werkbereich wählen."
            defaultValue=""
          >
            <option value="">Bitte auswählen…</option>
          </NativeSelect>
        </div>
      </Section>

      <Section
        title="FieldShell"
        source="components/knglmrt/FieldShell.tsx"
        hint="Der Rahmen ohne Steuerelement: Beschriftung oben, Hinweis oder Fehler unten. Für alles, was kein natives Feld ist — Autocomplete, Mehrfachauswahl, Segmented Control."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <FieldShell
            as="div"
            label="Ansicht"
            hint="Hier sitzt ein fremdes Steuerelement im Rahmen des Systems."
          >
            <SegmentedControl
              value={segment}
              onChange={setSegment}
              options={[
                { value: "liste" as const, label: "Liste" },
                { value: "karte" as const, label: "Karte" },
              ]}
            />
          </FieldShell>
        </div>
      </Section>

      <Section
        title="FormSection"
        source="components/knglmrt/FormSection.tsx"
        hint="Der Abschnitt im Formular: Überschrift, Einordnung, darunter die Felder. Die Kontur hält ihn zusammen — kein Schatten, keine Rundung. Ohne title bleibt der Kopf weg, die Kontur bleibt."
      >
        <div className="max-w-[840px]">
          <FormSection
            title="Belegangaben"
            icon={faPlus}
            description="Alles, was auf dem Beleg steht."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Belegnummer"
                kind="mono"
                defaultValue="RE-2026-014"
              />
              <Field label="Betrag" kind="mono" defaultValue="120,50" />
            </div>
          </FormSection>

          <FormSection className="mt-4">
            <p className="text-muted-foreground">
              Ohne <code>title</code>: derselbe Rahmen, kein Kopf — für
              Abschnitte, die ihre Überschrift selbst mitbringen.
            </p>
          </FormSection>
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
        title="MultiSelect"
        source="components/knglmrt/MultiSelect.tsx"
        hint="Mehrfachauswahl aus denselben Teilen wie Select: Gewähltes steht als eckige Marke im Feld, die Liste bleibt offen. Rückschritt in der leeren Suche nimmt die letzte Marke zurück."
      >
        <div className="grid max-w-[840px] gap-6 sm:grid-cols-2">
          <MultiSelect
            label="Maschinen"
            value={maschinen}
            options={MASCHINEN}
            onChange={setMaschinen}
            hint="Mehrfach wählbar."
          />
          <MultiSelect
            label='size="lg"'
            size="lg"
            value={maschinen}
            options={MASCHINEN}
            onChange={setMaschinen}
            hint="Höhe für Filterleisten."
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
        hint="Statusmarke, 10px uppercase, nie rund. Status läuft über die Tints: Erfolg grün, Fehler rot, Warten gelb."
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
          <StatTile
            label="segments={…}"
            value="124,50 €"
            segments={[
              { percent: 70, className: "bg-primary" },
              { percent: 30, className: "bg-primary/35" },
            ]}
            hint="gestapelt statt gefüllt"
          />
          <StatTile
            label="onClick + selected"
            value="8"
            tone="grau"
            onClick={() => {}}
            hint="Kachel als Schalter"
            footer="footer={…} — abgesetzte Zeile"
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
        title="Logos Konglomerat"
        source="public/branding/logo · public/branding"
        hint="Die Marken des Vereins und von konglodigital."
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {BRAND_MARKS.map((f) => (
            <div
              key={f}
              className={`knglmrt-border flex flex-col items-center gap-1 p-2 ${
                f.includes("white") ? "bg-[var(--knglmrt-dark-100)]" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/branding/${f}`}
                alt={f}
                className="h-14 w-full object-contain"
              />
              <code className="knglmrt-tag w-full truncate text-center text-muted-foreground">
                {f.split("/").pop()}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Logos Werkbereiche"
        source="public/branding/werkbereiche"
        hint="Die Werkbereich-Marken als Bilddateien (Klasse .werkbereich-mark-image für die Einfärbung im Dark Mode)."
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {WERKBEREICH_MARKS.map((f) => (
            <div
              key={f}
              className="knglmrt-border flex flex-col items-center gap-1 p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/branding/werkbereiche/${f}`}
                alt={f}
                className="werkbereich-mark-image h-14 w-full object-contain"
              />
              <code className="knglmrt-tag w-full truncate text-center text-muted-foreground">
                {f}
              </code>
            </div>
          ))}
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

      <Section
        title="Icons"
        source="@fortawesome/free-solid-svg-icons"
        hint={`${USED_ICONS.length} Icons, die aktuell im Projekt verwendet werden.`}
      >
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
          {USED_ICONS.map((name) => {
            const icon = (solidIcons as unknown as Record<string, unknown>)[
              name
            ] as solidIcons.IconDefinition | undefined;
            return (
              <div
                key={name}
                title={name}
                className="knglmrt-border flex flex-col items-center gap-1 px-1 py-2"
              >
                {icon ? (
                  <FontAwesomeIcon icon={icon} className="h-4 w-4" />
                ) : (
                  <span className="h-4 w-4" />
                )}
                <code className="knglmrt-tag w-full truncate text-center text-muted-foreground">
                  {name.slice(2)}
                </code>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
