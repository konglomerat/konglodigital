import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCampaiBookingTags } from "@/lib/campai-booking-tags";
import {
  type CampaiPaymentMethodType,
  isCampaiPaymentMethodType,
} from "@/lib/campai-payment-methods";
import {
  loadCampaiConfig,
  loadInvoiceAccount,
  type CampaiConfig,
} from "@/lib/campai-receipts/config";
import { parsePositiveInt } from "@/lib/campai-receipts/parsers";
import { userCanAccessModule } from "@/lib/roles";
import {
  addCampaiReceiptNotes,
  buildCampaiReceiptCreatorNote,
} from "@/lib/campai-receipt-notes";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
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
  costCenter2?: string | null;
  discount?: number;
};

type InvoiceBody = {
  invoiceId?: string;
  address?: AddressPayload;
  email?: string;
  recipientEmail?: string;
  debtorName?: string;
  sendByMail?: boolean;
  title?: string;
  intro?: string;
  note?: string;
  internalNote?: string;
  description?: string;
  positions?: PositionPayload[];
  isNet?: boolean;
  paid?: boolean;
  paymentMethod?: string;
  paymentCashAccountId?: string;
  costCenter1?: string | number;
  positionAccount?: string | number;
  customerNumber?: string | number | Array<string | number>;
  invoiceDate?: string;
  dueDate?: string;
  deliveryDate?: string;
};

type CashAccountListResponse = {
  cashAccounts?: Array<{
    _id?: string;
    archivedAt?: string | null;
    source?: string;
    finApiConnection?: {
      connectionId?: number;
      hasSepaCreditTransfer?: boolean;
    } | null;
  }>;
};

type TaxRateChoice = "0" | "7" | "19";

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const normalizeObjectId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCustomerNumber = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
};

const normalizePaymentMethodType = (
  value: unknown,
): CampaiPaymentMethodType | null =>
  isCampaiPaymentMethodType(value) ? value : null;

const isValidCampaiCostCenter1 = (value: number): boolean => {
  const firstDigit = String(value).trim().charAt(0);
  return ["1", "2", "3", "4", "9"].includes(firstDigit);
};

const getValidDefaultCostCenter = (): number | null => {
  const parsed = parsePositiveInt(process.env.CAMPAI_COST_CENTER1);
  if (!parsed) return null;
  return isValidCampaiCostCenter1(parsed) ? parsed : null;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const normalized = `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : normalized;
  }

  const germanDateMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDateMatch) {
    const normalized = `${germanDateMatch[3]}-${germanDateMatch[2].padStart(2, "0")}-${germanDateMatch[1].padStart(2, "0")}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : normalized;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const normalizeDiscount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, parsed));
  }
  return 0;
};

const parseTaxRateChoice = (value: unknown): TaxRateChoice | null => {
  if (value === 0 || value === 7 || value === 19) {
    return String(value) as TaxRateChoice;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "0" || trimmed === "7" || trimmed === "19"
    ? trimmed
    : null;
};

const resolveTaxCodeOverrides = (): Map<TaxRateChoice, string> => {
  const map = new Map<TaxRateChoice, string>();
  const overrides: Array<[TaxRateChoice, string | undefined]> = [
    ["0", process.env.CAMPAI_TAX_CODE_0?.trim()],
    ["7", process.env.CAMPAI_TAX_CODE_7?.trim()],
    ["19", process.env.CAMPAI_TAX_CODE_19?.trim()],
  ];
  for (const [rate, code] of overrides) {
    if (code) map.set(rate, code);
  }
  return map;
};

const resolveCampaiTaxCodesByRate = async (
  config: CampaiConfig,
): Promise<Map<TaxRateChoice, string>> => {
  const response = await fetch(
    `https://cloud.campai.com/api/${config.organizationId}/finance/accounting/accountingPlan`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) return new Map();

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
    if (selectedRate === "0") return null;
    return taxCodeByRate.get(selectedRate) ?? null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const createSepaReferenceId = () =>
  String(Date.now() % 10_000_000).padStart(7, "0");

const isAvailableCashAccount = async (
  config: CampaiConfig,
  cashAccountId: string,
): Promise<boolean> => {
  const response = await fetch(
    `${config.baseUrl}/finance/cash/accounts/list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ limit: 100, offset: 0, returnCount: false }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Campai-Konten konnten nicht geladen werden.");
  }

  const payload = (await response.json().catch(() => null)) as
    | CashAccountListResponse
    | null;
  const accounts = Array.isArray(payload?.cashAccounts)
    ? payload.cashAccounts
    : [];

  return accounts.some(
    (account) =>
      typeof account._id === "string" &&
      account._id.trim() === cashAccountId &&
      !account.archivedAt &&
      (account.finApiConnection?.hasSepaCreditTransfer === true ||
        account.source === "bank"),
  );
};

const resolvePositionAccount = (body: InvoiceBody): number => {
  const requested = parsePositiveInt(body.positionAccount);
  return requested ?? loadInvoiceAccount();
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userCanAccessModule(supabase, data.user, "invoices"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let config: CampaiConfig;
  try {
    config = loadCampaiConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tags = buildCampaiBookingTags(data.user);
  const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);
  const creatorNote = buildCampaiReceiptCreatorNote({
    user: data.user,
    memberProfile,
  });

  const body = (await request.json()) as InvoiceBody;

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

  let defaultPositionAccount: number;
  try {
    defaultPositionAccount = resolvePositionAccount(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const requestedCostCenter1 = parsePositiveInt(body.costCenter1);
  const defaultCostCenter1 =
    requestedCostCenter1 && isValidCampaiCostCenter1(requestedCostCenter1)
      ? requestedCostCenter1
      : getValidDefaultCostCenter();

  if (body.costCenter1 !== undefined && !requestedCostCenter1) {
    return NextResponse.json(
      { error: "Missing or invalid numeric costCenter1." },
      { status: 400 },
    );
  }

  if (requestedCostCenter1 && !isValidCampaiCostCenter1(requestedCostCenter1)) {
    return NextResponse.json(
      {
        error:
          "Ungültige Standard-Sphäre. costCenter1 muss mit 1, 2, 3, 4 oder 9 beginnen.",
      },
      { status: 400 },
    );
  }

  const dueDays = Number.parseInt(process.env.CAMPAI_DUE_DAYS ?? "14", 10);
  const fallbackDueDate = formatDate(
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

  const payloadReceiptDate = normalizeDate(body.invoiceDate);
  const payloadDueDate = normalizeDate(body.dueDate) ?? fallbackDueDate;
  const payloadDeliveryDate = normalizeDate(body.deliveryDate);
  const existingInvoiceId = normalizeObjectId(body.invoiceId);

  if (body.invoiceId !== undefined && !existingInvoiceId) {
    return NextResponse.json(
      { error: "Ungueltige bestehende Campai-Rechnungs-ID." },
      { status: 400 },
    );
  }

  if (!payloadReceiptDate) {
    return NextResponse.json(
      { error: "Missing or invalid invoice date." },
      { status: 400 },
    );
  }

  const selectedCustomerNumber = Array.isArray(body.customerNumber)
    ? normalizeCustomerNumber(body.customerNumber[0])
    : normalizeCustomerNumber(body.customerNumber);
  const debtorAccount = parsePositiveInt(selectedCustomerNumber);
  const debtorName =
    typeof body.debtorName === "string" ? body.debtorName.trim() : "";
  const paymentMethodType = normalizePaymentMethodType(body.paymentMethod);
  const paymentCashAccountId = normalizeObjectId(body.paymentCashAccountId);
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim() : "";

  if (!debtorAccount) {
    return NextResponse.json(
      { error: "Missing or invalid debtor account." },
      { status: 400 },
    );
  }

  if (!debtorName) {
    return NextResponse.json(
      { error: "Missing debtor name." },
      { status: 400 },
    );
  }

  const selectedTaxRates = Array.from(
    new Set(
      rawPositions
        .map((position) => parseTaxRateChoice(position.taxCode))
        .filter(
          (value): value is TaxRateChoice => Boolean(value) && value !== "0",
        ),
    ),
  );

  const taxCodeByRate = resolveTaxCodeOverrides();
  if (selectedTaxRates.length > 0) {
    const resolvedFromCampai = await resolveCampaiTaxCodesByRate(config);
    for (const [rate, code] of resolvedFromCampai) {
      if (!taxCodeByRate.has(rate)) taxCodeByRate.set(rate, code);
    }
    const unresolved = selectedTaxRates.filter(
      (rate) => !taxCodeByRate.has(rate),
    );
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
      const positionCostCenter2 = parsePositiveInt(position.costCenter2);
      if (!defaultCostCenter1 || !positionCostCenter2) return null;

      return {
        unitAmount: position.unitAmount,
        discount: normalizeDiscount(position.discount),
        description: position.description,
        account: defaultPositionAccount,
        details: position.details ?? "",
        quantity: position.quantity,
        unit:
          typeof position.unit === "string" && position.unit.trim()
            ? position.unit.trim()
            : "",
        costCenter1: defaultCostCenter1,
        costCenter2: positionCostCenter2,
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

  const invalidRawCostCenter = rawPositions.find(
    (position) => parsePositiveInt(position.costCenter2) === null,
  );
  const invalidCostCenter = positions.find(
    (position) => !isValidCampaiCostCenter1(position.costCenter1),
  );

  if (invalidCostCenter) {
    return NextResponse.json(
      {
        error: invalidRawCostCenter
          ? "Ungültige Kostenstelle. Bitte einen gültigen Werkbereich bzw. ein gültiges Projekt auswählen."
          : "Ungültige Standard-Sphäre. CAMPAI_COST_CENTER1 muss mit 1, 2, 3, 4 oder 9 beginnen.",
      },
      { status: 400 },
    );
  }

  let paymentMethodPayload:
    | {
        type: CampaiPaymentMethodType;
        sepaCreditTransfer?: {
          cashAccount: string;
          referenceId: string;
          epcQRData: string;
          sepaMsgId: null;
        };
      }
    | undefined;

  if (paymentMethodType === "sepaCreditTransfer") {
    if (!paymentCashAccountId) {
      return NextResponse.json(
        { error: "Bitte ein Konto für Überweisung auswählen." },
        { status: 400 },
      );
    }

    const hasCashAccount = await isAvailableCashAccount(
      config,
      paymentCashAccountId,
    );

    if (!hasCashAccount) {
      return NextResponse.json(
        {
          error:
            "Für das ausgewählte Konto konnte kein passendes Campai-Bankkonto gefunden werden.",
        },
        { status: 400 },
      );
    }

    paymentMethodPayload = {
      type: paymentMethodType,
      sepaCreditTransfer: {
        cashAccount: paymentCashAccountId,
        referenceId: createSepaReferenceId(),
        epcQRData: "",
        sepaMsgId: null,
      },
    };
  } else if (paymentMethodType) {
    paymentMethodPayload = { type: paymentMethodType };
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
    account: debtorAccount,
    isNet: body.isNet ?? true,
    deliveryDateType: payloadDeliveryDate ? "delivery" : null,
    receiptDate: payloadReceiptDate,
    dueDate: payloadDueDate,
    deliveryDate: payloadDeliveryDate ?? undefined,
    email: recipientEmail,
    sendMethod: sendByMail ? "email" : "none",
    accountName: debtorName,
    receiptNumber: null,
    customerType: "debtor",
    customerNumber: selectedCustomerNumber ? [selectedCustomerNumber] : [],
    description: body.description ?? "",
    paid: body.paid === true,
    paymentMethod: paymentMethodPayload,
    note: body.note ?? "",
    discount: 0,
    discountType: "%",
    positions,
    doNotSendReceipt: !sendByMail,
    queueReceiptDocument: sendByMail,
    tags,
  };

  const endpoint = existingInvoiceId
    ? `${config.baseUrl}/receipts/invoice/${existingInvoiceId}`
    : `${config.baseUrl}/receipts/invoice`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      {
        error:
          errorBody ||
          (existingInvoiceId
            ? "Campai request failed while updating invoice."
            : "Campai request failed while creating invoice."),
      },
      { status: response.status },
    );
  }

  const dataResponse = (await response.json().catch(() => null)) as
    | { _id?: string; id?: string }
    | null;

  const receiptId = dataResponse?._id ?? dataResponse?.id ?? existingInvoiceId ?? null;
  let noteWarning: string | undefined;

  if (!receiptId) {
    noteWarning =
      "Rechnung erstellt, aber Campai hat keine Receipt-ID zurückgegeben. Die Campai-Notizen konnten nicht angelegt werden.";
  } else {
    const noteResult = await addCampaiReceiptNotes({
      apiKey: config.apiKey,
      organizationId: config.organizationId,
      mandateId: config.mandateId,
      receiptId,
      contents: [creatorNote, internalNote],
    });

    if (!noteResult.ok) {
      noteWarning = `Rechnung erstellt, aber die Campai-Notizen konnten nicht gespeichert werden: ${noteResult.error}`;
    }
  }

  return NextResponse.json({
    id: receiptId,
    noteWarning,
  });
};
