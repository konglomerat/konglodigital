// Tarif, Beiträge und offener Saldo eines Mitglieds — live aus Campai, nichts davon
// wird in Supabase gespiegelt. Die übrigen Sichten auf denselben Kontakt
// stehen in `campai-contact-directory.ts` (Mitgliedsstatus, Tags, Liste) und
// `campai-contact-profile.ts` (Stammdaten der Kontoseite).
//
// Drei Eigenheiten der Campai-Daten, die den Weg hierher bestimmen:
//
// 1. Der Tarif ist keine Eigenschaft des Kontakts und auch kein Segment — die
//    Segmente eines Kontakts sind undurchsichtige IDs. Er steckt als *Option*
//    an einem Vertrag: alle Abos laufen über denselben Plan
//    „Monatsmehrbeitrag (Zugangskarte)", klein und groß unterscheiden sich
//    allein durch die gebuchte Option.
// 2. Die Vertragsliste im Kontakt ist eine Kurzfassung **ohne** `options` —
//    deshalb reicht `crm/contacts` nicht, es braucht `crm/contracts`. Der
//    Kontakt liefert dafür den Debitorensaldo.
// 3. Der Vertrag nennt nur IDs: welcher Plan, welche Option. Was sie bedeuten
//    und was sie kosten, steht im Tarifkatalog (`campai-plans`) — deshalb
//    stehen hier keine Plan- oder Options-IDs mehr.
//
// Ein einzelnes Mitglied wird über die Kontakt-ID aus
// `member_profiles.campai_contact_id` angesprochen: `crm/contracts/list` mit
// `contactId` für die Verträge — dieser Filter greift, anders als der
// `userFilter` der Kontaktliste (live geprüft).
import type {
  CampaiAccessTariff,
  CampaiTariffCatalog,
  CampaiTariffEntry,
} from "@/lib/campai-plans";
import { fetchCampaiTariffCatalog, tariffEntryFor } from "@/lib/campai-plans";

export type { CampaiAccessTariff } from "@/lib/campai-plans";

type CampaiTariffFields = {
  tariff: CampaiAccessTariff;
  /** Wie Campai den gebuchten Tarif nennt — `null` bei „keiner". */
  tariffLabel: string | null;
  /** Preis des gebuchten Tarifs in Cent — `null` bei „keiner". */
  tariffPriceCents: number | null;
};

export type CampaiMemberSnapshot = CampaiTariffFields & {
  /** Offener Beitrag in Cent, positiv = schuldet dem Verein. */
  openBalanceCents: number | null;
};

/** Alles, was die Rubrik „Mitgliedschaft" aus den Verträgen braucht. */
export type CampaiMembership = CampaiTariffFields & {
  /** Voller Jahresbeitrag in Cent — ohne anteilige Kürzung im Eintrittsjahr. */
  annualFeeCents: number | null;
};

const PAGE_SIZE = 100;

type RawCollectionAmount = {
  adjustedAmount?: number | null;
  optionsAmount?: number | null;
};

type RawCollection = {
  collectAt?: string | null;
  amount?: number | null;
  description?: string | null;
  amounts?: RawCollectionAmount[] | null;
};

type RawContract = {
  startAt?: string | null;
  endAt?: string | null;
  terminatedAt?: string | null;
  plan?: { plan?: string | null; interval?: string | null } | null;
  options?: unknown;
  contact?: { contact?: string | null } | null;
  lastCollection?: RawCollection | null;
  nextCollection?: RawCollection | null;
};

type RawContact = {
  _id?: string;
  debtor?: {
    totalOwedFromDebtor?: number | null;
    totalOwedToDebtor?: number | null;
  } | null;
};

type ContactListResponse = { contacts?: RawContact[] };
type ContractListResponse = { contracts?: RawContract[] };

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const campaiFetch = async <T>(path: string, body?: unknown): Promise<T> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    },
  );

  // Eine ID, die Campai nicht kennt (404) oder gar keine ObjectId ist (400),
  // heißt „kein Kontakt", nicht „Campai ist kaputt".
  if (response.status === 404 || response.status === 400) {
    return null as T;
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as T;
};

const toCents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const isPast = (value: string | null | undefined) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
};

/**
 * Läuft der Vertrag heute? Eine Pause zählt bewusst nicht als Ende: pausiert
 * ist genau das, was ein bewilligter Ehrenamtsbonus mit einem Abo macht — ein
 * Mitglied soll dadurch nicht plötzlich als tariflos gelten.
 */
const hasEnded = (contract: RawContract) =>
  isPast(contract.terminatedAt) || isPast(contract.endAt);

const isRunning = (contract: RawContract) =>
  !hasEnded(contract) && (!contract.startAt || isPast(contract.startAt));

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

/** Der Tarif, den ein einzelner Vertrag ausdrückt — oder keiner. */
const tariffOf = (
  contract: RawContract,
  catalog: CampaiTariffCatalog,
): CampaiTariffEntry | null => {
  if (!isRunning(contract)) return null;

  const planId = contract.plan?.plan ?? "";
  if (!planId) return null;

  return tariffEntryFor(catalog, planId, optionIds(contract.options));
};

// Der großzügigste laufende Vertrag gewinnt — wer ein Abo groß und daneben
// noch eine alte 10er Karte hat, soll nicht niedriger eingestuft werden.
const RANK: Record<CampaiAccessTariff, number> = {
  abo_gross: 3,
  abo_klein: 2,
  punktekarte: 1,
  keiner: 0,
};

const isBetter = (
  candidate: CampaiTariffEntry | null,
  current: CampaiAccessTariff,
) => candidate !== null && RANK[candidate.tariff] > RANK[current];

const bestEntry = (
  contracts: readonly RawContract[],
  catalog: CampaiTariffCatalog,
): CampaiTariffEntry | null =>
  contracts.reduce<CampaiTariffEntry | null>((best, contract) => {
    const candidate = tariffOf(contract, catalog);
    return isBetter(candidate, best?.tariff ?? "keiner") ? candidate : best;
  }, null);

const balanceOf = (contact: RawContact) =>
  contact.debtor
    ? toCents(contact.debtor.totalOwedFromDebtor) -
      toCents(contact.debtor.totalOwedToDebtor)
    : null;

/** Eine gefundene Stufe als Snapshot-Felder — oder die leere Stufe. */
const tariffFields = (entry: CampaiTariffEntry | null): CampaiTariffFields => ({
  tariff: entry?.tariff ?? "keiner",
  tariffLabel: entry?.label ?? null,
  tariffPriceCents: entry?.priceCents ?? null,
});

const fetchContracts = async (contactId: string) => {
  const payload = await campaiFetch<ContractListResponse | null>(
    "crm/contracts/list",
    { limit: PAGE_SIZE, offset: 0, contactId },
  );
  return payload?.contracts ?? [];
};

/**
 * Der volle Periodenbetrag einer Abrechnung. `amount` ist im Eintrittsjahr
 * anteilig gekürzt (60 € statt 120 €) — der Beitrag selbst steht in
 * `adjustedAmount` samt Optionen.
 */
const fullAmountOf = (collection: RawCollection | null | undefined) => {
  const amounts = collection?.amounts ?? [];
  if (amounts.length === 0) return null;
  return amounts.reduce(
    (sum, entry) =>
      sum + toCents(entry.adjustedAmount) + toCents(entry.optionsAmount),
    0,
  );
};

/**
 * Der Jahresbeitrag: ein nicht beendeter Vertrag über einen jährlichen
 * Beitragsplan. Verlängerungen legt Campai als neuen Vertrag mit Start im
 * Folgejahr an — deshalb zählt auch ein noch nicht begonnener.
 */
const annualFeeOf = (
  contracts: readonly RawContract[],
  catalog: CampaiTariffCatalog,
) => {
  const contract = contracts.find(
    (entry) =>
      !hasEnded(entry) && catalog.annualFeePlans.has(entry.plan?.plan ?? ""),
  );
  return contract
    ? (fullAmountOf(contract.nextCollection) ??
        fullAmountOf(contract.lastCollection))
    : null;
};

/**
 * Tarif und Jahresbeitrag eines Mitglieds — allein aus
 * seinen Verträgen und dem Tarifkatalog (meist aus dem Cache). Den Kontakt
 * selbst liest die Kontoseite über `campai-contact-profile`.
 */
export const fetchCampaiMembership = async (
  contactId: string,
): Promise<CampaiMembership> => {
  const [catalog, contracts] = await Promise.all([
    fetchCampaiTariffCatalog(),
    fetchContracts(contactId),
  ]);

  return {
    ...tariffFields(bestEntry(contracts, catalog)),
    annualFeeCents: annualFeeOf(contracts, catalog),
  };
};

/**
 * Tarif und offener Beitrag vieler Mitglieder — für die Antragsliste des
 * Vorstands.
 * Verträge lassen sich nicht nach mehreren Kontakten filtern, deshalb wird
 * ihre Liste einmal durchgeblättert: konstant wenige Aufrufe statt zwei je
 * Antrag. Die Salden kommen aus demselben Durchlauf über die Kontakte.
 */
export const fetchCampaiMemberSnapshots = async (
  contactIds: readonly string[],
): Promise<Map<string, CampaiMemberSnapshot>> => {
  const wanted = new Set(
    contactIds.map((value) => value?.trim()).filter(Boolean),
  );

  const snapshots = new Map<string, CampaiMemberSnapshot>();
  if (wanted.size === 0) {
    return snapshots;
  }

  const catalog = await fetchCampaiTariffCatalog();

  // Schritt 1: der Saldo je gesuchter Kontakt-ID.
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const payload = await campaiFetch<ContactListResponse>(
      "crm/contacts/list",
      { limit: PAGE_SIZE, offset, returnCount: false },
    );

    const page = payload.contacts ?? [];
    for (const contact of page) {
      if (!contact._id || !wanted.has(contact._id)) continue;
      snapshots.set(contact._id, {
        ...tariffFields(null),
        openBalanceCents: balanceOf(contact),
      });
    }

    if (page.length < PAGE_SIZE) break;
  }

  if (snapshots.size === 0) {
    return snapshots;
  }

  // Schritt 2: die Verträge dieser Kontakte — nur hier stehen die Optionen.
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const payload = await campaiFetch<ContractListResponse>(
      "crm/contracts/list",
      { limit: PAGE_SIZE, offset, returnCount: false },
    );

    const page = payload.contracts ?? [];
    for (const contract of page) {
      const contactId = contract.contact?.contact ?? "";
      const current = snapshots.get(contactId);
      if (!current) continue;

      const candidate = tariffOf(contract, catalog);
      if (isBetter(candidate, current.tariff)) {
        snapshots.set(contactId, { ...current, ...tariffFields(candidate) });
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  return snapshots;
};
