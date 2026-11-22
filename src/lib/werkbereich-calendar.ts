import type { CalendarEvent } from "@/app/[lang]/calendar/calendar-data";

const aliases: Record<string, string[]> = {
  darkroom: ["darkroom", "fotolabor", "dunkelkammer"],
  printshop: ["printshop"],
  neuweltbib: ["neuweltbib"],
  buchdruck: ["buchdruck"],
  holz: ["holz", "holzwerkstatt"],
  metall: ["metall", "metallwerkstatt"],
  laser: ["laser", "laserwerkstatt", "lasercutter"],
  "3d-druck": ["3ddruck", "3ddrucker", "3ddruckwerkstatt"],
  elektronik: ["elektronik", "elektronikwerkstatt", "elektroniktreffen"],
  siebdruck: ["siebdruck", "siebdruckwerkstatt"],
  beton: ["beton", "betonwerkstatt"],
  kunststoffschmiede: ["kunststoff", "kunststoffschmiede"],
  materialvermittlung: ["materialvermittlung", "zuendstoffe"],
  cnc: ["cnc", "cncfraesen", "cncwerkstatt"],
  textil: ["textil", "textiles", "textilwerkstatt", "naehwerkstatt", "naehtreff"],
  riso: ["riso", "risografie", "risowerkstatt"],
  forum: ["forum"],
  tools2go: ["tools2go"],
  aenderei: ["aenderei"],
  vhc: ["vhc", "nvc", "volkshaus"],
};

const normalize = (text: string) => text.toLowerCase().normalize("NFC")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[-_\s‐‑–—:]/g, "");

const tagToArea = new Map(Object.entries(aliases).flatMap(([area, tags]) =>
  tags.map(tag => [normalize(tag), area] as const),
));

export function calendarEventMatchesWerkbereich(event: CalendarEvent, werkbereich: string): boolean {
  // Descriptions contain unrelated projects, links and directions; only their
  // explicit hashtags are suitable for assigning an event to a workshop.
  const tags = [...`${event.summary} ${event.description ?? ""}`.matchAll(/#([\p{L}\p{N}_-]+)/gu)]
    .map(match => normalize(match[1]));
  const areas = new Set(tags.map(tag => tagToArea.get(tag)).filter(Boolean));
  if (areas.has(werkbereich) || tags.includes(normalize(werkbereich))) return true;

  // The Laser and 3D pages describe this as their shared open workshop.
  if (werkbereich === "3d-druck" && areas.has("laser") && tags.includes("offenews")) return true;

  // Explicit tags win over title guesses (e.g. "3D-Druck im NVC" with #VHC).
  if (areas.size) return false;

  // Older, untagged events can still be identified by a precise title term.
  const titleWords = event.summary.match(/[\p{L}\p{N}]+(?:[-_‐‑–—][\p{L}\p{N}]+)*/gu) ?? [];
  const titleTerms = new Set(titleWords.map(normalize));
  // Also cover spaced forms such as "3D Druck" and "FOR:UM".
  for (let i = 0; i < titleWords.length - 1; i++) titleTerms.add(normalize(titleWords[i] + titleWords[i + 1]));
  return (aliases[werkbereich] ?? [normalize(werkbereich)]).some(alias => titleTerms.has(alias));
}

export function filterWerkbereichEvents(events: CalendarEvent[], werkbereich?: string): CalendarEvent[] {
  return werkbereich ? events.filter(event => calendarEventMatchesWerkbereich(event, werkbereich)) : events;
}
