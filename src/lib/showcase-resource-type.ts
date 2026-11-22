/**
 * Historischer Supabase-Typ der nach Payload posts migrierten Beiträge.
 *
 * Der gespeicherte Wert bleibt bewusst "project": Er steckt in bestehenden
 * Datensätzen und in der RLS-Policy für Löschrechte (supabase/schema.sql).
 * Dient zum Ausschließen alter Kopien aus Inventaransichten und Schreibwegen.
 */
export const SHOWCASE_RESOURCE_TYPE = "project";

export const isShowcaseResourceType = (value: unknown): boolean =>
  typeof value === "string" &&
  value.trim().toLowerCase() === SHOWCASE_RESOURCE_TYPE;
