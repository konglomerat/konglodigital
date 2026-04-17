const UNIT_CODE_LABELS: Record<string, string> = {
  C62: "Stk",
  KGM: "kg",
  LTR: "l",
  MTR: "m",
  MTK: "m²",
  MTQ: "m³",
  PCE: "Stk",
};

export const normalizeUnitCode = (rawUnit: string): string => {
  const normalized = rawUnit.trim().toUpperCase();

  if (!normalized) {
    return "Stk";
  }

  return UNIT_CODE_LABELS[normalized] ?? rawUnit.trim();
};