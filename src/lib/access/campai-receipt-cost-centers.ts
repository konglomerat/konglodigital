// Kostenstellen 2 eines Campai-Belegs, damit Routen mit Bereichs-Buchhaltung
// Einzelbelege prüfen können. Nur nötig, wenn die Berechtigung nicht global ist.
const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const toCostCenter = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.replace(/\D+/g, ""), 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

/** Je Position die Kostenstelle 2 (null, wenn keine gesetzt ist). */
export const extractReceiptCostCenters = (
  receipt: Record<string, unknown>,
): (number | null)[] =>
  (Array.isArray(receipt.positions) ? receipt.positions : []).map((position) =>
    position && typeof position === "object"
      ? toCostCenter((position as Record<string, unknown>).costCenter2)
      : null,
  );

/** null, wenn Campai den Beleg nicht liefert. */
export const fetchCampaiReceiptCostCenters = async (
  receiptId: string,
): Promise<(number | null)[] | null> => {
  const response = await fetch(
    `https://cloud.campai.com/api/${requiredEnv("CAMPAI_ORGANIZATION_ID")}/${requiredEnv("CAMPAI_MANDATE_ID")}/finance/receipts/${encodeURIComponent(receiptId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": requiredEnv("CAMPAI_API_KEY"),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const receipt = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return receipt ? extractReceiptCostCenters(receipt) : null;
};
