import { fetchCampaiCashAccounts } from "@/lib/campai-cash-accounts";
import {
  fetchCampaiCostCenter1Labels,
  fetchCampaiCostCenters,
} from "@/lib/campai-cost-centers";

export const KOFI_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

export type KoFiFilterOption = {
  value: string;
  label: string;
};

export type KoFiAccountOption = KoFiFilterOption & {
  account: number;
};

export type KoFiMonthlySummary = {
  monthIndex: number;
  label: string;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
};

export type KoFiCarryoverSummary = {
  label: string;
  income: number;
  expense: number;
  balance: number;
};

export type KoFiLeafRow = {
  key: string;
  label: string;
  account: number | null;
  months: number[];
  total: number;
  average: number;
  transactions: KoFiTransaction[];
};

export type KoFiTransaction = {
  id: string;
  date: string;
  receiptNumber: string | null;
  text: string | null;
  amount: number;
  cashAccount: number;
  cashAccountLabel: string;
  counterAccount: number;
  counterAccountLabel: string;
  costCenter1: number | null;
  costCenter2: number | null;
  source: string | null;
  sourceLabel: string;
  receiptless: boolean;
  reverse: boolean;
  campaiUrl: string;
};

export type KoFiGroupRow = {
  key: string;
  label: string;
  months: number[];
  total: number;
  average: number;
  children: KoFiLeafRow[];
};

export type KoFiBlock = {
  groups: KoFiGroupRow[];
  total: number;
  average: number;
};

export type KoFiSummary = {
  totalCosts: number;
  totalFunding: number;
  variance: number;
};

export type KoFiDataQuality = {
  totalMoneyPostings: number;
  includedPostings: number;
  receiptlessPostings: number;
  internalTransfers: number;
  missingCostCenter1: number;
  missingCostCenter2: number;
  fallbackCategorized: number;
  reversedPostings: number;
  carryoverPostings: number;
  refreshedAt: string;
};

export type KoFiResponse = {
  year: number;
  filters: {
    costCenters1: KoFiFilterOption[];
    costCenters: KoFiFilterOption[];
    accounts: KoFiAccountOption[];
  };
  summary: KoFiSummary;
  dataQuality: KoFiDataQuality;
  carryover: KoFiCarryoverSummary;
  monthlySummary: KoFiMonthlySummary[];
  costs: KoFiBlock;
  funding: KoFiBlock;
};

type CampaiPosting = {
  id: string;
  receiptDate: string | null;
  receiptNumber?: string;
  text?: string;
  amount: number;
  debitAccount: number;
  creditAccount: number;
  debitAccountName?: string;
  creditAccountName?: string;
  costCenter1: number | null;
  costCenter2: number | null;
  reverse: boolean;
  source?: string;
  sourceId?: string;
};

type CampaiAccountPlanAccount = {
  number: number;
  label: string;
  bookable: boolean;
};

type CampaiIncomeStatementLine = {
  category?: string;
  accounts?: Array<number | [number, number]>;
  lines?: CampaiIncomeStatementLine[];
};

type CampaiAccountingPlan = {
  accounts: CampaiAccountPlanAccount[];
  incomeStatement: {
    lines: CampaiIncomeStatementLine[];
  } | null;
};

type KoFiBlockKey = "costs" | "funding";

type MutableLeaf = {
  key: string;
  label: string;
  account: number | null;
  months: number[];
  transactions: KoFiTransaction[];
};

type MutableGroup = {
  key: string;
  label: string;
  months: number[];
  children: Map<string, MutableLeaf>;
};

const POSTING_PAGE_LIMIT = 100;
const POSTING_CACHE_TTL_MS = 60_000;
const FUNDING_SOURCES = new Set(["invoice", "revenue", "deposit", "donation"]);
const COST_SOURCES = new Set(["expense"]);

type PostingCacheEntry = {
  expiresAt: number;
  postings: Promise<CampaiPosting[]>;
};

const postingCache = new Map<string, PostingCacheEntry>();

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

const normalizeInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
};

const sumSeries = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0);

const createMonthlySeries = () => Array.from({ length: 12 }, () => 0);
const createPeriodSeries = () => Array.from({ length: 13 }, () => 0);
const sumCurrentYearSeries = (values: number[]) => sumSeries(values.slice(1));

const extractPostingArray = (
  payload: Record<string, unknown>,
): Record<string, unknown>[] => {
  const candidates = [
    payload.postings,
    payload.items,
    payload.data,
    payload.rows,
    payload.docs,
    asRecord(payload.postings)?.items,
    asRecord(payload.data)?.postings,
    asRecord(payload.data)?.items,
    asRecord(payload.result)?.postings,
    asRecord(payload.result)?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }
  }

  return [];
};

const normalizePosting = (value: unknown): CampaiPosting | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = normalizeString(record._id ?? record.id);
  const amount = normalizeInt(record.amount);
  const debitAccount = normalizeInt(record.debitAccount);
  const creditAccount = normalizeInt(record.creditAccount);

  if (
    !id ||
    amount === null ||
    amount === 0 ||
    !debitAccount ||
    !creditAccount
  ) {
    return null;
  }

  return {
    id,
    receiptDate: normalizeString(record.receiptDate) ?? null,
    receiptNumber: normalizeString(record.receiptNumber),
    text: normalizeString(record.text),
    amount,
    debitAccount,
    creditAccount,
    debitAccountName: normalizeString(record.debitAccountName),
    creditAccountName: normalizeString(record.creditAccountName),
    costCenter1: normalizeInt(record.costCenter1),
    costCenter2: normalizeInt(record.costCenter2),
    reverse: normalizeBoolean(record.reverse),
    source: normalizeString(record.source),
    sourceId: normalizeString(record.sourceId),
  };
};

const normalizeIncomeStatementLine = (
  value: unknown,
): CampaiIncomeStatementLine | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const accounts = Array.isArray(record.accounts)
    ? record.accounts
        .map((entry) => {
          if (typeof entry === "number" && Number.isFinite(entry)) {
            return Math.trunc(entry);
          }

          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "number" &&
            typeof entry[1] === "number"
          ) {
            return [Math.trunc(entry[0]), Math.trunc(entry[1])] as [
              number,
              number,
            ];
          }

          return null;
        })
        .filter((entry): entry is number | [number, number] => Boolean(entry))
    : [];

  const lines = Array.isArray(record.lines)
    ? record.lines
        .map((line) => normalizeIncomeStatementLine(line))
        .filter((line): line is CampaiIncomeStatementLine => Boolean(line))
    : [];

  return {
    category: normalizeString(record.category),
    accounts,
    lines,
  };
};

const normalizeAccountingPlan = (payload: unknown): CampaiAccountingPlan => {
  const record = asRecord(payload);
  const accounts = Array.isArray(record?.accounts)
    ? record.accounts
        .map((entry) => {
          const account = asRecord(entry);
          const number = normalizeInt(account?.number);
          const label = normalizeString(account?.label);

          if (!number || !label) {
            return null;
          }

          return {
            number,
            label,
            bookable: normalizeBoolean(account?.bookable),
          } satisfies CampaiAccountPlanAccount;
        })
        .filter((entry): entry is CampaiAccountPlanAccount => Boolean(entry))
    : [];

  const incomeStatementRecord = asRecord(record?.incomeStatement);
  const incomeStatementLines = Array.isArray(incomeStatementRecord?.lines)
    ? incomeStatementRecord.lines
        .map((line) => normalizeIncomeStatementLine(line))
        .filter((line): line is CampaiIncomeStatementLine => Boolean(line))
    : [];

  return {
    accounts,
    incomeStatement:
      incomeStatementLines.length > 0
        ? {
            lines: incomeStatementLines,
          }
        : null,
  };
};

const matchesAccountReference = (
  account: number,
  reference: number | [number, number],
) => {
  if (typeof reference === "number") {
    return account === reference;
  }

  return account >= reference[0] && account <= reference[1];
};

const findCategoryPath = (
  lines: CampaiIncomeStatementLine[],
  account: number,
  parentPath: string[] = [],
): string[] | null => {
  for (const line of lines) {
    const path = line.category ? [...parentPath, line.category] : parentPath;
    const nestedMatch = line.lines
      ? findCategoryPath(line.lines, account, path)
      : null;

    if (nestedMatch) {
      return nestedMatch;
    }

    if (
      line.accounts?.some((reference) =>
        matchesAccountReference(account, reference),
      )
    ) {
      return path;
    }
  }

  return null;
};

const createSearchText = (parts: Array<string | number | undefined | null>) =>
  parts
    .filter(
      (part): part is string | number => part !== undefined && part !== null,
    )
    .map((part) => String(part).toLowerCase())
    .join(" ");

const createLeafKey = (params: {
  block: KoFiBlockKey;
  groupKey: string;
  account: number;
  accountLabel: string;
  isCarryover: boolean;
}) => {
  const { block, groupKey, account, accountLabel, isCarryover } = params;

  if (isCarryover) {
    return `${block}:${groupKey}:carryover:${account}`;
  }

  // Campai uses collective debtor/creditor accounts such as 100001 for
  // multiple contacts. Their posting-side account name identifies the actual
  // contact, so the account number alone is not a unique reporting row.
  return `${block}:${groupKey}:${account}:${accountLabel
    .trim()
    .toLocaleLowerCase("de-DE")}`;
};

const getOrCreateGroup = (
  groups: Map<string, MutableGroup>,
  key: string,
  label: string,
): MutableGroup => {
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const created: MutableGroup = {
    key,
    label,
    months: createPeriodSeries(),
    children: new Map<string, MutableLeaf>(),
  };
  groups.set(key, created);
  return created;
};

const getOrCreateLeaf = (
  children: Map<string, MutableLeaf>,
  key: string,
  label: string,
  account: number | null,
): MutableLeaf => {
  const existing = children.get(key);
  if (existing) {
    return existing;
  }

  const created: MutableLeaf = {
    key,
    label,
    account,
    months: createPeriodSeries(),
    transactions: [],
  };
  children.set(key, created);
  return created;
};

const finalizeLeaf = (leaf: MutableLeaf): KoFiLeafRow => {
  const total = sumSeries(leaf.months);

  return {
    key: leaf.key,
    label: leaf.label,
    account: leaf.account,
    months: [...leaf.months],
    total,
    average: Math.round(sumCurrentYearSeries(leaf.months) / 12),
    transactions: [...leaf.transactions].sort((left, right) => {
      const dateDifference =
        new Date(right.date).getTime() - new Date(left.date).getTime();
      if (dateDifference !== 0) {
        return dateDifference;
      }
      return (left.receiptNumber ?? left.id).localeCompare(
        right.receiptNumber ?? right.id,
        "de",
      );
    }),
  };
};

const finalizeGroup = (group: MutableGroup): KoFiGroupRow => {
  const children = Array.from(group.children.values())
    .map((entry) => finalizeLeaf(entry))
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      if (
        left.account !== null &&
        right.account !== null &&
        left.account !== right.account
      ) {
        return left.account - right.account;
      }

      return left.label.localeCompare(right.label, "de");
    });

  const total = sumSeries(group.months);

  return {
    key: group.key,
    label: group.label,
    months: [...group.months],
    total,
    average: Math.round(sumCurrentYearSeries(group.months) / 12),
    children,
  };
};

const finalizeBlock = (groups: Map<string, MutableGroup>): KoFiBlock => {
  const rows = Array.from(groups.values())
    .map((entry) => finalizeGroup(entry))
    .filter((entry) => entry.total !== 0)
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.label.localeCompare(right.label, "de");
    });

  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return {
    groups: rows,
    total,
    average: Math.round(
      rows.reduce(
        (sum, row) => sum + sumCurrentYearSeries(row.months),
        0,
      ) / 12,
    ),
  };
};

const parseReceiptDate = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return { year: parsed.getFullYear(), month: parsed.getMonth() };
};

const fetchCampaiJson = async (url: string, init: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Campai API error: ${response.status} ${await response.text().catch(() => "")}`,
    );
  }

  return response.json().catch(() => null);
};

const fetchAllPostingsFromCampai = async (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  year: number;
  cashAccounts: number[];
}) => {
  const { apiKey, organizationId, mandateId, year, cashAccounts } = params;
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounting/postings/list`;
  const postings: CampaiPosting[] = [];
  let offset = 0;
  let totalCount = 0;

  if (cashAccounts.length === 0) {
    return postings;
  }

  while (offset === 0 || offset < totalCount) {
    const payload: Record<string, unknown> = {
      limit: POSTING_PAGE_LIMIT,
      offset,
      returnCount: true,
      range: {
        from: { year, monthIndex: 1 },
        to: { year, monthIndex: 12 },
      },
      accountFilter: {
        accounts: cashAccounts,
      },
      sort: { receiptDate: "asc" },
    };

    const raw = await fetchCampaiJson(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = asRecord(raw) ?? {};
    const pageEntries = extractPostingArray(data);
    const pagePostings = pageEntries
      .map((entry) => normalizePosting(entry))
      .filter((entry): entry is CampaiPosting => Boolean(entry));

    totalCount = normalizeInt(data.count) ?? pagePostings.length;
    postings.push(...pagePostings);

    if (pageEntries.length < POSTING_PAGE_LIMIT) {
      break;
    }

    offset += POSTING_PAGE_LIMIT;
  }

  return postings;
};

const fetchAllPostings = (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  year: number;
  cashAccounts: number[];
}) => {
  const cacheKey = [
    params.organizationId,
    params.mandateId,
    params.year,
    [...params.cashAccounts].sort((left, right) => left - right).join(","),
  ].join(":");
  const now = Date.now();
  const cached = postingCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.postings;
  }

  const postings = fetchAllPostingsFromCampai(params).catch((error) => {
    if (postingCache.get(cacheKey)?.postings === postings) {
      postingCache.delete(cacheKey);
    }
    throw error;
  });

  postingCache.set(cacheKey, {
    expiresAt: now + POSTING_CACHE_TTL_MS,
    postings,
  });

  return postings;
};

const getSemanticBlock = (
  source: string | undefined,
  debitIsCash: boolean,
): KoFiBlockKey => {
  const normalizedSource = source?.toLowerCase();

  if (normalizedSource && COST_SOURCES.has(normalizedSource)) {
    return "costs";
  }

  if (normalizedSource && FUNDING_SOURCES.has(normalizedSource)) {
    return "funding";
  }

  return debitIsCash ? "funding" : "costs";
};

const getFallbackGroupLabel = (
  block: KoFiBlockKey,
  source: string | undefined,
) => {
  switch (source?.toLowerCase()) {
    case "expense":
      return "Belegzahlungen";
    case "invoice":
      return "Rechnungszahlungen";
    case "donation":
      return "Spenden";
    case "deposit":
      return "Anzahlungen";
    case "revenue":
      return "Einnahmen";
    default:
      return block === "costs" ? "Sonstige Kosten" : "Sonstige Finanzierung";
  }
};

const getSourceLabel = (source: string | undefined) => {
  switch (source?.toLowerCase()) {
    case "cashtransaction":
      return "Einfache Zuordnung";
    case "postingreceipt":
      return "Sammelbuchung";
    case "expense":
      return "Ausgabenbeleg";
    case "invoice":
      return "Rechnung";
    case "donation":
      return "Spende";
    case "deposit":
      return "Anzahlung";
    case "revenue":
      return "Einnahmenbeleg";
    case "forward":
      return "Saldenvortrag";
    default:
      return "Buchung";
  }
};

const isReceiptlessSource = (source: string | undefined) => {
  const normalizedSource = source?.toLowerCase();
  return (
    normalizedSource === "cashtransaction" ||
    normalizedSource === "postingreceipt"
  );
};

const createCampaiPostingUrl = (params: {
  appOrganizationSlug: string;
  mandateId: string;
  posting: CampaiPosting;
}) => {
  const { appOrganizationSlug, mandateId, posting } = params;
  const appBase = `https://app.campai.com/ad/${appOrganizationSlug}/${mandateId}`;

  if (
    posting.source?.toLowerCase() === "cashtransaction" &&
    posting.sourceId
  ) {
    return `${appBase}/finance/cashAccounts?cashTransactionId=${encodeURIComponent(posting.sourceId)}`;
  }

  const searchTerm = posting.receiptNumber ?? posting.text ?? posting.id;
  return `${appBase}/finance/postings/list/all?searchTerm=${encodeURIComponent(searchTerm)}`;
};

const fetchAccountingPlan = async (params: {
  apiKey: string;
  organizationId: string;
}) => {
  const { apiKey, organizationId } = params;
  const endpoint = `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`;
  const raw = await fetchCampaiJson(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
  });

  return normalizeAccountingPlan(raw);
};

export const loadCampaiKoFi = async (params: {
  apiKey: string;
  organizationId: string;
  appOrganizationSlug: string;
  mandateId: string;
  year: number;
  costCenter1: number | null;
  costCenter2: number | null;
  account: number | null;
  search: string;
}) => {
  const {
    apiKey,
    organizationId,
    appOrganizationSlug,
    mandateId,
    year,
    costCenter1,
    costCenter2,
    account,
    search,
  } = params;

  const [cashAccounts, costCenters, costCenters1, accountingPlan] =
    await Promise.all([
      fetchCampaiCashAccounts({ includeArchived: true }),
      fetchCampaiCostCenters(),
      fetchCampaiCostCenter1Labels(),
      fetchAccountingPlan({ apiKey, organizationId }),
    ]);
  const cashAccountNumbers = cashAccounts
    .map((entry) => normalizeInt(entry.value))
    .filter((entry): entry is number => entry !== null);
  const cashAccountSet = new Set(cashAccountNumbers);
  const cashAccountLabelByNumber = new Map(
    cashAccounts.flatMap((entry) => {
      const accountNumber = normalizeInt(entry.value);
      return accountNumber === null
        ? []
        : ([[accountNumber, entry.label]] as Array<[number, string]>);
    }),
  );
  const postings = await fetchAllPostings({
    apiKey,
    organizationId,
    mandateId,
    year,
    cashAccounts: cashAccountNumbers,
  });

  const monthlyIncome = createMonthlySeries();
  const monthlyExpense = createMonthlySeries();
  let carryoverIncome = 0;
  let carryoverExpense = 0;
  const costGroups = new Map<string, MutableGroup>();
  const fundingGroups = new Map<string, MutableGroup>();
  const normalizedSearch = search.trim().toLowerCase();
  const quality = {
    totalMoneyPostings: 0,
    includedPostings: 0,
    receiptlessPostings: 0,
    internalTransfers: 0,
    missingCostCenter1: 0,
    missingCostCenter2: 0,
    fallbackCategorized: 0,
    reversedPostings: 0,
    carryoverPostings: 0,
  };
  const accountLabelByNumber = new Map(
    accountingPlan.accounts.map(
      (entry) => [entry.number, entry.label] as const,
    ),
  );

  for (const posting of postings) {
    const postingDate = parseReceiptDate(posting.receiptDate);
    if (!postingDate || postingDate.year !== year) {
      continue;
    }

    const debitIsCash = cashAccountSet.has(posting.debitAccount);
    const creditIsCash = cashAccountSet.has(posting.creditAccount);

    // KoFi is a liquidity report: only postings with exactly one money-account
    // side are relevant. Transfers between two money accounts change neither
    // costs nor funding; the non-money side supplies the reporting category.
    if (debitIsCash && creditIsCash) {
      quality.internalTransfers += 1;
      continue;
    }

    if (!debitIsCash && !creditIsCash) {
      continue;
    }

    quality.totalMoneyPostings += 1;

    if (costCenter1 !== null && posting.costCenter1 !== costCenter1) {
      continue;
    }

    if (costCenter2 !== null && posting.costCenter2 !== costCenter2) {
      continue;
    }

    if (
      account !== null &&
      posting.debitAccount !== account &&
      posting.creditAccount !== account
    ) {
      continue;
    }

    const counterAccount = debitIsCash
      ? posting.creditAccount
      : posting.debitAccount;
    const counterAccountName = debitIsCash
      ? posting.creditAccountName
      : posting.debitAccountName;
    const cashAccount = debitIsCash
      ? posting.debitAccount
      : posting.creditAccount;
    const cashAccountLabel =
      cashAccountLabelByNumber.get(cashAccount) ??
      accountLabelByNumber.get(cashAccount) ??
      `Geldkonto ${cashAccount}`;
    const signedPostingAmount = posting.reverse
      ? -posting.amount
      : posting.amount;
    const cashDelta = debitIsCash
      ? signedPostingAmount
      : -signedPostingAmount;
    const isCarryover =
      posting.source?.toLowerCase() === "forward" ||
      (counterAccount === 90000 &&
        Boolean(posting.text?.toLowerCase().includes("saldenvortrag")));
    const block: KoFiBlockKey = isCarryover
      ? cashDelta >= 0
        ? "funding"
        : "costs"
      : getSemanticBlock(posting.source, debitIsCash);
    const categoryPath = !isCarryover && accountingPlan.incomeStatement
      ? findCategoryPath(
          accountingPlan.incomeStatement.lines,
          counterAccount,
        )
      : null;
    const usesFallbackCategory =
      !isCarryover && (!categoryPath || categoryPath.length === 0);
    const groupLabel = isCarryover
      ? `Überhang aus ${year - 1}`
      : (categoryPath && categoryPath[categoryPath.length - 1]) ||
        getFallbackGroupLabel(block, posting.source);
    const accountLabel =
      counterAccountName ??
      accountLabelByNumber.get(counterAccount) ??
      `Konto ${counterAccount}`;
    const leafLabel = isCarryover
      ? `${cashAccount} · ${cashAccountLabel}`
      : `${counterAccount} · ${accountLabel}`;

    const searchText = createSearchText([
      posting.receiptNumber,
      posting.text,
      posting.source,
      posting.sourceId,
      posting.debitAccount,
      posting.creditAccount,
      counterAccount,
      accountLabel,
      cashAccountLabel,
      groupLabel,
      isCarryover ? String(year - 1) : undefined,
      ...(categoryPath ?? []),
    ]);

    if (normalizedSearch && !searchText.includes(normalizedSearch)) {
      continue;
    }

    quality.includedPostings += 1;
    if (isCarryover) {
      quality.carryoverPostings += 1;
    }
    if (isReceiptlessSource(posting.source)) {
      quality.receiptlessPostings += 1;
    }
    if (!isCarryover && posting.costCenter1 === null) {
      quality.missingCostCenter1 += 1;
    }
    if (!isCarryover && posting.costCenter2 === null) {
      quality.missingCostCenter2 += 1;
    }
    if (usesFallbackCategory) {
      quality.fallbackCategorized += 1;
    }
    if (posting.reverse) {
      quality.reversedPostings += 1;
    }

    const amount = isCarryover
      ? Math.abs(cashDelta)
      : block === "funding"
        ? cashDelta
        : -cashDelta;
    const groups = block === "costs" ? costGroups : fundingGroups;
    const groupKey = `${block}:${groupLabel.toLowerCase()}`;
    const group = getOrCreateGroup(groups, groupKey, groupLabel);
    const leafAccount = isCarryover ? cashAccount : counterAccount;
    const leafKey = createLeafKey({
      block,
      groupKey,
      account: leafAccount,
      accountLabel,
      isCarryover,
    });
    const leaf = getOrCreateLeaf(
      group.children,
      leafKey,
      leafLabel,
      leafAccount,
    );
    const periodIndex = isCarryover ? 0 : postingDate.month + 1;

    group.months[periodIndex] += amount;
    leaf.months[periodIndex] += amount;
    leaf.transactions.push({
      id: posting.id,
      date: posting.receiptDate ?? "",
      receiptNumber: posting.receiptNumber ?? null,
      text: posting.text ?? null,
      amount,
      cashAccount,
      cashAccountLabel,
      counterAccount,
      counterAccountLabel: accountLabel,
      costCenter1: posting.costCenter1,
      costCenter2: posting.costCenter2,
      source: posting.source ?? null,
      sourceLabel: getSourceLabel(posting.source),
      receiptless: isReceiptlessSource(posting.source),
      reverse: posting.reverse,
      campaiUrl: createCampaiPostingUrl({
        appOrganizationSlug,
        mandateId,
        posting,
      }),
    });

    if (isCarryover && block === "costs") {
      carryoverExpense += amount;
    } else if (isCarryover) {
      carryoverIncome += amount;
    } else if (block === "costs") {
      monthlyExpense[postingDate.month] += amount;
    } else {
      monthlyIncome[postingDate.month] += amount;
    }
  }

  const monthlySummary: KoFiMonthlySummary[] = [];
  const carryoverBalance = carryoverIncome - carryoverExpense;
  let cumulative = carryoverBalance;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const income = monthlyIncome[monthIndex];
    const expense = monthlyExpense[monthIndex];
    const balance = income - expense;
    cumulative += balance;

    monthlySummary.push({
      monthIndex,
      label: KOFI_MONTH_LABELS[monthIndex],
      income,
      expense,
      balance,
      cumulative,
    });
  }

  const costs = finalizeBlock(costGroups);
  const funding = finalizeBlock(fundingGroups);
  const totalCosts = sumSeries(monthlyExpense);
  const totalFunding = sumSeries(monthlyIncome);

  const accountOptions = accountingPlan.accounts
    .filter((entry) => entry.bookable)
    .sort((left, right) => left.number - right.number)
    .map((entry) => ({
      account: entry.number,
      value: String(entry.number),
      label: `${entry.number} · ${entry.label}`,
    }));

  return {
    year,
    filters: {
      costCenters1,
      costCenters,
      accounts: accountOptions,
    },
    summary: {
      totalCosts,
      totalFunding,
      variance: totalFunding - totalCosts,
    },
    dataQuality: {
      ...quality,
      refreshedAt: new Date().toISOString(),
    },
    carryover: {
      label: String(year - 1),
      income: carryoverIncome,
      expense: carryoverExpense,
      balance: carryoverBalance,
    },
    monthlySummary,
    costs,
    funding,
  } satisfies KoFiResponse;
};
