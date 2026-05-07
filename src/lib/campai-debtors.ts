import type { CampaiConfig } from "@/lib/campai-receipts/config";

export const ADDRESS_REQUIRED_THRESHOLD_CENTS = 25_000;
export const DEBTOR_ADDRESS_REQUIRED_ERROR =
  "Für Beträge über 250 € muss beim Debitor in Campai eine vollständige Adresse mit Straße, PLZ und Stadt hinterlegt sein.";

export type CampaiDebtorPaymentMethodType =
  | "sepaCreditTransfer"
  | "sepaDirectDebit"
  | "cash"
  | "online";

export type CampaiDebtorAddressPayload = {
  country: string;
  state?: string;
  zip?: string;
  city?: string;
  addressLine?: string;
  details1?: string;
  details2?: string;
};

type CampaiDebtorAddress = {
  zip?: string | null;
  city?: string | null;
  addressLine?: string | null;
};

type CampaiDebtor = {
  address?: CampaiDebtorAddress | null;
};

export const normalizeDebtorAddress = (
  value: unknown,
): CampaiDebtorAddressPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as Record<string, unknown>;
  const country =
    typeof typed.country === "string" ? typed.country.trim() : "DE";
  const zip = typeof typed.zip === "string" ? typed.zip.trim() : "";
  const city = typeof typed.city === "string" ? typed.city.trim() : "";
  const addressLine =
    typeof typed.addressLine === "string" ? typed.addressLine.trim() : "";
  const details1 =
    typeof typed.details1 === "string" ? typed.details1.trim() : "";
  const details2 =
    typeof typed.details2 === "string" ? typed.details2.trim() : "";
  const state = typeof typed.state === "string" ? typed.state.trim() : "";

  if (!zip && !city && !addressLine && !details1 && !details2 && !state) {
    return null;
  }

  return {
    country: country || "DE",
    zip: zip || undefined,
    city: city || undefined,
    addressLine: addressLine || undefined,
    state: state || undefined,
    details1: details1 || undefined,
    details2: details2 || undefined,
  };
};

export const normalizeDebtorPaymentMethodType = (
  value: unknown,
): CampaiDebtorPaymentMethodType | null => {
  if (
    value === "sepaCreditTransfer" ||
    value === "sepaDirectDebit" ||
    value === "cash" ||
    value === "online"
  ) {
    return value;
  }
  return null;
};

type DebtorPayloadResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      name: string;
      paymentMethodType: CampaiDebtorPaymentMethodType | null;
      payload: Record<string, unknown>;
    };

export const buildDebtorPayload = (
  body: Record<string, unknown>,
): DebtorPayloadResult => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type === "person" ? "person" : "business";
  const address = normalizeDebtorAddress(body.address);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const paymentMethodType = normalizeDebtorPaymentMethodType(
    body.paymentMethodType,
  );
  const receiptSendMethod =
    body.receiptSendMethod === "email"
      ? "email"
      : body.receiptSendMethod === "postal"
        ? "postal"
        : "none";

  if (!name) {
    return {
      ok: false,
      status: 400,
      error: "Name ist erforderlich.",
    };
  }

  if (paymentMethodType === "sepaDirectDebit") {
    return {
      ok: false,
      status: 400,
      error:
        "SEPA-Lastschrift muss in Campai mit Mandat gepflegt werden und kann hier nicht inline angelegt werden.",
    };
  }

  const payload: Record<string, unknown> = {
    type,
    name: name.slice(0, 81),
    email,
    receiptSendMethod: email
      ? receiptSendMethod === "none"
        ? "email"
        : receiptSendMethod
      : receiptSendMethod,
  };

  if (address) {
    payload.address = address;
  }

  if (paymentMethodType) {
    payload.paymentMethodType = paymentMethodType;
  }

  return {
    ok: true,
    name,
    paymentMethodType,
    payload,
  };
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