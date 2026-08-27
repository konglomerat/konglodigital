// src/lib/werkbereiche.ts — die Werkbereiche als eine Quelle der Wahrheit.
// Übernommen aus Branch `topnavigation` (16 reale Bereiche).
// mark = Datei unter /public/branding/werkbereiche/<mark>.(svg|png).
// Bereiche ohne eigene Marke bekommen in WerkbereichMark eine gesetzte Initiale.
export type Werkbereich = {
  slug: string;
  name: string;
  /** Kurzform für schmale Listen. Fällt auf name zurück. */
  shortLabel?: string;
  /** Ein Satz: was passiert in diesem Bereich? */
  description: string;
  mark?: string;
  markExt?: "svg" | "png";
};

export const WERKBEREICHE: Werkbereich[] = [
  {
    slug: "darkroom",
    name: "Darkroom",
    description:
      "Analoge Fotografie: entwickeln, vergrößern und abziehen in der Dunkelkammer.",
    mark: "foto-film",
    markExt: "svg",
  },
  {
    slug: "printshop",
    name: "Printshop",
    description:
      "Digitaldruck, Plotten und Weiterverarbeitung für Plakate, Hefte und Aushänge.",
    mark: "printshop",
    markExt: "svg",
  },
  {
    slug: "neuweltbib",
    name: "Neuweltbib",
    description:
      "Bibliothek und Leseraum mit Nachschlagewerken, Zeitschriften und dem Archiv des Vereins.",
  },
  {
    slug: "buchdruck",
    name: "Buchdruck",
    description:
      "Bleisatz, Handsatz und Andruckpresse — Buchdruck im ursprünglichen Verfahren.",
    mark: "buchdruck",
    markExt: "svg",
  },
  {
    slug: "holz",
    name: "Holz",
    description:
      "Plattenaufteilung, Massivholzbearbeitung und der große Maschinenpark der Holzwerkstatt.",
    mark: "holz",
    markExt: "svg",
  },
  {
    slug: "metall",
    name: "Metall",
    description:
      "Schweißen, Drehen, Bohren und Blechbearbeitung in der Metallwerkstatt.",
  },
  {
    slug: "laser",
    name: "Laser",
    description:
      "Lasercutter zum Schneiden und Gravieren — Nutzung nach Einweisung.",
    mark: "laser",
    markExt: "png",
  },
  {
    slug: "3d-druck",
    name: "3D Druck",
    description:
      "FDM- und Resin-Drucker, Abrechnung pro Druckjob im Self-Service.",
    mark: "3d-druck",
    markExt: "svg",
  },
  {
    slug: "elektronik",
    name: "Elektronik",
    description:
      "Löten, Messen und Prototyping mit Bauteillager und festen Messplätzen.",
    mark: "elektronik",
    markExt: "svg",
  },
  {
    slug: "siebdruck",
    name: "Siebdruck",
    description:
      "Siebe belichten, drucken und trocknen — für Textil und für Papier.",
    mark: "siebdruck",
    markExt: "svg",
  },
  {
    slug: "beton",
    name: "Beton",
    description:
      "Schalungsbau, Mischen und Gießen von Beton- und Mineralwerkstoffen.",
    mark: "beton",
    markExt: "png",
  },
  {
    slug: "kunststoffschmiede",
    name: "Kunststoffschmiede",
    shortLabel: "Kunststoff",
    description:
      "Kunststoffreste sortieren, schreddern und zu neuen Teilen verpressen.",
    mark: "k",
    markExt: "svg",
  },
  {
    slug: "materialvermittlung",
    name: "Materialvermittlung",
    shortLabel: "Material",
    description:
      "Das Materiallager des Vereins: gespendete Reste finden neue Projekte.",
    mark: "materialvermittung",
    markExt: "svg",
  },
  {
    slug: "cnc",
    name: "CNC",
    description:
      "CNC-Fräsen für Holz, Kunststoff und Aluminium — Nutzung nach Einweisung.",
    mark: "cnc",
    markExt: "svg",
  },
  {
    slug: "textil",
    name: "Textil",
    description:
      "Nähen, Overlock, Sticken und das Schnittmusterarchiv der Textilwerkstatt.",
    mark: "textil",
    markExt: "svg",
  },
  {
    slug: "riso",
    name: "Riso",
    description:
      "Risografie: Mehrfarbdruck mit Sojafarben für Zines, Hefte und Plakate.",
  },
];

export const findWerkbereich = (slug: string) =>
  WERKBEREICHE.find((entry) => entry.slug === slug);
