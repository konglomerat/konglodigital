// Werkbereiche der Buchhaltung: jede zweistellige Campai-Kostenstelle 2 hat
// eine eigene Unterseite unter /receipts/<slug>, die dreistelligen mit
// denselben ersten beiden Ziffern sind ihre Unterprojekte (571 → 57 Holz).
// Rein und ohne Server-Abhängigkeit — Sidenav und Tabelle teilen sich das.
import { ALL_SCOPES, type AllowedScopes } from "@/lib/access/access";
import type { Scope } from "@/lib/access/scopes";

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

// --- Bereichsfilter -------------------------------------------------------
// Wer Buchhaltung nur für einzelne Geltungsbereiche hat, sieht nur deren
// Kostenstellen 2 samt Unterprojekten (57 → 571, 572 …). Kostenstellen ohne
// Bereich (Basis, Rücklagen …) und Belege ohne Kostenstelle 2 bleiben der
// globalen Buchhaltung vorbehalten.

/** Zweistellige Kostenstellen 2 — oder alle. */
export type AllowedCostCenters = typeof ALL_SCOPES | string[];

export const getAllowedCostCenters = (
  allowed: AllowedScopes,
  scopes: readonly Scope[],
): AllowedCostCenters => {
  if (allowed === ALL_SCOPES) {
    return ALL_SCOPES;
  }

  return Array.from(
    new Set(
      scopes
        .filter((scope) => allowed.includes(scope.id))
        .map((scope) => scope.campaiCostCenter?.trim() ?? "")
        .filter(isWerkbereichCostCenter),
    ),
  ).sort();
};

export const isCostCenterAllowed = (
  value: string | number | null | undefined,
  allowed: AllowedCostCenters,
): boolean => {
  if (allowed === ALL_SCOPES) {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }

  const normalized = String(value).trim();
  return allowed.some((werkbereich) =>
    belongsToWerkbereich(normalized, werkbereich),
  );
};

export const filterAllowedCostCenters = <T extends string | number>(
  values: readonly T[],
  allowed: AllowedCostCenters,
): T[] => values.filter((value) => isCostCenterAllowed(value, allowed));

/** Ein Beleg mit Positionen in mehreren Bereichen ist sichtbar, sobald einer
 *  davon erlaubt ist — so wie er auch in der Liste des Bereichs auftaucht. */
export const canViewReceiptCostCenters = (
  costCenters: readonly (string | number | null)[],
  allowed: AllowedCostCenters,
) =>
  allowed === ALL_SCOPES ||
  costCenters.some((value) => isCostCenterAllowed(value, allowed));

/** Ändern dagegen nur, wenn jede Position in einem erlaubten Bereich liegt. */
export const canEditReceiptCostCenters = (
  costCenters: readonly (string | number | null)[],
  allowed: AllowedCostCenters,
) =>
  allowed === ALL_SCOPES ||
  (costCenters.length > 0 &&
    costCenters.every((value) => isCostCenterAllowed(value, allowed)));

export const filterAllowedWerkbereiche = (
  werkbereiche: readonly BuchhaltungWerkbereich[],
  allowed: AllowedCostCenters,
): BuchhaltungWerkbereich[] =>
  werkbereiche.filter((werkbereich) =>
    isCostCenterAllowed(werkbereich.value, allowed),
  );

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
