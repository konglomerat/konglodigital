// Bestand der Barkassen: Campai führt die Kassen als "cashRegisters" (Name +
// Sachkonto), kennt dort aber keinen Saldo. Der Bestand steht in der
// Buchhaltung — deshalb Kassenliste und Kontensalden zusammenführen.
//
// Anders als bei Bankkonten (finance/cash/accounts) gibt es für Barkassen kein
// `balance`-Feld; finance/accounting/balances/list liefert es über die
// Kassenkonten.

export type CampaiCashRegisterBalance = {
  account: number;
  name: string;
  /** Bestand in Cent, positiv = Geld in der Kasse. */
  balance: number;
};

export type CampaiCashRegisterBalanceSummary = {
  registers: CampaiCashRegisterBalance[];
  /** Summe aller Kassenbestände in Cent. */
  total: number;
  /** Geschäftsjahr, über das der Bestand ermittelt wurde. */
  year: number;
};

type RawCashRegister = {
  _id?: string;
  name?: string;
  account?: number | null;
};

type CashRegisterListResponse = {
  cashRegisters?: RawCashRegister[];
};

type RawAccountBalance = {
  account?: number | null;
  debit?: number | null;
  credit?: number | null;
  balance?: number | null;
  balanceType?: "none" | "debit" | "credit" | null;
};

type AccountBalanceListResponse = {
  accountBalances?: RawAccountBalance[];
};

const CASH_REGISTER_PAGE_SIZE = 100;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const campaiFetch = async <T,>(path: string, body: unknown): Promise<T> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as T;
};

const toAccountNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/\D+/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

/** Campai liefert den Saldo vorzeichenlos plus Seite — hier wieder mit Vorzeichen. */
const toSignedBalance = (entry: RawAccountBalance): number => {
  const amount = typeof entry.balance === "number" ? entry.balance : null;

  if (amount !== null && entry.balanceType) {
    if (entry.balanceType === "credit") {
      return -amount;
    }
    if (entry.balanceType === "debit") {
      return amount;
    }
    return 0;
  }

  const debit = typeof entry.debit === "number" ? entry.debit : 0;
  const credit = typeof entry.credit === "number" ? entry.credit : 0;
  return debit - credit;
};

const fetchCashRegisters = async () => {
  const registers: RawCashRegister[] = [];

  for (let offset = 0; ; offset += CASH_REGISTER_PAGE_SIZE) {
    const payload = await campaiFetch<CashRegisterListResponse>(
      "finance/cash/registers/list",
      { limit: CASH_REGISTER_PAGE_SIZE, offset, returnCount: false },
    );

    const page = Array.isArray(payload.cashRegisters)
      ? payload.cashRegisters
      : [];
    registers.push(...page);

    if (page.length < CASH_REGISTER_PAGE_SIZE) {
      return registers;
    }
  }
};

export const fetchCampaiCashRegisterBalances = async (params?: {
  year?: number;
}): Promise<CampaiCashRegisterBalanceSummary> => {
  const year = params?.year ?? new Date().getFullYear();
  const rawRegisters = await fetchCashRegisters();

  const registerNames = new Map<number, string>();
  for (const register of rawRegisters) {
    const account = toAccountNumber(register.account);
    if (account === null) {
      continue;
    }

    const name = typeof register.name === "string" ? register.name.trim() : "";
    registerNames.set(account, name.length > 0 ? name : `Konto ${account}`);
  }

  if (registerNames.size === 0) {
    return { registers: [], total: 0, year };
  }

  // Ganzes Geschäftsjahr inklusive Eröffnungsbilanz: das ergibt den heutigen
  // Bestand, nicht nur die Bewegung des Jahres.
  const payload = await campaiFetch<AccountBalanceListResponse>(
    "finance/accounting/balances/list",
    {
      limit: 10000,
      offset: 0,
      returnCount: false,
      range: {
        from: { year, monthIndex: 1 },
        to: { year, monthIndex: 12 },
      },
      accountFilter: { accounts: Array.from(registerNames.keys()) },
      includeOpeningBalances: true,
      groupMode: { groupBy: "account" },
    },
  );

  const balances = new Map<number, number>();
  for (const entry of payload.accountBalances ?? []) {
    const account = toAccountNumber(entry.account);
    if (account === null || !registerNames.has(account)) {
      continue;
    }

    balances.set(account, toSignedBalance(entry));
  }

  const registers = Array.from(registerNames.entries())
    .map(([account, name]) => ({
      account,
      name,
      balance: balances.get(account) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "de-DE"));

  return {
    registers,
    total: registers.reduce((sum, register) => sum + register.balance, 0),
    year,
  };
};

// Campai kennt keine Verknüpfung zwischen Barkasse und Werkbereich — die Kassen
// heißen zwar wie die Bereiche, sind aber weder gleich benannt noch verknüpft.
// Deshalb hier fest zugeordnet (Kostenstelle 2 → Kassenkonto). Bereiche ohne
// eigene Kasse fehlen bewusst.
export const CASH_REGISTER_ACCOUNT_BY_COST_CENTER2: Record<string, number> = {
  "50": 16000, // Basis
  "51": 16110, // 3D-Druck
  "52": 16080, // A-Druck → Barkasse Siebdruck
  "54": 16090, // CNC
  "56": 16070, // Foto/Film
  "57": 16060, // Holz
  "58": 16050, // Kuss
  "59": 16040, // Laser
  "61": 16030, // Printshop
  "62": 16020, // Textil
  "63": 16010, // Zündstoffe
  "80": 16120, // #VHC (inkl. Unterprojekte 801–807)
};

/** Kassenkonten liegen in Campai im Bereich 16000–16999. */
export const isCashRegisterAccount = (account: number): boolean =>
  account >= 16000 && account <= 16999;
