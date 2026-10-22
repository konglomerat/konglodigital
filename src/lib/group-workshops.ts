// Workshops für Gruppen (Schulen, Vereine, Teams): Typen und Lader.
//
// Die Inhalte kommen noch nicht aus dem CMS, sondern aus
// group-workshops-placeholder.ts. Der Rest der Seite kennt nur die beiden
// Lader unten — wer die Quelle später auf Payload umstellt, ändert allein
// diese Datei.
import { GROUP_WORKSHOP_PLACEHOLDERS } from "./group-workshops-placeholder";

export type GroupWorkshopImage = {
  /** Bild-URL; null zeigt eine Platzhalterfläche mit der Bildbeschreibung. */
  src: string | null;
  alt: string;
};

export type GroupWorkshop = {
  slug: string;
  /** Werkbereich-Slug für die gezeichnete Marke (siehe findArea). */
  area: string;
  title: string;
  /** Kurztext für die Karte. */
  summary: string;
  /** Einleitung oben auf der Detailseite. */
  intro: string;
  audience: string;
  duration: string;
  location: string;
  price: string;
  groupSize: { min: number; max: number };
  /** Terrazzo-Klasse für die Karte, solange kein Foto da ist. */
  terrazzo: string;
  /** Das erste Bild ist die große Kachel und das Kartenbild. */
  images: GroupWorkshopImage[];
  schedule: Array<{ time: string; title: string; text: string }>;
  scheduleNote?: string;
  /** „Gut zu wissen“. */
  infos: Array<{ label: string; text: string }>;
  host?: { text: string; face: number };
};

export const listGroupWorkshops = async (): Promise<GroupWorkshop[]> =>
  GROUP_WORKSHOP_PLACEHOLDERS;

export const getGroupWorkshop = async (
  slug: string,
): Promise<GroupWorkshop | null> =>
  (await listGroupWorkshops()).find((workshop) => workshop.slug === slug) ??
  null;

/** „8–16 Pers.“ */
export const formatGroupSize = ({ min, max }: GroupWorkshop["groupSize"]) =>
  min === max ? `${min} Pers.` : `${min}–${max} Pers.`;

export const groupWorkshopHref = (slug: string) =>
  `/workshops/gruppen/${slug}`;
