import "server-only";

import { buildDebtorPayload } from "@/lib/campai-debtors";
import { mergeCampaiTags } from "@/lib/campai-booking-tags";
import { loadCampaiConfig, loadInvoiceAccount } from "@/lib/campai-receipts/config";
import {
  getEffectiveVolkshausPrice,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";

type InvoiceResult = {
  invoiceId: string;
  debtorAccount: number;
  status: "draft_created" | "created";
};

export class VolkshausCampaiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolkshausCampaiConfigurationError";
  }
}

const parsePositiveInteger = (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const assertCampaiConfig = () => {
  const config = loadCampaiConfig();
  const costCenter1 = parsePositiveInteger(process.env.CAMPAI_COST_CENTER1);
  const costCenter2 = parsePositiveInteger(
    process.env.CAMPAI_VOLKSHAUS_COST_CENTER2,
  );

  if (!costCenter1) {
    throw new VolkshausCampaiConfigurationError(
      "CAMPAI_COST_CENTER1 fehlt oder ist ungültig.",
    );
  }
  if (!costCenter2) {
    throw new VolkshausCampaiConfigurationError(
      "CAMPAI_VOLKSHAUS_COST_CENTER2 fehlt. Die Buchung ist bestätigt; die Rechnung kann nach Konfiguration erneut angelegt werden.",
    );
  }

  return {
    config,
    costCenter1,
    costCenter2,
    positionAccount: loadInvoiceAccount(),
  };
};

const getExactDebtorByEmail = async ({
  booking,
  apiKey,
  baseUrl,
}: {
  booking: VolkshausBooking;
  apiKey: string;
  baseUrl: string;
}) => {
  const response = await fetch(`${baseUrl}/finance/accounts/debtors/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ searchTerm: booking.email, limit: 20 }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        debtors?: Array<{
          account?: number;
          email?: string;
        }>;
      }
    | null;

  return (
    payload?.debtors?.find(
      (debtor) =>
        typeof debtor.account === "number" &&
        debtor.email?.trim().toLowerCase() === booking.email.toLowerCase(),
    )?.account ?? null
  );
};

const createDebtor = async ({
  booking,
  apiKey,
  baseUrl,
}: {
  booking: VolkshausBooking;
  apiKey: string;
  baseUrl: string;
}) => {
  const parsed = buildDebtorPayload({
    name: booking.organization || booking.customerName,
    type: booking.organization ? "business" : "person",
    email: booking.email,
    receiptSendMethod: "email",
    paymentMethodType: "sepaCreditTransfer",
    address: {
      country: "DE",
      zip: booking.billingZip,
      city: booking.billingCity,
      addressLine: booking.billingAddressLine,
      details1: booking.organization ? booking.customerName : undefined,
    },
  });

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const response = await fetch(`${baseUrl}/finance/accounts/debtors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(parsed.payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body ||
        `Campai-Debitor konnte nicht erstellt werden (HTTP ${response.status}).`,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { account?: number }
    | null;
  if (!payload?.account) {
    throw new Error("Campai hat für den neuen Debitor kein Konto zurückgegeben.");
  }
  return payload.account;
};

const resolveTaxCode19 = async ({
  apiKey,
  organizationId,
}: {
  apiKey: string;
  organizationId: string;
}) => {
  const configured = process.env.CAMPAI_TAX_CODE_19?.trim();
  if (configured) {
    return configured;
  }

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new VolkshausCampaiConfigurationError(
      "Der Campai-Steuercode für 19 % Umsatzsteuer konnte nicht ermittelt werden.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        taxes?: Array<{
          type?: string;
          code?: string;
          rate?: number;
          builtIn?: boolean;
        }>;
      }
    | null;
  const matching = (payload?.taxes ?? []).filter(
    (tax) =>
      tax.type === "vat" &&
      tax.rate === 19 &&
      typeof tax.code === "string" &&
      tax.code.trim(),
  );
  const selected =
    matching.find((tax) => tax.builtIn === true) ?? matching[0] ?? null;
  if (!selected?.code) {
    throw new VolkshausCampaiConfigurationError(
      "In Campai wurde kein Steuercode für 19 % Umsatzsteuer gefunden.",
    );
  }
  return selected.code.trim();
};

const dateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const createCampaiInvoiceForVolkshausBooking = async (
  booking: VolkshausBooking,
): Promise<InvoiceResult> => {
  if (booking.campaiInvoiceId && booking.campaiDebtorAccount) {
    return {
      invoiceId: booking.campaiInvoiceId,
      debtorAccount: booking.campaiDebtorAccount,
      status:
        booking.invoiceStatus === "created" ? "created" : "draft_created",
    };
  }

  const { config, costCenter1, costCenter2, positionAccount } =
    assertCampaiConfig();
  const taxCode = await resolveTaxCode19({
    apiKey: config.apiKey,
    organizationId: config.organizationId,
  });

  const debtorAccount =
    booking.campaiDebtorAccount ??
    (await getExactDebtorByEmail({
      booking,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    })) ??
    (await createDebtor({
      booking,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    }));

  const price = getEffectiveVolkshausPrice(booking);
  if (price.netCents <= 0) {
    throw new Error("Der Rechnungsbetrag muss größer als 0 Euro sein.");
  }

  const finalize =
    process.env.VOLKSHAUS_CAMPAI_FINALIZE_INVOICE?.trim().toLowerCase() ===
    "true";
  const receiptDate = new Date().toISOString().slice(0, 10);
  const payload = {
    draft: !finalize,
    address: {
      country: "DE",
      zip: booking.billingZip,
      city: booking.billingCity,
      addressLine: booking.billingAddressLine,
      details1: booking.organization ? booking.customerName : "",
      details2: "",
    },
    title: `Raumnutzung Volkshaus Cotta · ${booking.referenceCode}`,
    intro:
      "Vielen Dank für die Nutzung der Räume im Neuen Volkshaus Cotta.",
    account: debtorAccount,
    isNet: true,
    deliveryDateType: "service",
    receiptDate,
    dueDate: dateAfterDays(
      Math.max(1, Number.parseInt(process.env.CAMPAI_DUE_DAYS ?? "14", 10)),
    ),
    deliveryDate: booking.bookingDate,
    email: booking.email,
    sendMethod: "none",
    accountName: booking.organization || booking.customerName,
    receiptNumber: null,
    customerType: "debtor",
    customerNumber: [String(debtorAccount)],
    description: `Buchungsreferenz ${booking.referenceCode}`,
    paid: false,
    note: `Automatisch aus KongloDigital erstellt. Vertrag ${booking.contractHash ?? "ohne Hash"}.`,
    discount: 0,
    discountType: "%",
    positions: [
      {
        unitAmount: price.netCents,
        discount: 0,
        description: `Raumnutzung Neues Volkshaus Cotta · ${booking.eventTitle}`,
        account: positionAccount,
        details: price.lines
          .map(
            (line) =>
              `${line.description}: ${(line.totalNetCents / 100).toFixed(2)} EUR netto`,
          )
          .join("\n"),
        quantity: 1,
        unit: "",
        costCenter1,
        costCenter2,
        taxCode,
      },
    ],
    doNotSendReceipt: true,
    queueReceiptDocument: false,
    tags: mergeCampaiTags(["API", "VHC", "Raumbuchung"]),
  };

  const response = await fetch(`${config.baseUrl}/receipts/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body || `Campai-Rechnung konnte nicht angelegt werden (HTTP ${response.status}).`,
    );
  }

  const result = (await response.json().catch(() => null)) as
    | { _id?: string; id?: string }
    | null;
  const invoiceId = result?._id ?? result?.id ?? null;
  if (!invoiceId) {
    throw new Error("Campai hat keine Rechnungs-ID zurückgegeben.");
  }

  return {
    invoiceId,
    debtorAccount,
    status: finalize ? "created" : "draft_created",
  };
};

