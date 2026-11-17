export const euroAmountPattern = /^\d+(,\d{1,2})?$/;

export const euroAmountValidationMessage =
  "Bitte Betrag mit Komma als Dezimaltrenner eingeben, z. B. 12,50.";

export const sanitizeEuroInput = (value: string): string => {
  const withComma = value.replace(/\./g, ",");
  const filtered = withComma.replace(/[^\d,]/g, "");
  const separatorIndex = filtered.indexOf(",");

  if (separatorIndex === -1) {
    return filtered;
  }

  const integerPart = filtered.slice(0, separatorIndex);
  const fractionPart = filtered
    .slice(separatorIndex + 1)
    .replace(/,/g, "")
    .slice(0, 2);

  return `${integerPart},${fractionPart}`;
};

/** 3570 → "35,70" — für Eingabefelder, ohne Tausenderpunkte. */
export const centsToEuroInput = (cents: number | null | undefined): string =>
  typeof cents === "number" && Number.isFinite(cents)
    ? (cents / 100).toFixed(2).replace(".", ",")
    : "";

/** "35,7" → 3570. Leer oder ungültig → null; 0 ist erlaubt. */
export const euroInputToCents = (value: string): number | null => {
  const normalized = value.trim().replace(/\./g, ",");
  if (!euroAmountPattern.test(normalized)) return null;
  return Math.round(Number.parseFloat(normalized.replace(",", ".")) * 100);
};
