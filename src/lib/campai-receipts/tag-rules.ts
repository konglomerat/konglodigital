// Regeln für Beleg-Tags, die Server und Browser teilen.
// Campai erlaubt höchstens 20 Tags je Beleg mit je 1–40 Zeichen.
export const MAX_RECEIPT_TAGS = 20;
export const MAX_RECEIPT_TAG_LENGTH = 40;

/** Setzt die App selbst; in Auswahllisten und Filtern nicht anbieten. */
export const SYSTEM_RECEIPT_TAGS: ReadonlySet<string> = new Set(["API"]);
