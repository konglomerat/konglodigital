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

export type KoFiLeafRow = {
  key: string;
  label: string;
  account: number | null;
  months: number[];
  total: number;
  average: number;
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
  liquidityReserve: number;
};

export type KoFiResponse = {
  year: number;
  filters: {
    costCenters1: KoFiFilterOption[];
    costCenters: KoFiFilterOption[];
    accounts: KoFiAccountOption[];
  };
  summary: KoFiSummary;
  monthlySummary: KoFiMonthlySummary[];
  costs: KoFiBlock;
  funding: KoFiBlock;
};

type CampaiReceiptType =
  | "expense"
  | "revenue"
  | "invoice"
  | "deposit"
  | "donation"
  | "offer"
  | "confirmation";

type CampaiReceiptPosition = {
  account: number | null;
  costCenter1: number | null;
  costCenter2: number | null;
  amount: number | null;
  description?: string;
  details?: string;
  reference?: string;
  secondaryReference?: string;
};

type CampaiReceipt = {
  id: string;
  type: CampaiReceiptType | null;
  receiptDate: string | null;
  receiptNumber?: string;
  title?: string;
  description?: string;
  draft: boolean;
  completing: boolean;
  canceledAt: string | null;
  positions: CampaiReceiptPosition[];
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
};

type MutableGroup = {
  key: string;
  label: string;
  months: number[];
  children: Map<string, MutableLeaf>;
};

const RECEIPT_PAGE_LIMIT = 100;

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

const createEmptySeries = () => Array.from({ length: 12 }, () => 0);

const unwrapCampaiPayload = (raw: unknown): Record<string, unknown> => {
  if (Array.isArray(raw)) {
    const first = asRecord(raw[0]);
    const result = asRecord(first?.result);
    const data = asRecord(result?.data);
    const json = asRecord(data?.json);
    return json ?? data ?? result ?? first ?? {};
  }

  return asRecord(raw) ?? {};
};

const extractReceiptArray = (
  payload: Record<string, unknown>,
): Record<string, unknown>[] => {
  const candidates = [
    payload.receipts,
    payload.items,
    payload.data,
    payload.rows,
    payload.docs,
    asRecord(payload.receipts)?.items,
    asRecord(payload.data)?.receipts,
    asRecord(payload.data)?.items,
    asRecord(payload.result)?.receipts,
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

const normalizeReceiptPosition = (
  value: unknown,
): CampaiReceiptPosition | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const account = normalizeInt(record.account);
  const amount = normalizeInt(record.amount);

  if (!account || !amount || amount <= 0) {
    return null;
  }

  return {
    account,
    costCenter1: normalizeInt(record.costCenter1),
    costCenter2: normalizeInt(record.costCenter2),
    amount,
    description: normalizeString(record.description),
    details: normalizeString(record.details),
    reference: normalizeString(record.reference),
    secondaryReference: normalizeString(record.secondaryReference),
  };
};

const normalizeReceipt = (
  value: Record<string, unknown>,
): CampaiReceipt | null => {
  const id = normalizeString(value._id ?? value.id ?? value.receiptId);
  if (!id) {
    return null;
  }

  const rawType = normalizeString(value.type);
  const type = rawType as CampaiReceiptType | null;
  const positions = Array.isArray(value.positions)
    ? value.positions
        .map((item) => normalizeReceiptPosition(item))
        .filter((item): item is CampaiReceiptPosition => Boolean(item))
    : [];

  return {
    id,
    type,
    receiptDate: normalizeString(value.receiptDate) ?? null,
    receiptNumber: normalizeString(value.receiptNumber),
    title: normalizeString(value.title),
    description: normalizeString(value.description),
    draft: normalizeBoolean(value.draft),
    completing: normalizeBoolean(value.completing),
    canceledAt: normalizeString(value.canceledAt) ?? null,
    positions,
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

const getReceiptBlock = (
  type: CampaiReceiptType | null,
): KoFiBlockKey | null => {
  switch (type) {
    case "expense":
      return "costs";
    case "revenue":
    case "invoice":
    case "deposit":
    case "donation":
      return "funding";
    default:
      return null;
  }
};

const shouldIncludeReceipt = (receipt: CampaiReceipt) => {
  if (receipt.draft || receipt.completing || receipt.canceledAt) {
    return false;
  }

  return getReceiptBlock(receipt.type) !== null && receipt.positions.length > 0;
};

const createSearchText = (parts: Array<string | number | undefined | null>) =>
  parts
    .filter(
      (part): part is string | number => part !== undefined && part !== null,
    )
    .map((part) => String(part).toLowerCase())
    .join(" ");

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
    months: createEmptySeries(),
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
    months: createEmptySeries(),
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
    average: Math.round(total / 12),
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
    average: Math.round(total / 12),
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
    average: Math.round(total / 12),
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

const fetchAllReceipts = async (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
}) => {
  const { apiKey, organizationId, mandateId } = params;
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/list`;
  const receipts: CampaiReceipt[] = [];
  let offset = 0;
  let totalCount = 0;

  while (offset === 0 || offset < totalCount) {
    const payload = {
      limit: RECEIPT_PAGE_LIMIT,
      offset,
      returnCount: true,
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

    const data = unwrapCampaiPayload(raw);
    const pageReceipts = extractReceiptArray(data)
      .map((entry) => normalizeReceipt(entry))
      .filter((entry): entry is CampaiReceipt => Boolean(entry));

    totalCount = normalizeInt(data.count) ?? pageReceipts.length;
    receipts.push(...pageReceipts);

    if (pageReceipts.length < RECEIPT_PAGE_LIMIT) {
      break;
    }

    offset += RECEIPT_PAGE_LIMIT;
  }

  return receipts;
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
    mandateId,
    year,
    costCenter1,
    costCenter2,
    account,
    search,
  } = params;

  const [receipts, costCenters, costCenters1, accountingPlan] =
    await Promise.all([
      fetchAllReceipts({ apiKey, organizationId, mandateId }),
      fetchCampaiCostCenters(),
      fetchCampaiCostCenter1Labels(),
      fetchAccountingPlan({ apiKey, organizationId }),
    ]);

  const monthlyIncome = createEmptySeries();
  const monthlyExpense = createEmptySeries();
  const costGroups = new Map<string, MutableGroup>();
  const fundingGroups = new Map<string, MutableGroup>();
  const normalizedSearch = search.trim().toLowerCase();
  const accountLabelByNumber = new Map(
    accountingPlan.accounts.map(
      (entry) => [entry.number, entry.label] as const,
    ),
  );

  for (const receipt of receipts) {
    if (!shouldIncludeReceipt(receipt)) {
      continue;
    }

    const receiptDate = parseReceiptDate(receipt.receiptDate);
    const block = getReceiptBlock(receipt.type);
    if (!receiptDate || receiptDate.year !== year || !block) {
      continue;
    }
    const monthIndex = receiptDate.month;

    for (const position of receipt.positions) {
      if (!position.amount || !position.account) {
        continue;
      }

      if (costCenter1 !== null && position.costCenter1 !== costCenter1) {
        continue;
      }

      if (costCenter2 !== null && position.costCenter2 !== costCenter2) {
        continue;
      }

      if (account !== null && position.account !== account) {
        continue;
      }

      const categoryPath = accountingPlan.incomeStatement
        ? findCategoryPath(
            accountingPlan.incomeStatement.lines,
            position.account,
          )
        : null;
      const groupLabel =
        (categoryPath && categoryPath[categoryPath.length - 1]) ||
        (block === "costs" ? "Sonstige Kosten" : "Sonstige Finanzierung");
      const accountLabel =
        accountLabelByNumber.get(position.account) ??
        `Konto ${position.account}`;
      const leafLabel = `${position.account} · ${accountLabel}`;

      const searchText = createSearchText([
        receipt.receiptNumber,
        receipt.title,
        receipt.description,
        position.description,
        position.details,
        position.reference,
        position.secondaryReference,
        position.account,
        accountLabel,
        groupLabel,
        ...(categoryPath ?? []),
      ]);

      if (normalizedSearch && !searchText.includes(normalizedSearch)) {
        continue;
      }

      const groups = block === "costs" ? costGroups : fundingGroups;
      const groupKey = `${block}:${groupLabel.toLowerCase()}`;
      const group = getOrCreateGroup(groups, groupKey, groupLabel);
      const leafKey = `${block}:${position.account}`;
      const leaf = getOrCreateLeaf(
        group.children,
        leafKey,
        leafLabel,
        position.account,
      );

      group.months[monthIndex] += position.amount;
      leaf.months[monthIndex] += position.amount;

      if (block === "costs") {
        monthlyExpense[monthIndex] += position.amount;
      } else {
        monthlyIncome[monthIndex] += position.amount;
      }
    }
  }

  const monthlySummary: KoFiMonthlySummary[] = [];
  let cumulative = 0;

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
  const liquidityReserve = Math.max(
    0,
    monthlySummary[monthlySummary.length - 1]?.cumulative ?? 0,
  );

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
      liquidityReserve,
    },
    monthlySummary,
    costs,
    funding,
  } satisfies KoFiResponse;
};
