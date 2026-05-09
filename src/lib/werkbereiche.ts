export type WerkbereichEntry = {
  slug: string;
  name: string;
  /** Compact label for sidebar tiles. Falls back to name. */
  shortLabel?: string;
  /** Times for "Offene Werkstatt", e.g. "10 – 22 Uhr". */
  hoursLabel?: string;
};

export const WERKBEREICHE: WerkbereichEntry[] = [
  { slug: "darkroom", name: "Darkroom" },
  { slug: "printshop", name: "Printshop" },
  { slug: "neuweltbib", name: "Neuweltbib" },
  { slug: "buchdruck", name: "Buchdruck" },
  { slug: "holz", name: "Holz" },
  { slug: "metall", name: "Metall" },
  { slug: "laser", name: "Laser" },
  { slug: "3d-druck", name: "3D Druck" },
  { slug: "elektronik", name: "Elektronik" },
  { slug: "siebdruck", name: "Siebdruck" },
  { slug: "beton", name: "Beton" },
  {
    slug: "kunststoffschmiede",
    name: "Kunststoffschmiede",
    shortLabel: "Kunststoff",
  },
  {
    slug: "materialvermittlung",
    name: "Materialvermittlung",
    shortLabel: "Material",
  },
  { slug: "cnc", name: "CNC" },
  { slug: "textil", name: "Textil" },
  { slug: "riso", name: "Riso" },
];

export type WerkbereichEvent = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Werkbereich slug this event is tagged with. */
  tag: string;
  title: string;
};

/**
 * Placeholder calendar feed. Each entry is tagged with the werkbereich slug
 * it belongs to so the Termine tile can filter per-page.
 */
export const WERKBEREICH_EVENTS: WerkbereichEvent[] = [
  { date: "2026-05-12", tag: "3d-druck", title: "Slicer-Tipps" },
  { date: "2026-05-13", tag: "holz", title: "Einweisung Tischkreissäge" },
  { date: "2026-05-15", tag: "laser", title: "Einweisung Trotec" },
  { date: "2026-05-17", tag: "darkroom", title: "Einführung Filmentwicklung" },
  { date: "2026-05-18", tag: "3d-druck", title: "Einweisung Bambu X1C" },
  { date: "2026-05-19", tag: "metall", title: "Schweiß-Einweisung" },
  { date: "2026-05-20", tag: "holz", title: "Möbelbau-Workshop" },
  { date: "2026-05-21", tag: "elektronik", title: "SMD-Workshop" },
  { date: "2026-05-22", tag: "cnc", title: "CAM-Einführung" },
  { date: "2026-05-23", tag: "textil", title: "Overlock-Einweisung" },
  { date: "2026-05-25", tag: "3d-druck", title: "Resin-Druck Workshop" },
  { date: "2026-05-26", tag: "riso", title: "Risograph-Einführung" },
  { date: "2026-05-28", tag: "printshop", title: "Linoldruck-Basics" },
  { date: "2026-05-29", tag: "laser", title: "Materialkunde Laser" },
  { date: "2026-06-01", tag: "siebdruck", title: "Belichtungs-Einweisung" },
  { date: "2026-06-03", tag: "holz", title: "Schleifen & Ölen" },
  { date: "2026-06-05", tag: "cnc", title: "CNC-Fräsen Basics" },
  { date: "2026-06-08", tag: "buchdruck", title: "Letterpress-Workshop" },
  { date: "2026-06-12", tag: "neuweltbib", title: "Bibliotheks-Einführung" },
  { date: "2026-06-15", tag: "kunststoffschmiede", title: "Plasticpreneur-Einweisung" },
  { date: "2026-06-20", tag: "materialvermittlung", title: "Sprechstunde Material" },
  { date: "2026-06-22", tag: "beton", title: "Beton-Workshop" },
  { date: "2026-06-26", tag: "3d-druck", title: "Druckbett-Wartung" },
  { date: "2026-07-02", tag: "holz", title: "CNC-Holz Crossover" },
  { date: "2026-07-08", tag: "elektronik", title: "Lötplatz-Einweisung" },
];

export type ProjektEntry = {
  slug: string;
  name: string;
};

export const PROJEKTE: ProjektEntry[] = [
  { slug: "forum", name: "FOR:UM" },
  { slug: "vhc", name: "VHC" },
  { slug: "aenderei", name: "Änderei" },
  { slug: "previous", name: "Previous Projects" },
];
