// Account Seite

/** Campai kennt genau diese beiden Korrespondenzsprachen. */
export type CampaiContactLanguage = "de" | "en";

export const CAMPAI_CONTACT_LANGUAGES: readonly CampaiContactLanguage[] = [
  "de",
  "en",
];

/** Die Adressfelder des CRM-Kontakts, eins zu eins. */
export type CampaiContactAddress = {
  /** Ländercode, z. B. „DE". */
  country: string;
  /** Bundesland — in Deutschland meist leer. */
  state: string;
  zip: string;
  city: string;
  /** Straße und Hausnummer. */
  addressLine: string;
  /** Adresszusatz. */
  details1: string;
  /** Zweiter Adresszusatz. */
  details2: string;
};

/** Zahlart des Debitors, wie Campai sie führt. */
export type CampaiPaymentMethod =
  | "sepaCreditTransfer"
  | "sepaDirectDebit"
  | "cash"
  | "online";

export type CampaiContactDebtor = {
  /** Debitorenkonto — darüber laufen die Belege des Mitglieds. */
  account: number;
  paymentMethod: CampaiPaymentMethod | null;
  /** Offener Saldo in Cent, positiv = schuldet dem Verein. */
  openBalanceCents: number;
};

/** Eine Abteilung, wie die Kontoseite sie zeigt und zur Wahl stellt. */
export type CampaiDepartment = {
  id: string;
  name: string;
};

export type CampaiContactProfile = {
  contactId: string;
  /** Kommt aus Campai und wird hier nie geschrieben — wie alle Felder bis `debtor`. */
  memberNumber: string;
  /** Eintrittsdatum (ISO), leer ohne Mitgliedschaft. */
  memberSince: string;
  /** Austrittsdatum (ISO), leer solange die Mitgliedschaft läuft. */
  memberUntil: string;
  /** Die Abteilungen, in denen das Mitglied gerade ist. */
  departments: CampaiDepartment[];
  /** `null`, solange Campai für den Kontakt kein Debitorenkonto führt. */
  debtor: CampaiContactDebtor | null;
  language: CampaiContactLanguage;
  firstName: string;
  lastName: string;
  /**
   * Bei einer Person der Organisationsname aus `person.institutionName`, bei
   * einem Institutionskontakt dessen eigener Name (`institution.name`).
   */
  organizationName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  address: CampaiContactAddress;
  /** Institutionskontakte haben keinen Vor- und Nachnamen. */
  isInstitution: boolean;
};

export type CampaiContactProfilePatch = Partial<{
  firstName: string;
  lastName: string;
  organizationName: string;
  language: CampaiContactLanguage;
  email: string;
  phone: string;
  mobilePhone: string;
  address: CampaiContactAddress;
  /** Die vollständige Wahl — was fehlt, verlässt das Mitglied. */
  departmentIds: string[];
}>;

export const EMPTY_CAMPAI_CONTACT_ADDRESS: CampaiContactAddress = {
  country: "",
  state: "",
  zip: "",
  city: "",
  addressLine: "",
  details1: "",
  details2: "",
};

type RawPerson = {
  salutation?: string;
  gender?: string | null;
  title?: string;
  firstName?: string;
  lastName?: string;
  institutionName?: string;
  printInstitutionOnAddress?: boolean;
  birthdate?: string | null;
};

type RawInstitution = {
  type?: string;
  name?: string;
};

type RawAddress = Partial<CampaiContactAddress>;

type RawCommunication = {
  email?: string;
  phone?: string;
  mobilePhone?: string;
  mailing?: boolean;
  mailingTags?: string[];
  mailingUnsubscriptions?: unknown[];
};

type RawDebtor = {
  account?: number | null;
  paymentMethodType?: string | null;
  totalOwedFromDebtor?: number | null;
  totalOwedToDebtor?: number | null;
};

type RawDepartment = {
  department?: string;
  name?: string;
  entryAt?: string | null;
  exitAt?: string | null;
};

type RawDepartmentListEntry = {
  _id?: string;
  name?: string;
  types?: string[];
  /** Kategorien gliedern nur und nehmen selbst keine Mitglieder auf. */
  category?: boolean;
};

type RawContact = {
  _id?: string;
  language?: string;
  contactNumbers?: { member?: string | null } | null;
  member?: { entryAt?: string | null; exitAt?: string | null } | null;
  debtor?: RawDebtor | null;
  departments?: RawDepartment[] | null;
  /** IDs der Abteilungen, die Campai als aktuell führt. */
  activeDepartments?: string[] | null;
  person?: RawPerson | null;
  institution?: RawInstitution | null;
  address?: RawAddress | null;
  communication?: RawCommunication | null;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const campaiRequest = async <T,>(
  path: string,
  init:
    | { method: "GET"; tolerateUnknown?: boolean }
    | { method: "POST"; body: unknown; organizationLevel?: boolean },
): Promise<T> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  // Die Abteilungen führt Campai für den ganzen Verein, nicht je Mandat.
  const scope =
    init.method === "POST" && init.organizationLevel
      ? organizationId
      : `${organizationId}/${mandateId}`;

  const response = await fetch(
    `https://cloud.campai.com/api/${scope}/${path}`,
    {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    },
  );

  const unknownContact =
    init.method === "GET" &&
    init.tolerateUnknown === true &&
    (response.status === 404 || response.status === 400);

  if (unknownContact) {
    return null as T;
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${errorBody}`);
  }

  // Die Schreibroute antwortet je nach Fall mit leerem Rumpf — das ist kein
  // Fehler, nur nichts zum Auswerten.
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const memberNumberOf = (contact: RawContact) =>
  text(contact.contactNumbers?.member);

// Ausgetretene Abteilungen bleiben in `departments` stehen; welche gerade
// gelten, sagt `activeDepartments`. Fehlt die Liste, hilft das Austrittsdatum.
const isActiveDepartment = (contact: RawContact, entry: RawDepartment) =>
  Array.isArray(contact.activeDepartments)
    ? contact.activeDepartments.includes(entry.department ?? "")
    : !entry.exitAt;

const departmentsOf = (contact: RawContact): CampaiDepartment[] =>
  (contact.departments ?? [])
    .filter((entry) => isActiveDepartment(contact, entry))
    .map((entry) => ({ id: text(entry.department), name: text(entry.name) }))
    .filter((entry) => entry.id && entry.name);

/**
 * Die neue Abteilungsliste des Kontakts. Campai ersetzt die Liste beim
 * Schreiben ganz, deshalb geht jeder Eintrag mit.
 *
 * Je Abteilung bleibt es bei einem Eintrag: Gewählte behalten ihren Eintrag
 * (ein früherer Austritt wird aufgehoben), neue kommen ohne Datum dazu, wie
 * alle bestehenden. Abgewählte aktive Abteilungen fallen heraus; frühere
 * Austritte, die nicht wieder gewählt sind, bleiben als Verlauf stehen.
 */
const nextDepartments = (contact: RawContact, departmentIds: string[]) => {
  const wanted = new Set(departmentIds);
  const kept = (contact.departments ?? []).flatMap((entry) => {
    const departmentId = text(entry.department);
    if (!departmentId) {
      return [];
    }
    const base = {
      departmentId,
      entryAt: entry.entryAt ?? null,
      exitAt: entry.exitAt ?? null,
    };
    if (wanted.has(departmentId)) {
      wanted.delete(departmentId);
      return [
        isActiveDepartment(contact, entry) ? base : { ...base, exitAt: null },
      ];
    }
    return isActiveDepartment(contact, entry) ? [] : [base];
  });

  return [
    ...kept,
    ...[...wanted].map((departmentId) => ({
      departmentId,
      entryAt: null,
      exitAt: null,
    })),
  ];
};

const toLanguage = (value: unknown): CampaiContactLanguage =>
  value === "en" ? "en" : "de";

const PAYMENT_METHODS: readonly string[] = [
  "sepaCreditTransfer",
  "sepaDirectDebit",
  "cash",
  "online",
] satisfies CampaiPaymentMethod[];

const toCents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const toDebtor = (raw: RawDebtor | null | undefined): CampaiContactDebtor | null =>
  raw && typeof raw.account === "number"
    ? {
        account: raw.account,
        paymentMethod: PAYMENT_METHODS.includes(raw.paymentMethodType ?? "")
          ? (raw.paymentMethodType as CampaiPaymentMethod)
          : null,
        openBalanceCents:
          toCents(raw.totalOwedFromDebtor) - toCents(raw.totalOwedToDebtor),
      }
    : null;

const toAddress = (raw: RawAddress | null | undefined): CampaiContactAddress =>
  raw
    ? {
        country: text(raw.country),
        state: text(raw.state),
        zip: text(raw.zip),
        city: text(raw.city),
        addressLine: text(raw.addressLine),
        details1: text(raw.details1),
        details2: text(raw.details2),
      }
    : { ...EMPTY_CAMPAI_CONTACT_ADDRESS };

const toProfile = (contact: RawContact): CampaiContactProfile | null => {
  const contactId = text(contact._id);
  if (!contactId) {
    return null;
  }

  const isInstitution = !contact.person && Boolean(contact.institution);

  return {
    contactId,
    memberNumber: memberNumberOf(contact),
    memberSince: text(contact.member?.entryAt),
    memberUntil: text(contact.member?.exitAt),
    departments: departmentsOf(contact),
    debtor: toDebtor(contact.debtor),
    language: toLanguage(contact.language),
    firstName: text(contact.person?.firstName),
    lastName: text(contact.person?.lastName),
    organizationName: isInstitution
      ? text(contact.institution?.name)
      : text(contact.person?.institutionName),
    email: text(contact.communication?.email),
    phone: text(contact.communication?.phone),
    mobilePhone: text(contact.communication?.mobilePhone),
    address: toAddress(contact.address),
    isInstitution,
  };
};

/** Der CRM-Kontakt zu einer ID. `null`, wenn Campai sie nicht kennt. */
const fetchRawContact = async (contactId: string | null | undefined) => {
  const id = contactId?.trim();
  if (!id) {
    return null;
  }

  // Eine ID, die Campai nicht kennt (404) oder gar keine ObjectId ist (400),
  // ist kein Ausfall, sondern eine falsche Verknüpfung im Profil — sie soll
  // der Kontoseite ein „nicht verknüpft" liefern, keinen Fehler.
  return campaiRequest<RawContact | null>(
    `crm/contacts/${encodeURIComponent(id)}`,
    { method: "GET", tolerateUnknown: true },
  );
};

/** Stammdaten lesen. `null`, wenn Campai die Kontakt-ID nicht kennt. */
export const fetchCampaiContactProfile = async (
  contactId: string | null | undefined,
): Promise<CampaiContactProfile | null> => {
  const contact = await fetchRawContact(contactId);
  return contact ? toProfile(contact) : null;
};

/** Alle Abteilungen, denen Mitglieder angehören können, nach Namen. */
export const fetchCampaiDepartments = async (): Promise<CampaiDepartment[]> => {
  // `sort` nimmt Campai an, wendet es aber nicht an — sortiert wird hier.
  const data = await campaiRequest<{
    departments?: RawDepartmentListEntry[];
  } | null>("crm/departments/list", {
    method: "POST",
    organizationLevel: true,
    body: { types: ["member"], limit: 1000 },
  });

  return (data?.departments ?? [])
    .filter((entry) => !entry.category && entry.types?.includes("member"))
    .map((entry) => ({ id: text(entry._id), name: text(entry.name) }))
    .filter((entry) => entry.id && entry.name)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
};

const hasAddressContent = (address: CampaiContactAddress) =>
  Object.values(address).some((entry) => entry.trim().length > 0);

/** Campai verlangt diese vier Felder, sobald überhaupt eine Adresse steht. */
export const ADDRESS_REQUIRED_FIELDS = [
  "addressLine",
  "zip",
  "city",
  "country",
] as const;

export const missingAddressFields = (address: CampaiContactAddress) =>
  hasAddressContent(address)
    ? ADDRESS_REQUIRED_FIELDS.filter((field) => !address[field].trim())
    : [];

/**
 * Stammdaten schreiben und den frisch gelesenen Stand zurückgeben.
 *
 * Mitgeschickt wird nur, was der Patch berührt — ein unberührter Block bleibt
 * ganz aus dem Rumpf, damit Campai ihn nicht anfasst. Was im berührten Block
 * nicht im Patch steht (Anrede, Titel, Geburtsdatum, Mailing-Einstellungen),
 * wird unverändert aus dem gelesenen Kontakt übernommen.
 */
export const updateCampaiContactProfile = async (
  contactId: string | null | undefined,
  patch: CampaiContactProfilePatch,
): Promise<CampaiContactProfile | null> => {
  const contact = await fetchRawContact(contactId);

  if (!contact?._id) {
    return null;
  }

  const body: Record<string, unknown> = {};

  if (patch.language) {
    body.language = patch.language;
  }

  const touchesPerson =
    patch.firstName !== undefined ||
    patch.lastName !== undefined ||
    patch.organizationName !== undefined;

  if (touchesPerson && contact.person) {
    const person = contact.person;
    body.person = {
      salutation: person.salutation ?? "",
      gender: person.gender ?? null,
      title: person.title ?? "",
      firstName: patch.firstName ?? person.firstName ?? "",
      lastName: patch.lastName ?? person.lastName ?? "",
      institutionName: patch.organizationName ?? person.institutionName ?? "",
      printInstitutionOnAddress: person.printInstitutionOnAddress ?? false,
      birthdate: person.birthdate ?? null,
    };
  }

  // Beim Institutionskontakt gibt es keine Vor- und Nachnamen; der
  // Organisationsname ist dort der Name des Kontakts selbst.
  if (
    patch.organizationName !== undefined &&
    !contact.person &&
    contact.institution
  ) {
    body.institution = {
      type: contact.institution.type ?? "other",
      name: patch.organizationName || (contact.institution.name ?? ""),
    };
  }

  const touchesCommunication =
    patch.email !== undefined ||
    patch.phone !== undefined ||
    patch.mobilePhone !== undefined;

  if (touchesCommunication) {
    const communication = contact.communication ?? {};
    body.communication = {
      email: patch.email ?? communication.email ?? "",
      phone: patch.phone ?? communication.phone ?? "",
      mobilePhone: patch.mobilePhone ?? communication.mobilePhone ?? "",
      mailing: communication.mailing ?? true,
      mailingTags: communication.mailingTags ?? [],
      mailingUnsubscriptions: communication.mailingUnsubscriptions ?? [],
    };
  }

  if (patch.address !== undefined) {
    // Eine komplett leere Adresse ist in Campai keine leeren Felder, sondern
    // gar keine Adresse.
    body.address = hasAddressContent(patch.address)
      ? {
          country: patch.address.country,
          state: patch.address.state,
          zip: patch.address.zip,
          city: patch.address.city,
          addressLine: patch.address.addressLine,
          details1: patch.address.details1,
          details2: patch.address.details2,
        }
      : null;
  }

  if (patch.departmentIds !== undefined) {
    body.departments = nextDepartments(contact, patch.departmentIds);
  }

  if (Object.keys(body).length > 0) {
    await campaiRequest(`crm/contacts/${contact._id}`, {
      method: "POST",
      body,
    });
  }

  // Zurückgegeben wird, was Campai danach wirklich führt — nicht, was wir
  // geschickt haben.
  const fresh = await campaiRequest<RawContact>(
    `crm/contacts/${contact._id}`,
    { method: "GET" },
  );

  return toProfile(fresh ?? contact);
};
