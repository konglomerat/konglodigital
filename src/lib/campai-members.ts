export type CampaiMemberContact = {
  id: string;
  name: string;
  email: string | null;
  memberNumber: string | null;
  debtorAccount: number | null;
  segments: string[];
  tags: string[];
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

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const CAMP_AI_MEMBER_PAGE_SIZE = 100;

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

const toStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const direct = toStringValue(entry);
        if (direct) {
          return direct;
        }

        const record = toRecord(entry);
        if (!record) {
          return null;
        }

        return (
          toStringValue(record.name) ??
          toStringValue(record.label) ??
          toStringValue(record.value) ??
          toStringValue(record.slug)
        );
      })
      .filter((entry): entry is string => Boolean(entry));
  }

  const direct = toStringValue(value);
  return direct ? [direct] : [];
};

const extractContacts = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> =>
      Boolean(toRecord(entry)),
    );
  }

  const record = toRecord(payload);
  if (!record) {
    return [];
  }

  const candidates = [
    record.contacts,
    record.items,
    record.members,
    record.data,
    record.result,
    record.rows,
    record.docs,
    toRecord(record.data)?.contacts,
    toRecord(record.data)?.items,
    toRecord(record.data)?.members,
    toRecord(record.result)?.contacts,
    toRecord(record.result)?.items,
    toRecord(record.result)?.members,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is Record<string, unknown> =>
        Boolean(toRecord(entry)),
      );
    }
  }

  return [];
};

const extractTotalCount = (payload: unknown): number | null => {
  const record = toRecord(payload);
  if (!record) {
    return null;
  }

  const candidates = [
    record.count,
    record.total,
    record.totalCount,
    record.returnCount,
    toRecord(record.data)?.count,
    toRecord(record.data)?.total,
    toRecord(record.data)?.totalCount,
    toRecord(record.result)?.count,
    toRecord(record.result)?.total,
    toRecord(record.result)?.totalCount,
    toRecord(record.pagination)?.count,
    toRecord(record.pagination)?.total,
    toRecord(record.pagination)?.totalCount,
  ];

  for (const candidate of candidates) {
    const parsed = toInteger(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const extractEmail = (record: Record<string, unknown>): string | null => {
  const directCandidates = [
    record.email,
    record.emailAddress,
    toRecord(record.contact)?.email,
    toRecord(record.contactInfo)?.email,
    toRecord(record.communication)?.email,
    toRecord(record.communication)?.emailAddress,
  ];

  for (const candidate of directCandidates) {
    const value = toStringValue(candidate);
    if (value) {
      return value.toLowerCase();
    }
  }

  const emailLists = [
    record.emails,
    toRecord(record.contact)?.emails,
    toRecord(record.contactInfo)?.emails,
    toRecord(record.communication)?.emails,
  ];

  for (const emailList of emailLists) {
    if (!Array.isArray(emailList)) {
      continue;
    }

    for (const entry of emailList) {
      const direct = toStringValue(entry);
      if (direct) {
        return direct.toLowerCase();
      }

      const emailRecord = toRecord(entry);
      if (!emailRecord) {
        continue;
      }

      const nested =
        toStringValue(emailRecord.email) ??
        toStringValue(emailRecord.address) ??
        toStringValue(emailRecord.value);

      if (nested) {
        return nested.toLowerCase();
      }
    }
  }

  return null;
};

const normalizeCampaiMemberContact = (
  record: Record<string, unknown>,
): CampaiMemberContact | null => {
  const id = toStringValue(record._id) ?? toStringValue(record.id);
  const name =
    toStringValue(record.name) ??
    toStringValue(record.displayName) ??
    toStringValue(record.fullName);

  if (!id || !name) {
    return null;
  }

  const contactNumbersSort = toRecord(record.contactNumbersSort);
  const debtor = toRecord(record.debtor);

  return {
    id,
    name,
    email: extractEmail(record),
    memberNumber:
      toStringValue(contactNumbersSort?.member) ??
      toStringValue(toRecord(record.contactNumbers)?.member),
    debtorAccount: toInteger(debtor?.account),
    segments: toStringArray(record.segments),
    tags: toStringArray(record.tags),
  };
};

const fetchCampaiMemberContactsPage = async (params: {
  searchTerm?: string;
  limit?: number;
  offset?: number;
}) => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/crm/contacts/list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        types: ["member"],
        returnCount: true,
        segments: ["members"],
        limit: params.limit ?? CAMP_AI_MEMBER_PAGE_SIZE,
        offset: params.offset ?? 0,
        ...(params.searchTerm ? { searchTerm: params.searchTerm } : {}),
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "Campai contacts could not be loaded.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const contacts = extractContacts(payload)
    .map((entry) => normalizeCampaiMemberContact(entry))
    .filter((entry): entry is CampaiMemberContact => Boolean(entry));

  return {
    contacts,
    totalCount: extractTotalCount(payload),
  };
};

export const searchCampaiMemberContacts = async (params: {
  searchTerm: string;
  limit?: number;
  offset?: number;
}) => {
  const searchTerm = params.searchTerm.trim();
  if (searchTerm.length < 2) {
    return { contacts: [], totalCount: 0 };
  }

  return fetchCampaiMemberContactsPage({
    searchTerm,
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
  });
};

export const splitCampaiContactName = (name: string): CampaiNameParts => {
  const normalizedName = name.trim().split(/\s+/).filter(Boolean);

  if (normalizedName.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (normalizedName.length === 1) {
    return { firstName: normalizedName[0], lastName: "" };
  }

  return {
    firstName: normalizedName[0],
    lastName: normalizedName.slice(1).join(" "),
  };
};

export const buildCampaiProfileData = (contact: CampaiMemberContact) => ({
  campai_contact_id: contact.id,
  campai_member_number: contact.memberNumber,
  campai_debtor_account: contact.debtorAccount,
  campai_segments: contact.segments,
  campai_name: contact.name,
  avatar_url: null,
  short_bio: null,
});

export const getCampaiActiveMemberContactByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  for (let offset = 0; offset < 4000; offset += CAMP_AI_MEMBER_PAGE_SIZE) {
    const { contacts, totalCount } = await fetchCampaiMemberContactsPage({
      limit: CAMP_AI_MEMBER_PAGE_SIZE,
      offset,
    });

    const match = contacts.find(
      (contact) =>
        contact.email === normalizedEmail &&
        contact.segments.some(
          (segment) => segment.trim().toLowerCase() === "members",
        ),
    );

    if (match) {
      return match;
    }

    if (contacts.length < CAMP_AI_MEMBER_PAGE_SIZE) {
      return null;
    }

    if (
      typeof totalCount === "number" &&
      offset + CAMP_AI_MEMBER_PAGE_SIZE >= totalCount
    ) {
      return null;
    }
  }

  return null;
};

export const getCampaiMemberContactById = async (contactId: string) => {
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    return null;
  }

  const pageSize = CAMP_AI_MEMBER_PAGE_SIZE;

  for (let offset = 0; offset < 4000; offset += pageSize) {
    const { contacts, totalCount } = await fetchCampaiMemberContactsPage({
      limit: pageSize,
      offset,
    });

    const match = contacts.find((contact) => contact.id === normalizedId);
    if (match) {
      return match;
    }

    if (contacts.length < pageSize) {
      return null;
    }

    if (typeof totalCount === "number" && offset + pageSize >= totalCount) {
      return null;
    }
  }

  return null;
};

export const hasCampaiTag = (contact: CampaiMemberContact, tag: string) => {
  const normalizedTag = tag.trim().toLocaleLowerCase("de-DE");
  return contact.tags.some(
    (entry) => entry.toLocaleLowerCase("de-DE") === normalizedTag,
  );
};
