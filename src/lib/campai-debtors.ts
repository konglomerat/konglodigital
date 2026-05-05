import type { CampaiConfig } from "@/lib/campai-receipts/config";

export const ADDRESS_REQUIRED_THRESHOLD_CENTS = 25_000;
export const DEBTOR_ADDRESS_REQUIRED_ERROR =
  "Für Beträge über 250 € muss beim Debitor in Campai eine vollständige Adresse mit Straße, PLZ und Stadt hinterlegt sein.";

type CampaiDebtorAddress = {
  zip?: string | null;
  city?: string | null;
  addressLine?: string | null;
};

type CampaiDebtor = {
  address?: CampaiDebtorAddress | null;
};

type DebtorAddressValidationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const hasRequiredAddress = (address: CampaiDebtorAddress | null | undefined) => {
  const zip = typeof address?.zip === "string" ? address.zip.trim() : "";
  const city = typeof address?.city === "string" ? address.city.trim() : "";
  const addressLine =
    typeof address?.addressLine === "string" ? address.addressLine.trim() : "";

  return Boolean(zip && city && addressLine);
};

export const validateDebtorAddressForAmount = async (params: {
  config: CampaiConfig;
  debtorAccount: number;
  grossAmountCents: number;
}): Promise<DebtorAddressValidationResult> => {
  const { config, debtorAccount, grossAmountCents } = params;

  if (grossAmountCents <= ADDRESS_REQUIRED_THRESHOLD_CENTS) {
    return { ok: true };
  }

  const response = await fetch(
    `${config.baseUrl}/finance/accounts/debtors/${debtorAccount}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      error:
        "Debitorendaten konnten nicht geprüft werden. Bitte später erneut versuchen oder den Debitor in Campai prüfen.",
    };
  }

  const debtor = (await response.json().catch(() => null)) as CampaiDebtor | null;

  if (hasRequiredAddress(debtor?.address)) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 400,
    error: DEBTOR_ADDRESS_REQUIRED_ERROR,
  };
};