// Beleg-Tags in Campai. Die Liste kommt aus `finance/receipts/tags/list`
// (nach Nutzung sortiert), gesetzt werden sie beim Anlegen im Beleg selbst
// oder später über `finance/receipts/{id}/tags`, das die Liste ersetzt.
//
// Campai erlaubt höchstens 20 Tags je Beleg mit je 1–40 Zeichen. „API“ setzt
// die App immer, der Eigenbeleg zusätzlich seinen Grund — beides zählt mit.
import { loadCampaiConfig } from "./config";
import { MAX_RECEIPT_TAG_LENGTH } from "./tag-rules";

export {
  MAX_RECEIPT_TAGS,
  MAX_RECEIPT_TAG_LENGTH,
  SYSTEM_RECEIPT_TAGS,
} from "./tag-rules";

export type CampaiReceiptTag = { tag: string; usage: number };

/**
 * Tags aus einem Request-Body: nur Strings, getrimmt, ohne Dubletten, auf 40
 * Zeichen gekürzt. Fehlt das Feld, kommt eine leere Liste zurück.
 */
export const parseReceiptTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = value.trim().slice(0, MAX_RECEIPT_TAG_LENGTH);
    if (tag) seen.add(tag);
  }
  return [...seen];
};

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Alle Beleg-Tags des Mandanten, meistgenutzte zuerst. */
export const listCampaiReceiptTags = async (): Promise<CampaiReceiptTag[]> => {
  const config = loadCampaiConfig();
  const tags: CampaiReceiptTag[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetch(`${config.baseUrl}/finance/receipts/tags/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        sort: { usage: "desc" },
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        (await response.text()) || "Tags konnten nicht geladen werden.",
      );
    }

    const data = (await response.json()) as {
      tags?: Array<{ tag?: unknown; usage?: unknown }>;
    };
    const batch = Array.isArray(data.tags) ? data.tags : [];
    for (const entry of batch) {
      if (typeof entry.tag !== "string" || !entry.tag.trim()) continue;
      tags.push({
        tag: entry.tag,
        usage: typeof entry.usage === "number" ? entry.usage : 0,
      });
    }

    // `count` meldet Campai hier als 0, auch wenn Tags kommen — daher nur an
    // der Seitengröße erkennen, ob noch mehr folgt.
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return tags;
};
