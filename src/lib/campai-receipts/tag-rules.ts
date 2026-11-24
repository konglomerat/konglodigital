// Regeln für Beleg-Tags, die Server und Browser teilen.
// Campai erlaubt höchstens 20 Tags je Beleg mit je 1–40 Zeichen.
export const MAX_RECEIPT_TAGS = 20;
export const MAX_RECEIPT_TAG_LENGTH = 40;

/** Technische Tags: „API“ setzt die App selbst, „scripted“ stammt aus einem
 *  Import-Skript. In Auswahllisten, Filtern und der Auswertung nicht anbieten. */
export const SYSTEM_RECEIPT_TAGS: ReadonlySet<string> = new Set([
  "API",
  "scripted",
]);
