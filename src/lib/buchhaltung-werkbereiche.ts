// Werkbereiche der Buchhaltung: jede zweistellige Campai-Kostenstelle 2 hat
// eine eigene Unterseite unter /receipts/<slug>, die dreistelligen mit
// denselben ersten beiden Ziffern sind ihre Unterprojekte (571 → 57 Holz).
// Rein und ohne Server-Abhängigkeit — Sidenav und Tabelle teilen sich das.

export type BuchhaltungWerkbereich = {
  /** Zweistellige Kostenstelle 2, z. B. "57". */
  value: string;
  label: string;
  slug: string;
};

type CostCenterOption = { value: string; label: string };

// Statische Geschwister von /receipts/[werkbereich] — ein gleichnamiger
// Werkbereich wäre sonst nicht erreichbar.
const RESERVED_SLUGS = new Set([
  "create",
  "eigenbeleg",
  "expense",
  "income",
  "invoice",
  "pretix-import",
  "reimbursement",
]);

export const isWerkbereichCostCenter = (value: string): boolean =>
  /^\d{2}$/.test(value.trim());

export const isUnterprojektOf = (value: string, werkbereich: string): boolean =>
  /^\d{3}$/.test(value) && value.startsWith(werkbereich);

export const belongsToWerkbereich = (
  value: string,
  werkbereich: string,
): boolean => value === werkbereich || isUnterprojektOf(value, werkbereich);

const slugifyLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const toBuchhaltungWerkbereiche = (
  costCenters: readonly CostCenterOption[],
): BuchhaltungWerkbereich[] => {
  const seenSlugs = new Set<string>();

  return costCenters
    .filter((option) => isWerkbereichCostCenter(option.value))
    .sort((left, right) => Number(left.value) - Number(right.value))
    .map((option) => {
      const base = slugifyLabel(option.label);
      const slug =
        !base || RESERVED_SLUGS.has(base) || seenSlugs.has(base)
          ? `${base ? `${base}-` : ""}${option.value}`
          : base;
      seenSlugs.add(slug);
      return { value: option.value.trim(), label: option.label, slug };
    });
};

export const getWerkbereichHref = (werkbereich: BuchhaltungWerkbereich) =>
  `/receipts/${werkbereich.slug}`;

/** Akzeptiert den Slug und zur Not die nackte Nummer. */
export const findBuchhaltungWerkbereich = (
  werkbereiche: readonly BuchhaltungWerkbereich[],
  slugOrValue: string,
): BuchhaltungWerkbereich | null =>
  werkbereiche.find((entry) => entry.slug === slugOrValue) ??
  werkbereiche.find((entry) => entry.value === slugOrValue) ??
  null;
