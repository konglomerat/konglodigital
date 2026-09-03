/**
 * Ressourcentyp, unter dem "Hier entstanden"-Beiträge in Supabase gespeichert sind.
 *
 * Der gespeicherte Wert bleibt bewusst "project": Er steckt in bestehenden
 * Datensätzen und in der RLS-Policy für Löschrechte (supabase/schema.sql).
 * Nur die Anzeige und der Code sprechen von "Showcase".
 */
export const SHOWCASE_RESOURCE_TYPE = "project";

export const isShowcaseResourceType = (value: unknown): boolean =>
  typeof value === "string" &&
  value.trim().toLowerCase() === SHOWCASE_RESOURCE_TYPE;
