import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

type AddressPayload = {
  country: string;
  state?: string;
  zip: string;
  city: string;
  addressLine: string;
  details1?: string;
  details2?: string;
};

type PositionPayload = {
  description: string;
  unit?: string;
  quantity: number;
  unitAmount: number;
  details?: string;
  taxCode?: string | null;
  costCenter1?: string | null;
  discount?: number;
};

type TaxRateChoice = "0" | "7" | "19";

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
};

const isValidCampaiCostCenter1 = (value: number): boolean => {
  const firstDigit = String(value).trim().charAt(0);
  return ["1", "2", "3", "4", "9"].includes(firstDigit);
};

const getValidDefaultCostCenter = (): number | null => {
  const parsed = parsePositiveInt(process.env.CAMPAI_COST_CENTER1);
  if (!parsed) {
    return null;
  }
  return isValidCampaiCostCenter1(parsed) ? parsed : null;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return trimmed;
};

const normalizeDiscount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }
  return 0;
};

const parseTaxRateChoice = (value: unknown): TaxRateChoice | null => {
  if (value === 0 || value === 7 || value === 19) {
    return String(value) as TaxRateChoice;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "0" || trimmed === "7" || trimmed === "19") {
    return trimmed;
  }

  return null;
};

const resolveTaxCodeOverrides = () => {
  const map = new Map<TaxRateChoice, string>();

  const zero = process.env.CAMPAI_TAX_CODE_0?.trim();
  const seven = process.env.CAMPAI_TAX_CODE_7?.trim();
  const nineteen = process.env.CAMPAI_TAX_CODE_19?.trim();

  if (zero) {
    map.set("0", zero);
  }
  if (seven) {
    map.set("7", seven);
  }
  if (nineteen) {
    map.set("19", nineteen);
  }

  return map;
};

const resolveCampaiTaxCodesByRate = async (params: {
  apiKey: string;
  organizationId: string;
}) => {
  const { apiKey, organizationId } = params;

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return new Map<TaxRateChoice, string>();
  }

  const payload = (await response.json().catch(() => null)) as {
    taxes?: Array<{
      type?: string;
      code?: string;
      rate?: number;
      builtIn?: boolean;
    }>;
  } | null;

  const taxes = Array.isArray(payload?.taxes) ? payload.taxes : [];
  const result = new Map<TaxRateChoice, string>();

  for (const rate of [0, 7, 19] as const) {
    const matching = taxes.filter(
      (tax) =>
        tax.type === "vat" &&
        typeof tax.code === "string" &&
        tax.code.trim() &&
        typeof tax.rate === "number" &&
        tax.rate === rate,
    );

    const preferred =
      matching.find((tax) => tax.builtIn === true) ?? matching[0] ?? null;

    if (preferred?.code) {
      result.set(String(rate) as TaxRateChoice, preferred.code.trim());
    }
  }

  return result;
};

const normalizeTaxCode = (
  value: unknown,
  taxCodeByRate: Map<TaxRateChoice, string>,
): string | null => {
  const selectedRate = parseTaxRateChoice(value);
  if (selectedRate) {
    return taxCodeByRate.get(selectedRate) ?? null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    address?: AddressPayload;
    email?: string;
    recipientEmail?: string;
    sendByMail?: boolean;
    title?: string;
    intro?: string;
    note?: string;
    description?: string;
    positions?: PositionPayload[];
    isNet?: boolean;
    paid?: boolean;
    paymentMethod?: string;
    invoiceDate?: string;
    dueDate?: string;
    deliveryDate?: string;
  };

  if (!body.address || !body.positions || body.positions.length === 0) {
    return NextResponse.json(
      { error: "Missing address or positions." },
      { status: 400 },
    );
  }

  const rawPositions = body.positions.filter(
    (position) => position.unitAmount > 0,
  );
  if (rawPositions.length === 0) {
    return NextResponse.json(
      { error: "All positions have zero amount." },
      { status: 400 },
    );
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const account = Number.parseInt(requiredEnv("CAMPAI_ACCOUNT"), 10);
  const accountName = process.env.CAMPAI_ACCOUNT_NAME ?? "";
  const dueDays = Number.parseInt(process.env.CAMPAI_DUE_DAYS ?? "14", 10);
  const defaultCostCenter1 = getValidDefaultCostCenter();

  if (Number.isNaN(account)) {
    return NextResponse.json(
      { error: "Invalid CAMPAI_ACCOUNT" },
      { status: 500 },
    );
  }

  const receiptDate = formatDate(new Date());
  const dueDate = formatDate(
    new Date(Date.now() + Math.max(1, dueDays) * 86400000),
  );
  const sendByMail = body.sendByMail === true;
  const recipientEmail =
    typeof body.recipientEmail === "string"
      ? body.recipientEmail.trim()
      : typeof body.email === "string"
        ? body.email.trim()
        : "";

  if (sendByMail && !recipientEmail) {
    return NextResponse.json(
      { error: "Missing recipient email for automatic sending." },
      { status: 400 },
    );
  }

  const payloadReceiptDate = normalizeDate(body.invoiceDate) ?? receiptDate;
  const payloadDueDate = normalizeDate(body.dueDate) ?? dueDate;
  const payloadDeliveryDate = normalizeDate(body.deliveryDate);

  const selectedTaxRates = Array.from(
    new Set(
      rawPositions
        .map((position) => parseTaxRateChoice(position.taxCode))
        .filter((value): value is TaxRateChoice => Boolean(value)),
    ),
  );

  let taxCodeByRate = resolveTaxCodeOverrides();
  if (selectedTaxRates.length > 0) {
    const resolvedFromCampai = await resolveCampaiTaxCodesByRate({
      apiKey,
      organizationId,
    });

    for (const [rate, code] of resolvedFromCampai) {
      if (!taxCodeByRate.has(rate)) {
        taxCodeByRate.set(rate, code);
      }
    }

    const unresolved = selectedTaxRates.filter((rate) => !taxCodeByRate.has(rate));
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `Steuercode-Zuordnung fehlt für ${unresolved.join(", ")}%. Bitte CAMPAI_TAX_CODE_0 / CAMPAI_TAX_CODE_7 / CAMPAI_TAX_CODE_19 setzen oder die Steuercodes in Campai (Accounting Plan) prüfen.`,
        },
        { status: 400 },
      );
    }
  }

  const positions = rawPositions
    .map((position) => {
      const rawPositionCostCenter = parsePositiveInt(position.costCenter1);
      const positionCostCenter =
        rawPositionCostCenter && isValidCampaiCostCenter1(rawPositionCostCenter)
          ? rawPositionCostCenter
          : defaultCostCenter1;

      if (!positionCostCenter) {
        return null;
      }

      return {
        unitAmount: position.unitAmount,
        discount: normalizeDiscount(position.discount),
        description: position.description,
        account,
        details: position.details ?? "",
        quantity: position.quantity,
        unit:
          typeof position.unit === "string" && position.unit.trim()
            ? position.unit.trim()
            : "",
        costCenter1: positionCostCenter,
        costCenter2: null,
        taxCode: normalizeTaxCode(position.taxCode, taxCodeByRate),
      };
    })
    .filter((position): position is NonNullable<typeof position> =>
      Boolean(position),
    );

  if (positions.length === 0) {
    return NextResponse.json(
      {
        error:
          "Bitte mindestens eine gültige Position mit Beschreibung, Menge, Einzelpreis und gültiger Kostenstelle angeben.",
      },
      { status: 400 },
    );
  }

  const invalidRawCostCenter = rawPositions.find((position) => {
    const parsed = parsePositiveInt(position.costCenter1);
    return parsed !== null && !isValidCampaiCostCenter1(parsed);
  });

  const invalidCostCenter = positions.find(
    (position) => !isValidCampaiCostCenter1(position.costCenter1),
  );

  if (invalidCostCenter) {
    return NextResponse.json(
      {
        error: invalidRawCostCenter
          ? "Ungültige Kostenstelle. Die erste Zahl muss 1, 2, 3, 4 oder 9 sein. Bitte Kostenstelle korrigieren oder CAMPAI_COST_CENTER1 als gültigen Fallback setzen."
          : "Ungültige Kostenstelle. Die erste Zahl muss 1, 2, 3, 4 oder 9 sein.",
      },
      { status: 400 },
    );
  }

  const payload = {
    draft: false,
    address: {
      ...body.address,
      country: String(body.address.country),
    },
    title: body.title?.trim() || "Rechnung",
    intro:
      body.intro?.trim() ||
      "Für [text] erlauben wir Ihnen folgenden Betrag in Rechnung zu stellen",
    account,
    isNet: body.isNet ?? true,
    deliveryDateType: payloadDeliveryDate ? "delivery" : "service",
    receiptDate: payloadReceiptDate,
    dueDate: payloadDueDate,
    deliveryDate: payloadDeliveryDate ?? undefined,
    email: recipientEmail,
    sendMethod: sendByMail ? "email" : "none",
    accountName,
    receiptNumber: null,
    customerType: "debtor",
    customerNumber: [],
    description: body.description ?? "",
    paid: body.paid === true,
    paymentMethod:
      typeof body.paymentMethod === "string" ? body.paymentMethod : undefined,
    note: body.note ?? "",
    discount: 0,
    discountType: "%",
    positions,
    doNotSendReceipt: !sendByMail,
    queueReceiptDocument: sendByMail,
    tags: ["API"],
  };

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/receipts/invoice`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: errorBody || "Campai request failed." },
      { status: response.status },
    );
  }

  const dataResponse = (await response.json()) as { _id?: string };
  return NextResponse.json({ id: dataResponse._id ?? null });
};
