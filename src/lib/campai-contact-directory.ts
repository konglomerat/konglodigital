// Verwaltungsa Liste der Campai-Kontakte

export type CampaiDirectoryContact = {
  /** Die CRM-ID des Kontakts — das, was in `member_profiles` steht. */
  id: string;
  name: string;
  email: string | null;
  memberNumber: string | null;
  debtorAccount: number | null;
  /** Kontostand in Euro, negativ = schuldet dem Verein. */
  balance: number | null;
  segments: string[];
  tags: string[];
  types: string[];
  entryAt: string | null;
  exitAt: string | null;
  terminatedAt: string | null;
};

export type CampaiNameParts = {
  firstName: string;
  lastName: string;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toCents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

/**
 * Campai führt den Debitorensaldo in Cent und aus Sicht des Vereins:
 * `totalOwedFromDebtor` ist offen gegen das Mitglied. Die Kontaktliste zeigt
 * den Saldo aus Sicht des Mitglieds in Euro — negativ heißt also, dass es dem
 * Verein noch etwas schuldet.
 */
const normalizeBalance = (debtor: Record<string, unknown> | null) => {
  if (!debtor) {
    return null;
  }
  const cents =
    toCents(debtor.totalOwedToDebtor) - toCents(debtor.totalOwedFromDebtor);
  return cents / 100;
};

const normalizeCampaiContact = (
  record: Record<string, unknown>,
): CampaiDirectoryContact | null => {
  const id = toStringValue(record._id);
  const name = toStringValue(record.name);

  if (!id || !name) {
    return null;
  }

  const member = toRecord(record.member);
  const debtor = toRecord(record.debtor);
  const communication = toRecord(record.communication);
  const contactNumbers = toRecord(record.contactNumbers);

  return {
    id,
    name,
    email: toStringValue(communication?.email)?.toLowerCase() ?? null,
    memberNumber: toStringValue(contactNumbers?.member),
    debtorAccount: toInteger(debtor?.account),
    balance: normalizeBalance(debtor),
    segments: toStringArray(record.segments),
    tags: toStringArray(record.tags),
    types: toStringArray(record.types),
    entryAt: toStringValue(member?.entryAt),
    exitAt: toStringValue(member?.exitAt),
    terminatedAt: toStringValue(member?.terminatedAt),
  };
};

const isActiveCampaiContact = (contact: CampaiDirectoryContact) => {
  const now = Date.now();
  for (const date of [contact.terminatedAt, contact.exitAt]) {
    if (!date) continue;
    const time = new Date(date).getTime();
    if (Number.isFinite(time) && time <= now) {
      return false;
    }
  }
  return true;
};

const isMemberContact = (contact: CampaiDirectoryContact) =>
  contact.types.some((type) => type.toLowerCase() === "member");

/** Mehr nimmt `crm/contacts/list` pro Seite nicht an. */
const CAMPAI_PAGE_SIZE = 100;

const campaiRequest = async (path: string, body?: unknown): Promise<unknown> => {
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

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  // 404 und 400 sind für den Abruf einer einzelnen ID keine Ausnahme, sondern
  // die Antwort „kenne ich nicht" — Campai weist eine ID, die keine ObjectId
  // ist, mit 400 ab. Beides fängt der Aufrufer selbst ab.
  if (!response.ok && response.status !== 404 && response.status !== 400) {
    throw new Error(
      text || `Campai-Kontakte konnten nicht geladen werden (${response.status}).`,
    );
  }

  return payload;
};

const fetchCampaiContactsPage = async (offset: number) => {
  const payload = await campaiRequest("crm/contacts/list", {
    limit: CAMPAI_PAGE_SIZE,
    offset,
    returnCount: false,
  });

  const contacts = toRecord(payload)?.contacts;
  const rawList = Array.isArray(contacts) ? contacts : [];

  return rawList
    .map((entry) => {
      const record = toRecord(entry);
      return record ? normalizeCampaiContact(record) : null;
    })
    .filter((entry): entry is CampaiDirectoryContact => Boolean(entry));
};

/**
 * Der Kontakt zu einer gespeicherten ID — ein Aufruf. `null`, wenn Campai die
 * ID nicht kennt; dann ist die Verknüpfung im Profil falsch und gehört in der
 * Nutzerverwaltung neu gesetzt.
 */
const findCampaiContactById = async (contactId: string) => {
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    return null;
  }

  const payload = await campaiRequest(
    `crm/contacts/${encodeURIComponent(normalizedId)}`,
  );
  const record = toRecord(payload);
  return record ? normalizeCampaiContact(record) : null;
};

export const listAllActiveCampaiContacts = async () => {
  const collected: CampaiDirectoryContact[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < 10000; offset += CAMPAI_PAGE_SIZE) {
    const contacts = await fetchCampaiContactsPage(offset);

    for (const contact of contacts) {
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      if (isActiveCampaiContact(contact)) {
        collected.push(contact);
      }
    }

    if (contacts.length < CAMPAI_PAGE_SIZE) {
      break;
    }
  }

  return collected;
};

/** Der Kontakt zu einer ID, aber nur solange die Mitgliedschaft läuft. */
export const getCampaiActiveContactById = async (contactId: string) => {
  const contact = await findCampaiContactById(contactId);
  return contact && isActiveCampaiContact(contact) ? contact : null;
};

/** Wie oben, zusätzlich auf Mitglieder beschränkt. */
export const getCampaiActiveMemberContactById = async (contactId: string) => {
  const contact = await getCampaiActiveContactById(contactId);
  return contact && isMemberContact(contact) ? contact : null;
};

export const splitCampaiContactName = (name: string): CampaiNameParts => {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

export const buildCampaiProfileData = (contact: CampaiDirectoryContact) => ({
  campai_contact_id: contact.id,
  campai_member_number: contact.memberNumber,
  campai_debtor_account: contact.debtorAccount,
  campai_segments: contact.segments,
  campai_name: contact.name,
  avatar_url: null,
  short_bio: null,
});
