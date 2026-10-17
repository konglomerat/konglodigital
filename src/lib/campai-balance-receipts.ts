const CAMPAI_RECEIPTS_PAGE_SIZE = 100;
const CAMPAI_RECEIPTS_MAX_PAGES = 50;

import {
  createCampaiAccountingAccountLabelMap,
  fetchCampaiAccountingAccounts,
} from "@/lib/campai-accounting-accounts";
import {
  createCampaiCashAccountLabelMap,
  fetchCampaiCashAccounts,
} from "@/lib/campai-cash-accounts";
import {
  OPENING_BALANCE_ACCOUNT,
  OPENING_BALANCE_TYPE,
  isCashRegisterAccount,
} from "@/lib/campai-cash-register-balances";

const CAMPAI_POSTINGS_PAGE_SIZE = 100;
const CAMPAI_POSTINGS_MAX_PAGES = 50;

export type CampaiReceiptPosition = {
  account: number | null;
  accountLabel: string | null;
  costCenter1: number | null;
  costCenter2: number | null;
  amount: number | null;
  description: string | null;
};

export type CampaiBalanceReceipt = {
  id: string;
  /** "cashRegister": Buchung aus dem Kassenbuch einer Barkasse — kein Beleg,
   *  also ohne PDF und Detailansicht. */
  source: "receipt" | "cashRegister";
  receiptDate: string | null;
  createdAt: string | null;
  paidAt: string | null;
  receiptNumber: string | null;
  account: number | null;
  accountName: string | null;
  description: string | null;
  totalGrossAmount: number | null;
  type: string | null;
  paymentStatus: string | null;
  paymentAccounts: number[];
  paymentAccountNames: string[];
  tags: string[];
  positions: CampaiReceiptPosition[];
};

type RawPosition = {
  account?: number | null;
  costCenter1?: number | null;
  costCenter2?: number | null;
  amount?: number | null;
  description?: string | null;
};

type RawReceipt = {
  _id?: string;
  receiptDate?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  receiptNumber?: string | null;
  account?: number | null;
  accountName?: string | null;
  description?: string | null;
  totalGrossAmount?: number | null;
  type?: string | null;
  paymentStatus?: string | null;
  draft?: boolean | null;
  canceledAt?: string | null;
  payments?: Array<{
    account?: number | null;
  }> | null;
  tags?: string[] | null;
  positions?: RawPosition[] | null;
};

type CampaiReceiptsResponse = {
  count?: number;
  receipts?: RawReceipt[];
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizePositions = (raw: RawReceipt["positions"]): CampaiReceiptPosition[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((position) => ({
    account: toNumberOrNull(position?.account),
    accountLabel: null,
    costCenter1: toNumberOrNull(position?.costCenter1),
    costCenter2: toNumberOrNull(position?.costCenter2),
    amount: toNumberOrNull(position?.amount),
    description: toStringOrNull(position?.description),
  }));
};

const normalizePaymentAccounts = (raw: RawReceipt["payments"]): number[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .map((payment) => toNumberOrNull(payment?.account))
        .filter((account): account is number => account !== null && account > 0),
    ),
  );
};

const normalizeReceipt = (raw: RawReceipt): CampaiBalanceReceipt | null => {
  const id = toStringOrNull(raw._id);
  if (!id) {
    return null;
  }

  // Nur offene und bezahlte Belege: Entwürfe sind noch nicht gebucht, und ein
  // Storno legt in Campai keinen Gegenbeleg an, sondern markiert das Original
  // mit canceledAt — es bliebe sonst als „offen“ stehen.
  if (raw.draft === true || toStringOrNull(raw.canceledAt)) {
    return null;
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const paymentAccounts = normalizePaymentAccounts(raw.payments);

  return {
    id,
    source: "receipt",
    receiptDate: toStringOrNull(raw.receiptDate),
    createdAt: toStringOrNull(raw.createdAt),
    paidAt: toStringOrNull(raw.paidAt),
    receiptNumber: toStringOrNull(raw.receiptNumber),
    account: toNumberOrNull(raw.account),
    accountName: toStringOrNull(raw.accountName),
    description: toStringOrNull(raw.description),
    totalGrossAmount: toNumberOrNull(raw.totalGrossAmount),
    type: toStringOrNull(raw.type),
    paymentStatus: toStringOrNull(raw.paymentStatus),
    paymentAccounts,
    paymentAccountNames: [],
    tags,
    positions: normalizePositions(raw.positions),
  };
};

const fetchReceiptsPage = async (params: {
  apiKey: string;
  baseUrl: string;
  costCenter2Values: number[];
  offset: number;
  limit: number;
}) => {
  const { apiKey, baseUrl, costCenter2Values, offset, limit } = params;

  const requestBody: Record<string, unknown> = {
    sort: { receiptDate: "desc" },
    limit,
    offset,
    returnCount: true,
  };

  // Campai erwartet userFilter als JSON-String — ein Objekt wird ohne Fehler
  // angenommen, aber ignoriert, und die Liste enthält dann alle Belege.
  // Je Kostenstelle ein eigenes equals: between auf positions.costCenter2
  // träfe auch Belege, bei denen nur verschiedene Positionen die Grenzen
  // erfüllen.
  if (costCenter2Values.length > 0) {
    requestBody.userFilter = JSON.stringify({
      operator: "or",
      groups: costCenter2Values.map((value) => ({
        operator: "and",
        fields: [
          {
            path: "positions.costCenter2",
            comparator: "equals",
            value,
          },
        ],
      })),
    });
  }

  const response = await fetch(`${baseUrl}/finance/receipts/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || "Campai receipts could not be loaded.",
    );
  }

  const payload = (await response.json()) as CampaiReceiptsResponse;
  const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
  const count =
    typeof payload.count === "number" && Number.isFinite(payload.count)
      ? Math.max(0, Math.trunc(payload.count))
      : null;

  return { receipts, count };
};

// Die erste Seite nennt die Gesamtzahl, der Rest kommt dann parallel. Fehlt
// count, wird wie früher Seite für Seite geblättert.
const fetchAllReceipts = async (params: {
  apiKey: string;
  baseUrl: string;
  costCenter2Values: number[];
}): Promise<RawReceipt[]> => {
  const limit = CAMPAI_RECEIPTS_PAGE_SIZE;
  const first = await fetchReceiptsPage({ ...params, offset: 0, limit });
  if (first.receipts.length < limit) {
    return first.receipts;
  }

  const maxOffset = CAMPAI_RECEIPTS_MAX_PAGES * limit;

  if (first.count !== null) {
    const offsets: number[] = [];
    for (let offset = limit; offset < Math.min(first.count, maxOffset); offset += limit) {
      offsets.push(offset);
    }
    const pages = await Promise.all(
      offsets.map((offset) => fetchReceiptsPage({ ...params, offset, limit })),
    );
    return [first, ...pages].flatMap((page) => page.receipts);
  }

  const collected = [...first.receipts];
  for (let offset = limit; offset < maxOffset; offset += limit) {
    const page = await fetchReceiptsPage({ ...params, offset, limit });
    collected.push(...page.receipts);
    if (page.receipts.length < limit) {
      break;
    }
  }
  return collected;
};

// --- Kassenbuchungen ------------------------------------------------------
// Was im Campai-Kassenbuch einer Barkasse gebucht wird, ist kein Beleg,
// sondern ein einzelner Buchungssatz (source "cashRegister") und fehlt deshalb
// in finance/receipts/list. Damit die Werkbereiche sie trotzdem sehen, kommen
// sie als belegähnliche Zeilen dazu — ebenso der Eröffnungsbestand, den Campai
// beim Anlegen der Kasse ohne source gegen 90000 bucht. Bar bezahlte Belege buchen zwar auch auf
// die Kasse, tragen aber eine andere source und stehen schon in der Liste.

type RawPosting = {
  _id?: string;
  receiptDate?: string | null;
  createdAt?: string | null;
  receiptNumber?: string | null;
  text?: string | null;
  amount?: number | null;
  debitAccount?: number | null;
  creditAccount?: number | null;
  costCenter1?: number | null;
  costCenter2?: number | null;
  source?: string | null;
};

type CampaiPostingsResponse = {
  count?: number;
  postings?: RawPosting[];
};

/** Kasse und Bank (SKR42-Bereich "cash"): eine Gegenbuchung dorthin ist eine
 *  Umbuchung, weder Einnahme noch Ausgabe. */
const isLiquidAccount = (account: number) =>
  account >= 15500 && account <= 18949;

const fetchCashRegisterPostings = async (params: {
  apiKey: string;
  baseUrl: string;
  costCenter2Values: number[];
}): Promise<RawPosting[]> => {
  const { apiKey, baseUrl, costCenter2Values } = params;
  const collected: RawPosting[] = [];

  for (let pageIndex = 0; pageIndex < CAMPAI_POSTINGS_MAX_PAGES; pageIndex += 1) {
    const response = await fetch(`${baseUrl}/finance/accounting/postings/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sort: { receiptDate: "desc" },
        limit: CAMPAI_POSTINGS_PAGE_SIZE,
        offset: pageIndex * CAMPAI_POSTINGS_PAGE_SIZE,
        returnCount: false,
        costCenters: costCenter2Values,
        accountFilter: { accounts: [[16000, 16999]] },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        (await response.text()) || "Campai cash postings could not be loaded.",
      );
    }

    const payload = (await response.json()) as CampaiPostingsResponse;
    const page = Array.isArray(payload.postings) ? payload.postings : [];
    collected.push(...page);

    if (page.length < CAMPAI_POSTINGS_PAGE_SIZE) {
      break;
    }
  }

  return collected;
};

const normalizeCashRegisterPosting = (
  raw: RawPosting,
  costCenter2Values: Set<number>,
): CampaiBalanceReceipt | null => {
  const id = toStringOrNull(raw._id);
  const debitAccount = toNumberOrNull(raw.debitAccount);
  const creditAccount = toNumberOrNull(raw.creditAccount);
  const rawAmount = toNumberOrNull(raw.amount);
  const costCenter2 = toNumberOrNull(raw.costCenter2);

  if (
    !id ||
    debitAccount === null ||
    creditAccount === null ||
    rawAmount === null ||
    rawAmount === 0 ||
    costCenter2 === null ||
    !costCenter2Values.has(costCenter2)
  ) {
    return null;
  }

  // Kasse im Soll = Geld kommt rein. Negative Beträge drehen die Richtung.
  let incoming: boolean;
  if (isCashRegisterAccount(debitAccount)) {
    incoming = true;
  } else if (isCashRegisterAccount(creditAccount)) {
    incoming = false;
  } else {
    return null;
  }
  if (rawAmount < 0) {
    incoming = !incoming;
  }

  const cashAccount = isCashRegisterAccount(debitAccount)
    ? debitAccount
    : creditAccount;
  const counterAccount = cashAccount === debitAccount ? creditAccount : debitAccount;
  const isOpeningBalance =
    !raw.source && counterAccount === OPENING_BALANCE_ACCOUNT;
  if (
    (raw.source !== "cashRegister" && !isOpeningBalance) ||
    isLiquidAccount(counterAccount)
  ) {
    return null;
  }

  const amount = Math.abs(rawAmount);
  const receiptDate = toStringOrNull(raw.receiptDate);
  const text = toStringOrNull(raw.text);

  return {
    id,
    source: "cashRegister",
    receiptDate,
    createdAt: toStringOrNull(raw.createdAt),
    paidAt: receiptDate,
    receiptNumber: toStringOrNull(raw.receiptNumber),
    account: null,
    accountName: null,
    description: text,
    totalGrossAmount: amount,
    type: isOpeningBalance
      ? OPENING_BALANCE_TYPE
      : incoming
        ? "revenue"
        : "expense",
    paymentStatus: isOpeningBalance ? null : "paid",
    paymentAccounts: [cashAccount],
    paymentAccountNames: [],
    tags: [],
    positions: [
      {
        account: counterAccount,
        accountLabel: null,
        costCenter1: toNumberOrNull(raw.costCenter1),
        costCenter2,
        amount,
        description: text,
      },
    ],
  };
};

export const listCampaiReceiptsByCostCenter2 = async (
  costCenter2Values: number[],
): Promise<CampaiBalanceReceipt[]> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}`;

  const uniqueValues = Array.from(new Set(costCenter2Values));
  if (uniqueValues.length === 0) {
    return [];
  }

  const [cashAccounts, accountingAccounts, cashPostings, rawReceipts] =
    await Promise.all([
      fetchCampaiCashAccounts(),
      fetchCampaiAccountingAccounts(),
      fetchCashRegisterPostings({
        apiKey,
        baseUrl,
        costCenter2Values: uniqueValues,
      }),
      fetchAllReceipts({ apiKey, baseUrl, costCenter2Values: uniqueValues }),
    ]);

  const cashAccountLabelMap = createCampaiCashAccountLabelMap(cashAccounts);
  const accountingAccountLabelMap = createCampaiAccountingAccountLabelMap(
    accountingAccounts,
  );

  const collected = rawReceipts
    .map(normalizeReceipt)
    .filter((receipt): receipt is CampaiBalanceReceipt => receipt !== null);

  // Der userFilter trifft Belege mit mindestens einer passenden Position; hier
  // noch einmal lokal nachprüfen, falls Campai den Filter wieder anders liest.
  const valueSet = new Set(uniqueValues);
  const cashRegisterEntries = cashPostings
    .map((raw) => normalizeCashRegisterPosting(raw, valueSet))
    .filter((entry): entry is CampaiBalanceReceipt => entry !== null);

  return collected
    .filter((receipt) =>
      receipt.positions.some(
        (position) =>
          position.costCenter2 !== null && valueSet.has(position.costCenter2),
      ),
    )
    .concat(cashRegisterEntries)
    // Wie finance/receipts/list: neuestes Belegdatum zuerst.
    .sort(
      (left, right) =>
        (Date.parse(right.receiptDate ?? "") || 0) -
        (Date.parse(left.receiptDate ?? "") || 0),
    )
    .map((receipt) => ({
      ...receipt,
      paymentAccountNames: receipt.paymentAccounts.map(
        (account) => cashAccountLabelMap.get(String(account)) ?? `Konto ${account}`,
      ),
      positions: receipt.positions.map((position) => ({
        ...position,
        accountLabel:
          position.account !== null
            ? accountingAccountLabelMap.get(String(position.account)) ?? null
            : null,
      })),
    }));
};
