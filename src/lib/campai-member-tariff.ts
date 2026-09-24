// Tarif und offener Beitrag eines Mitglieds — live aus Campai, nichts davon
// wird in Supabase gespiegelt.
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
//    Kontakt liefert dafür Mitgliedsnummer und Debitorensaldo.
// 3. Die CRM-API vergibt andere Kontakt-IDs als die alte `/contacts`-API, aus
//    der `member_profiles.campai_contact_id` stammt — ein Abruf mit der
//    gespeicherten ID läuft ins Leere (404). Verlässlich verbindet die beiden
//    Welten die Mitgliedsnummer.

/** Der Zugangskarten-Tarif, wie Campai ihn führt. */
export type CampaiAccessTariff =
  | "abo_gross"
  | "abo_klein"
  | "punktekarte"
  | "keiner";

export type CampaiMemberSnapshot = {
  tariff: CampaiAccessTariff;
  /** Offener Beitrag in Cent, positiv = schuldet dem Verein. */
  openBalanceCents: number | null;
};

// Die Pläne und Optionen dieses Mandanten. Legt der Verein einen neuen Tarif
// an, kommt hier eine Zeile dazu — sonst nirgends.
const PLAN_MONATSMEHRBEITRAG = "685a957229734f4cbc1868c3";
const PLAN_ZEHNERKARTE_MENSCH = "685a90649f62e6eb504b1de4";
const PLAN_ZEHNERKARTE_GRUPPE = "685a97f71bc0faf3e48baf3d";

const OPTION_ABO_KLEIN = "hZ1biIRv";
const OPTION_ABO_GROSS = "qoW-uZF_";

const PAGE_SIZE = 100;

type RawContract = {
  startAt?: string | null;
  endAt?: string | null;
  terminatedAt?: string | null;
  plan?: { plan?: string | null } | null;
  options?: unknown;
  contact?: { contact?: string | null } | null;
};

type RawContact = {
  _id?: string;
  contactNumbers?: { member?: string | null } | null;
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
const isRunning = (contract: RawContract) =>
  !isPast(contract.terminatedAt) &&
  !isPast(contract.endAt) &&
  (!contract.startAt || isPast(contract.startAt));

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
const tariffOf = (contract: RawContract): CampaiAccessTariff => {
  if (!isRunning(contract)) return "keiner";

  const plan = contract.plan?.plan ?? "";

  if (plan === PLAN_MONATSMEHRBEITRAG) {
    const options = optionIds(contract.options);
    if (options.includes(OPTION_ABO_GROSS)) return "abo_gross";
    if (options.includes(OPTION_ABO_KLEIN)) return "abo_klein";
    return "keiner";
  }

  if (plan === PLAN_ZEHNERKARTE_MENSCH || plan === PLAN_ZEHNERKARTE_GRUPPE) {
    return "punktekarte";
  }

  // Jahresbeitrag und Spenden sind keine Zugangskarte.
  return "keiner";
};

// Der großzügigste laufende Vertrag gewinnt — wer ein Abo groß und daneben
// noch eine alte 10er Karte hat, soll nicht niedriger eingestuft werden.
const RANK: Record<CampaiAccessTariff, number> = {
  abo_gross: 3,
  abo_klein: 2,
  punktekarte: 1,
  keiner: 0,
};

const bestTariff = (contracts: readonly RawContract[]): CampaiAccessTariff =>
  contracts.reduce<CampaiAccessTariff>((best, contract) => {
    const candidate = tariffOf(contract);
    return RANK[candidate] > RANK[best] ? candidate : best;
  }, "keiner");

const memberNumberOf = (contact: RawContact) =>
  typeof contact.contactNumbers?.member === "string"
    ? contact.contactNumbers.member.trim()
    : "";

const balanceOf = (contact: RawContact) =>
  contact.debtor
    ? toCents(contact.debtor.totalOwedFromDebtor) -
      toCents(contact.debtor.totalOwedToDebtor)
    : null;

/**
 * Tarif und offener Beitrag eines einzelnen Mitglieds — zwei Aufrufe: den
 * Kontakt über die Mitgliedsnummer suchen, dann seine Verträge holen.
 * `null`, wenn Campai die Nummer nicht kennt — das ist etwas anderes als
 * „kein Tarif".
 */
export const fetchCampaiMemberSnapshot = async (
  memberNumber: string | null | undefined,
): Promise<CampaiMemberSnapshot | null> => {
  const needle = memberNumber?.trim();
  if (!needle) {
    return null;
  }

  // `searchTerm` sucht unscharf — deshalb wird die Nummer danach noch exakt
  // verglichen, statt dem ersten Treffer zu vertrauen.
  const found = await campaiFetch<ContactListResponse>("crm/contacts/list", {
    limit: 10,
    offset: 0,
    returnCount: false,
    searchTerm: needle,
  });

  const contact = (found.contacts ?? []).find(
    (entry) => memberNumberOf(entry) === needle,
  );

  if (!contact?._id) {
    return null;
  }

  const contracts = await campaiFetch<ContractListResponse>(
    "crm/contracts/list",
    { limit: PAGE_SIZE, offset: 0, contactId: contact._id },
  );

  return {
    tariff: bestTariff(contracts.contracts ?? []),
    openBalanceCents: balanceOf(contact),
  };
};

/**
 * Dasselbe für viele Mitglieder — für die Antragsliste des Vorstands. Campai
 * kann weder Kontakte nach Mitgliedsnummern noch Verträge nach mehreren
 * Kontakten filtern, deshalb werden beide Listen einmal durchgeblättert:
 * konstant wenige Aufrufe statt zwei je Antrag.
 */
export const fetchCampaiMemberSnapshots = async (
  memberNumbers: readonly string[],
): Promise<Map<string, CampaiMemberSnapshot>> => {
  const wanted = new Set(
    memberNumbers.map((value) => value?.trim()).filter(Boolean),
  );

  const snapshots = new Map<string, CampaiMemberSnapshot>();
  if (wanted.size === 0) {
    return snapshots;
  }

  // Schritt 1: Kontakt-ID und Saldo je gesuchter Mitgliedsnummer.
  const numberByContactId = new Map<string, string>();
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    const payload = await campaiFetch<ContactListResponse>(
      "crm/contacts/list",
      { limit: PAGE_SIZE, offset, returnCount: false },
    );

    const page = payload.contacts ?? [];
    for (const contact of page) {
      const number = memberNumberOf(contact);
      if (!number || !wanted.has(number) || !contact._id) continue;
      numberByContactId.set(contact._id, number);
      snapshots.set(number, {
        tariff: "keiner",
        openBalanceCents: balanceOf(contact),
      });
    }

    if (page.length < PAGE_SIZE) break;
  }

  if (numberByContactId.size === 0) {
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
      const number = numberByContactId.get(contract.contact?.contact ?? "");
      if (!number) continue;

      const current = snapshots.get(number);
      if (!current) continue;

      const candidate = tariffOf(contract);
      if (RANK[candidate] > RANK[current.tariff]) {
        snapshots.set(number, { ...current, tariff: candidate });
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  return snapshots;
};
