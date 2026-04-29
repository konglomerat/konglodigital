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
