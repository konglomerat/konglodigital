// Der Tarifwechsel der Zugangskarte aus der Kontoseite — direkt in Campai,
// ohne Zwischenstand in Supabase. Die Lesesicht (welcher Tarif läuft) steht in
// `campai-member-tariff.ts`, der Katalog (welche Pläne und Optionen es gibt)
// in `campai-plans.ts`.
//
// Die Beitragsordnung gibt den Takt vor: der Beitrag ändert sich nur zum Ende
// eines Quartals und höchstens einmal je Quartal. Daraus folgt:
//
// * Ein Abo (klein/groß) beginnt immer am nächsten Quartalsersten; ein
//   laufendes Abo endet am letzten Tag des laufenden Quartals. Neuer und alter
//   Vertrag überschneiden sich nie.
// * „Keine Karte" beendet das laufende Abo zum Quartalsende.
// * Die 10er Karte ist ein Kauf, kein Beitrag: der Vertrag beginnt heute,
//   Campai rechnet ihn genau einmal ab, und die Rechnung geht sofort per Mail
//   raus — mit ihrer Nummer als Verwendungszweck ordnet Campai die Überweisung
//   selbst zu. Läuft daneben ein Abo, endet es wie oben zum Quartalsende.
// * Steht schon ein Wechsel an (ein Abo beginnt erst noch, oder das laufende
//   hat ein Enddatum), ist der Wechsel für dieses Quartal verbraucht.
//
// Die Zugangskarte selbst (die Plastikkarte) stellt der Verein von Hand aus.
// Beantragt wird sie als Wiedervorlage am Kontakt — Campais Todo.
import type {
  CampaiAccessTariff,
  CampaiBookablePlan,
  CampaiTariffCatalog,
} from "@/lib/campai-plans";
import { fetchCampaiTariffCatalog, tariffEntryFor } from "@/lib/campai-plans";
import type { CampaiPaymentMethod } from "@/lib/campai-contact-profile";
import { nextQuarterStart, quarterEndDate } from "@/lib/ehrenamtsbonus";

type AboTariff = "abo_klein" | "abo_gross";

export type TariffChangeTarget = CampaiAccessTariff;

/** Die Zahlwege, die ein Mitglied für ein Abo wählen kann. */
export type TariffPaymentMethod = Extract<
  CampaiPaymentMethod,
  "sepaCreditTransfer" | "sepaDirectDebit"
>;

export type TariffBankDetails = {
  recipient: string;
  iban: string;
  bic: string;
  bankName: string;
};

/** Ein Wechsel, der in Campai schon eingetragen ist und noch bevorsteht. */
export type TariffPendingChange = {
  tariff: CampaiAccessTariff;
  /** ISO-Tag, ab dem er gilt. */
  effectiveFrom: string;
};

export type TariffChangeState = {
  current: CampaiAccessTariff;
  pending: TariffPendingChange | null;
  /** ISO-Tag: hier beginnt ein jetzt beauftragtes Abo. */
  nextChangeDate: string;
  /** ISO-Tag: hier endet ein jetzt gekündigtes Abo. */
  currentQuarterEnd: string;
  /** Preis je Stufe in Cent, wie Campai ihn führt. */
  prices: Partial<Record<CampaiAccessTariff, number>>;
  /** Der Zahlweg fürs Abo — folgt dem Debitor. Heute gibt es genau einen. */
  paymentMethods: TariffPaymentMethod[];
  bank: TariffBankDetails | null;
  /** Wann eine Zugangskarte beantragt wurde, solange sie noch aussteht. */
  cardRequestedAt: string | null;
};

export type TariffChangeResult = {
  target: CampaiAccessTariff;
  /** ISO-Tag, ab dem der neue Tarif gilt. */
  effectiveFrom: string | null;
  /** Das Ende des bisherigen Abos, falls eins beendet wurde. */
  previousEndsAt: string | null;
  /** Nur bei der 10er Karte: die Rechnung ist erstellt und verschickt. */
  invoiceSent: boolean;
  cardRequested: boolean;
  /**
   * Die Mail mit Dauerauftrag und Roseguarden-Registrierung ist raus — nur beim
   * Abo per Überweisung mit Kartenantrag. Verschickt sie die Route.
   */
  instructionsMailSent: boolean;
  /** Was das Mitglied überweisen soll — nur beim Abo per Überweisung. */
  transfer: {
    bank: TariffBankDetails;
    purpose: string;
    amountCents: number;
    firstDueOn: string;
  } | null;
};

export class TariffChangeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const PAGE_SIZE = 100;

/** Marker in der Wiedervorlage — daran erkennt die App einen offenen Antrag. */
const CARD_NOTE_MARKER = "Zugangskarte ausstellen";

/** So lange Zeit bekommt der Verein für die Karte, bevor die Wiedervorlage fällig ist. */
const CARD_NOTE_DUE_DAYS = 7;

const ABO_TARIFFS: readonly CampaiAccessTariff[] = ["abo_klein", "abo_gross"];
const isAbo = (tariff: CampaiAccessTariff): tariff is AboTariff =>
  ABO_TARIFFS.includes(tariff);

type RawContract = {
  _id?: string;
  startAt?: string | null;
  endAt?: string | null;
  terminatedAt?: string | null;
  plan?: { plan?: string | null } | null;
  options?: unknown;
  customFields?: Record<string, unknown> | null;
  // Beim Beenden unverändert zurückschicken — das Update ersetzt den Vertrag.
  pause?: unknown;
  voucher?: unknown;
  fixedAmount?: unknown;
  flexibleInterval?: unknown;
};

type RawNote = {
  _id?: string;
  content?: string | null;
  createdAt?: string | null;
  doneAt?: string | null;
};

type RawCashAccount = {
  _id?: string;
  ownerName?: string | null;
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const campaiFetch = async <T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/${path}`,
    {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${errorBody}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
};

// ---------------------------------------------------------------------------
// Datum — die Quartalsgrenze gilt in Dresden, nicht in der UTC des Servers
// ---------------------------------------------------------------------------

/** Heute in Berlin, als lokales Datum ohne Uhrzeit. */
const berlinToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(part("year"), part("month") - 1, part("day"));
};

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

/** Campai führt Vertragsdaten als Mitternacht UTC. */
const campaiDate = (isoDate: string) => `${isoDate}T00:00:00.000Z`;

const dayOf = (value: string | null | undefined) =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;

export const quarterBounds = (now = new Date()) => {
  const today = berlinToday(now);
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  return {
    today: isoDay(today),
    currentQuarterEnd: quarterEndDate(today.getFullYear(), quarter),
    nextChangeDate: nextQuarterStart(today).value,
  };
};

// ---------------------------------------------------------------------------
// Verträge lesen
// ---------------------------------------------------------------------------

const optionIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : typeof (entry as { option?: unknown })?.option === "string"
              ? (entry as { option: string }).option
              : "",
        )
        .filter(Boolean)
    : [];

export type AccessContract = {
  raw: RawContract;
  id: string;
  tariff: Exclude<CampaiAccessTariff, "keiner">;
  startDay: string | null;
  endDay: string | null;
};

const fetchAccessContracts = async (
  contactId: string,
  catalog: CampaiTariffCatalog,
): Promise<AccessContract[]> => {
  const payload = await campaiFetch<{ contracts?: RawContract[] } | null>(
    "crm/contracts/list",
    { body: { limit: PAGE_SIZE, offset: 0, contactId } },
  );

  return (payload?.contracts ?? []).flatMap((raw) => {
    const entry = tariffEntryFor(
      catalog,
      raw.plan?.plan ?? "",
      optionIds(raw.options),
    );
    if (!entry || !raw._id || raw.terminatedAt) return [];
    return [
      {
        raw,
        id: raw._id,
        tariff: entry.tariff,
        startDay: dayOf(raw.startAt),
        endDay: dayOf(raw.endAt),
      },
    ];
  });
};

const RANK: Record<CampaiAccessTariff, number> = {
  abo_gross: 3,
  abo_klein: 2,
  punktekarte: 1,
  keiner: 0,
};

/**
 * Was heute läuft und was schon eingetragen ist. Ein Vertrag „läuft", wenn er
 * begonnen hat und sein letzter Tag noch nicht vorbei ist — Campai legt alte
 * Einträge mit einem Ende vor dem Beginn ab, die fallen so von selbst heraus.
 */
export const describeContracts = (contracts: AccessContract[], today: string) => {
  const running = contracts.filter(
    (contract) =>
      (!contract.startDay || contract.startDay <= today) &&
      (!contract.endDay || contract.endDay >= today),
  );
  const upcoming = contracts
    .filter((contract) => contract.startDay && contract.startDay > today)
    .filter((contract) => !contract.endDay || contract.endDay >= contract.startDay!)
    .sort((a, b) => a.startDay!.localeCompare(b.startDay!));

  const current = running.reduce<CampaiAccessTariff>(
    (best, contract) =>
      RANK[contract.tariff] > RANK[best] ? contract.tariff : best,
    "keiner",
  );
  const runningAbo = running.find((contract) => isAbo(contract.tariff)) ?? null;

  let pending: TariffPendingChange | null = null;
  if (upcoming[0]?.startDay) {
    pending = { tariff: upcoming[0].tariff, effectiveFrom: upcoming[0].startDay };
  } else if (runningAbo?.endDay) {
    // Das Abo endet, ohne dass ein neues folgt: ab dem Tag danach bleibt
    // höchstens eine laufende 10er Karte.
    const after = new Date(`${runningAbo.endDay}T12:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    const hasCard = running.some((contract) => contract.tariff === "punktekarte");
    pending = {
      tariff: hasCard ? "punktekarte" : "keiner",
      effectiveFrom: after.toISOString().slice(0, 10),
    };
  }

  return { current, runningAbo, pending };
};

// ---------------------------------------------------------------------------
// Bank, Kartenantrag
// ---------------------------------------------------------------------------

const fetchBankDetails = async (
  cashAccountId: string | null,
): Promise<TariffBankDetails | null> => {
  if (!cashAccountId) return null;

  const payload = await campaiFetch<{ cashAccounts?: RawCashAccount[] } | null>(
    "finance/cash/accounts/list",
    { body: { limit: 100, offset: 0 } },
  );
  const account = payload?.cashAccounts?.find(
    (entry) => entry._id === cashAccountId,
  );
  if (!account?.iban) return null;

  return {
    recipient: account.ownerName?.trim() || "Konglomerat e.V.",
    iban: account.iban.replace(/\s+/g, ""),
    bic: account.bic?.trim() ?? "",
    bankName: account.bankName?.trim() ?? "",
  };
};

const findOpenCardRequest = async (contactId: string) => {
  const payload = await campaiFetch<{ notes?: RawNote[] } | null>(
    `crm/contacts/${contactId}/notes/list`,
    { body: { limit: 50, offset: 0, searchTerm: CARD_NOTE_MARKER } },
  );
  const open = (payload?.notes ?? []).find(
    (note) => !note.doneAt && note.content?.includes(CARD_NOTE_MARKER),
  );
  return open ? (open.createdAt ?? new Date().toISOString()) : null;
};

/**
 * Der Plan, den ein Wechsel zu dieser Stufe bucht. Institutionen bekommen bei
 * der 10er Karte die Gruppenkarte, solange es sie gibt.
 */
const bookablePlanFor = (
  catalog: CampaiTariffCatalog,
  tariff: Exclude<CampaiAccessTariff, "keiner">,
  isInstitution: boolean,
): CampaiBookablePlan | null =>
  (tariff === "punktekarte" && isInstitution
    ? catalog.bookable.punktekarteGruppe
    : undefined) ??
  catalog.bookable[tariff] ??
  null;

const transferCashAccountOf = (catalog: CampaiTariffCatalog) =>
  catalog.bookable.abo_klein?.transferCashAccountId ??
  catalog.bookable.abo_gross?.transferCashAccountId ??
  catalog.bookable.punktekarte?.transferCashAccountId ??
  null;

const pricesOf = (catalog: CampaiTariffCatalog, isInstitution: boolean) => {
  const prices: TariffChangeState["prices"] = {};
  for (const tariff of ["abo_klein", "abo_gross", "punktekarte"] as const) {
    const plan = bookablePlanFor(catalog, tariff, isInstitution);
    if (plan) prices[tariff] = plan.priceCents;
  }
  return prices;
};

/**
 * Lastschrift kann das Mitglied hier nicht neu einrichten — Campai zieht aber
 * jedes Abo so ein, wie der Debitor eingestellt ist. Wer schon ein Mandat hat,
 * zahlt also per Lastschrift; alle anderen überweisen.
 */
const paymentMethodsFor = (
  debtorMethod: CampaiPaymentMethod | null,
): TariffPaymentMethod[] =>
  debtorMethod === "sepaDirectDebit" ? ["sepaDirectDebit"] : ["sepaCreditTransfer"];

// ---------------------------------------------------------------------------
// Öffentlich
// ---------------------------------------------------------------------------

export const fetchTariffChangeState = async (
  contactId: string,
  member: { debtorMethod: CampaiPaymentMethod | null; isInstitution: boolean },
): Promise<TariffChangeState> => {
  const catalog = await fetchCampaiTariffCatalog();
  const bounds = quarterBounds();

  const [contracts, bank, cardRequestedAt] = await Promise.all([
    fetchAccessContracts(contactId, catalog),
    fetchBankDetails(transferCashAccountOf(catalog)).catch(() => null),
    findOpenCardRequest(contactId).catch(() => null),
  ]);
  const { current, pending } = describeContracts(contracts, bounds.today);

  return {
    current,
    pending,
    nextChangeDate: bounds.nextChangeDate,
    currentQuarterEnd: bounds.currentQuarterEnd,
    prices: pricesOf(catalog, member.isInstitution),
    paymentMethods: paymentMethodsFor(member.debtorMethod),
    bank,
    cardRequestedAt,
  };
};

export type TariffChangeInput = {
  contactId: string;
  target: CampaiAccessTariff;
  paymentMethod: TariffPaymentMethod | null;
  requestCard: boolean;
  /** Fürs Todo und den Verwendungszweck — „Vorname Nachname" bzw. Institution. */
  memberName: string;
  isInstitution: boolean;
  debtorMethod: CampaiPaymentMethod | null;
};

const TARIFF_NAMES: Record<CampaiAccessTariff, string> = {
  abo_klein: "Abo Klein",
  abo_gross: "Abo Groß",
  punktekarte: "10er Karte",
  keiner: "Keine Karte",
};

const createContract = async (body: {
  planId: string;
  contactId: string;
  options: string[];
  startAt: string;
}) => {
  // `pause` ist Pflicht, auch wenn nichts pausiert (live geprüft 2026-10-11).
  const created = await campaiFetch<{ _id?: string } | null>("crm/contracts", {
    body: { ...body, pause: null },
  });
  if (!created?._id) {
    throw new Error("Campai hat keinen Vertrag zurückgegeben.");
  }
  return created._id;
};

/**
 * Setzt das Ende eines laufenden Abos. Das Update ersetzt den Vertrag: alles
 * außer dem Ende geht so zurück, wie es gelesen wurde — auch eine laufende
 * Pause (Ehrenamtsbonus).
 */
const endContract = async (
  contract: AccessContract,
  contactId: string,
  endDay: string,
) => {
  await campaiFetch(`crm/contracts/${contract.id}`, {
    body: {
      planId: contract.raw.plan?.plan,
      contactId,
      options: optionIds(contract.raw.options),
      startAt: contract.raw.startAt,
      endAt: campaiDate(endDay),
      pause: contract.raw.pause ?? null,
      voucher: contract.raw.voucher ?? null,
      fixedAmount: contract.raw.fixedAmount ?? null,
      flexibleInterval: contract.raw.flexibleInterval ?? null,
      // Ein leeres `{}` lehnt Campai ab, wenn der Plan keine Zusatzfelder kennt.
      ...(contract.raw.customFields && Object.keys(contract.raw.customFields).length > 0
        ? { customFields: contract.raw.customFields }
        : {}),
    },
  });
};

/** Campai will Kontakt und Plan beim Löschen als Query-Parameter. */
const deleteContract = (
  contractId: string,
  contactId: string,
  planId: string,
) =>
  campaiFetch(
    `crm/contracts/${contractId}?${new URLSearchParams({ contactId, planId })}`,
    { method: "DELETE" },
  );

const requireBookable = (
  catalog: CampaiTariffCatalog,
  tariff: Exclude<CampaiAccessTariff, "keiner">,
  isInstitution: boolean,
) => {
  const plan = bookablePlanFor(catalog, tariff, isInstitution);
  if (!plan) {
    throw new TariffChangeError(
      `${TARIFF_NAMES[tariff]} ist in Campai gerade nicht buchbar.`,
      503,
    );
  }
  return plan;
};

const formatGermanDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
};

const createCardRequest = async (
  contactId: string,
  memberName: string,
  tariff: CampaiAccessTariff,
) => {
  const due = new Date();
  due.setDate(due.getDate() + CARD_NOTE_DUE_DAYS);
  const assignee = process.env.CAMPAI_ACCESS_CARD_ASSIGNEE_USER_ID?.trim();

  await campaiFetch(`crm/contacts/${contactId}/notes`, {
    body: {
      content: [
        `${CARD_NOTE_MARKER} für ${memberName}.`,
        `Beantragt über die Kontoseite am ${formatGermanDay(isoDay(berlinToday()))}.`,
        `Tarif: ${TARIFF_NAMES[tariff]}.`,
      ].join("\n"),
      dueAt: due.toISOString(),
      ...(assignee ? { assignedToUserId: assignee } : {}),
    },
  });
};

export const applyTariffChange = async (
  input: TariffChangeInput,
): Promise<TariffChangeResult> => {
  const catalog = await fetchCampaiTariffCatalog();
  const bounds = quarterBounds();
  const contracts = await fetchAccessContracts(input.contactId, catalog);
  const { current, runningAbo, pending } = describeContracts(
    contracts,
    bounds.today,
  );
  const { target } = input;

  // Nur eine Karte beantragen, am Tarif nichts ändern.
  const onlyCard = target === current && target !== "punktekarte";
  if (onlyCard && !input.requestCard) {
    throw new TariffChangeError("Das ist schon dein aktueller Tarif.");
  }
  if (target === "keiner" && input.requestCard) {
    throw new TariffChangeError(
      "Eine Zugangskarte gibt es nur zusammen mit einem Tarif.",
    );
  }

  // Die 10er Karte ist ein Kauf und geht immer — außer sie müsste dafür ein
  // Abo beenden, dessen Wechsel in diesem Quartal schon vergeben ist.
  const touchesSubscription =
    !onlyCard && (target !== "punktekarte" || runningAbo !== null);
  if (touchesSubscription && pending) {
    throw new TariffChangeError(
      `Du hast schon einen Wechsel zu „${TARIFF_NAMES[pending.tariff]}" ab dem ${formatGermanDay(
        pending.effectiveFrom,
      )} eingetragen. Laut Beitragsordnung geht das nur einmal im Quartal — melde dich beim Vorstand, wenn du ihn ändern möchtest.`,
      409,
    );
  }
  if (target === "keiner" && !runningAbo && !onlyCard) {
    throw new TariffChangeError(
      "Du hast kein laufendes Abo, das sich beenden ließe — eine 10er Karte läuft einfach aus.",
    );
  }

  let effectiveFrom: string | null = null;
  let previousEndsAt: string | null = null;
  let invoiceSent = false;
  let transfer: TariffChangeResult["transfer"] = null;

  if (!onlyCard && isAbo(target)) {
    const aboPlan = requireBookable(catalog, target, input.isInstitution);
    const paymentMethod = input.paymentMethod ?? null;
    if (
      !paymentMethod ||
      !paymentMethodsFor(input.debtorMethod).includes(paymentMethod)
    ) {
      throw new TariffChangeError("Bitte wähle, wie du zahlen möchtest.");
    }

    // Erst der neue Vertrag, dann das Ende des alten: scheitert das Ende,
    // wird der neue wieder gelöscht — lieber kein Wechsel als zwei Abos.
    const contractId = await createContract({
      planId: aboPlan.planId,
      contactId: input.contactId,
      options: [],
      startAt: campaiDate(bounds.nextChangeDate),
    });
    if (runningAbo) {
      try {
        await endContract(runningAbo, input.contactId, bounds.currentQuarterEnd);
      } catch (error) {
        await deleteContract(contractId, input.contactId, aboPlan.planId).catch(
          () => undefined,
        );
        throw error;
      }
      previousEndsAt = bounds.currentQuarterEnd;
    }
    effectiveFrom = bounds.nextChangeDate;

    if (paymentMethod === "sepaCreditTransfer") {
      const bank = await fetchBankDetails(aboPlan.transferCashAccountId).catch(
        () => null,
      );
      if (bank) {
        transfer = {
          bank,
          purpose: `Monatsmehrbeitrag ${input.memberName}`.trim(),
          amountCents: aboPlan.priceCents,
          firstDueOn: bounds.nextChangeDate,
        };
      }
    }
  }

  if (!onlyCard && target === "keiner" && runningAbo) {
    await endContract(runningAbo, input.contactId, bounds.currentQuarterEnd);
    previousEndsAt = bounds.currentQuarterEnd;
    effectiveFrom = bounds.nextChangeDate;
  }

  if (target === "punktekarte") {
    const plan = requireBookable(catalog, "punktekarte", input.isInstitution);

    const contractId = await createContract({
      planId: plan.planId,
      contactId: input.contactId,
      options: [],
      startAt: campaiDate(bounds.today),
    });
    effectiveFrom = bounds.today;

    // Die Rechnung kommt aus dem Vertrag selbst: abschließen und per Mail
    // schicken. Scheitert das, steht der Vertrag trotzdem — Campai rechnet ihn
    // dann im nächsten Lauf ab, deshalb kein Rückbau.
    invoiceSent = await campaiFetch("crm/contracts/collect", {
      body: {
        selection: { ids: [contractId] },
        settings: {
          mode: "completedAndSend",
          mergeReceipts: false,
          createElectronicInvoices: false,
        },
      },
    })
      .then(() => true)
      .catch((error: unknown) => {
        console.error("Campai: 10er Karte nicht abgerechnet", error);
        return false;
      });

    if (runningAbo) {
      try {
        await endContract(runningAbo, input.contactId, bounds.currentQuarterEnd);
      } catch (error) {
        console.error("Campai: Abo nach Kauf der 10er Karte nicht beendet", error);
        throw new TariffChangeError(
          "Deine 10er Karte ist gebucht, dein Abo ließ sich aber nicht beenden. Bitte melde dich beim Vorstand.",
          502,
        );
      }
      previousEndsAt = bounds.currentQuarterEnd;
    }
  }

  let cardRequested = false;
  if (input.requestCard) {
    const open = await findOpenCardRequest(input.contactId).catch(() => null);
    if (!open) {
      await createCardRequest(input.contactId, input.memberName, target);
    }
    cardRequested = true;
  }

  return {
    target,
    effectiveFrom,
    previousEndsAt,
    invoiceSent,
    cardRequested,
    instructionsMailSent: false,
    transfer,
  };
};
