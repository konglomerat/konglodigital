import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

type ContactInviteStatus = "pending" | "invited" | "active";

type AuthSummary = {
  status: ContactInviteStatus;
  invitedAt: string | null;
  userId: string | null;
};

const buildAuthSummariesByEmail = async (): Promise<Map<string, AuthSummary>> => {
  const adminClient = createSupabaseAdminClient();
  const summaries = new Map<string, AuthSummary>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw error;
    }
    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email) {
        continue;
      }
      const isActive = Boolean(
        user.email_confirmed_at || user.last_sign_in_at,
      );
      const invitedAtCandidate =
        (user as { invited_at?: string | null }).invited_at ??
        user.created_at ??
        null;
      summaries.set(email, {
        status: isActive ? "active" : "invited",
        invitedAt: invitedAtCandidate,
        userId: user.id,
      });
    }
    if (users.length < 1000) {
      break;
    }
  }
  return summaries;
};

export const GET = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [contacts, authSummariesByEmail] = await Promise.all([
      listAllActiveCampaiContacts(),
      buildAuthSummariesByEmail(),
    ]);

    const rows = contacts
      .map((contact) => {
        const authSummary = contact.email
          ? authSummariesByEmail.get(contact.email.trim().toLowerCase())
          : undefined;
        return {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          memberNumber: contact.memberNumber,
          balance: contact.balance,
          tags: contact.tags,
          types: contact.types,
          entryAt: contact.entryAt,
          inviteStatus: (authSummary?.status ?? "pending") as ContactInviteStatus,
          invitedAt: authSummary?.invitedAt ?? null,
          userId: authSummary?.userId ?? null,
        };
      })
      .sort((left, right) => {
        const leftTime = left.entryAt ? Date.parse(left.entryAt) : NaN;
        const rightTime = right.entryAt ? Date.parse(right.entryAt) : NaN;
        const leftValid = Number.isFinite(leftTime);
        const rightValid = Number.isFinite(rightTime);
        if (leftValid && rightValid) {
          return rightTime - leftTime;
        }
        if (leftValid) return -1;
        if (rightValid) return 1;
        return left.name.localeCompare(right.name, "de-DE");
      });

    return NextResponse.json({ contacts: rows });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Campai-Kontakte konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export type CampaiMemberContact = {
  id: string;
  name: string;
  email: string | null;
  memberNumber: string | null;
  debtorAccount: number | null;
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

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim().replace(",", "."));
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

const extractLegacyDate = (value: unknown): string | null => {
  if (typeof value === "string") {
    return toStringValue(value);
  }
  const record = toRecord(value);
  return record ? toStringValue(record.$date) : null;
};

const normalizeCampaiLegacyContact = (
  record: Record<string, unknown>,
): CampaiMemberContact | null => {
  const idRecord = toRecord(record._id);
  const id = toStringValue(idRecord?.$oid) ?? toStringValue(record._id);
  const personal = toRecord(record.personal);
  const name =
    toStringValue(personal?.humanName) ??
    toStringValue(personal?.addressName) ??
    toStringValue(personal?.name);

  if (!id || !name) {
    return null;
  }

  const membership = toRecord(record.membership);
  const billing = toRecord(record.billing);
  const communication = toRecord(record.communication);

  return {
    id,
    name,
    email: toStringValue(communication?.email)?.toLowerCase() ?? null,
    memberNumber: toStringValue(membership?.number),
    debtorAccount: toInteger(billing?.debtorNumber),
    balance: toNumberValue(billing?.balance),
    segments: toStringArray(record.segments),
    tags: toStringArray(record.tags),
    types: toStringArray(record.type),
    entryAt: extractLegacyDate(membership?.enterDate),
    exitAt: extractLegacyDate(membership?.leaveDate),
    terminatedAt: extractLegacyDate(membership?.terminationDate),
  };
};

const isActiveCampaiContact = (contact: CampaiMemberContact) => {
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

const CAMPAI_LEGACY_PAGE_SIZE = 100;

const fetchCampaiLegacyContactsPage = async (params: {
  limit: number;
  skip: number;
}) => {
  const apiKey = requiredEnv("CAMPAI_API_LEGACY_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");

  const url = new URL("https://api.campai.com/contacts");
  url.searchParams.set("organisation", organizationId);
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("skip", String(params.skip));

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: apiKey },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "Campai legacy contacts could not be loaded.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const rawList = Array.isArray(payload) ? payload : [];

  return rawList
    .map((entry) => {
      const record = toRecord(entry);
      return record ? normalizeCampaiLegacyContact(record) : null;
    })
    .filter((entry): entry is CampaiMemberContact => Boolean(entry));
};

const findCampaiContact = async (
  predicate: (contact: CampaiMemberContact) => boolean,
) => {
  for (let skip = 0; skip < 10000; skip += CAMPAI_LEGACY_PAGE_SIZE) {
    const contacts = await fetchCampaiLegacyContactsPage({
      limit: CAMPAI_LEGACY_PAGE_SIZE,
      skip,
    });

    const match = contacts.find(predicate);
    if (match) {
      return match;
    }
    if (contacts.length < CAMPAI_LEGACY_PAGE_SIZE) {
      return null;
    }
  }
  return null;
};

export const listAllActiveCampaiContacts = async () => {
  const collected: CampaiMemberContact[] = [];
  const seen = new Set<string>();

  for (let skip = 0; skip < 10000; skip += CAMPAI_LEGACY_PAGE_SIZE) {
    const contacts = await fetchCampaiLegacyContactsPage({
      limit: CAMPAI_LEGACY_PAGE_SIZE,
      skip,
    });

    for (const contact of contacts) {
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      if (isActiveCampaiContact(contact)) {
        collected.push(contact);
      }
    }

    if (contacts.length < CAMPAI_LEGACY_PAGE_SIZE) {
      break;
    }
  }

  return collected;
};

export const getCampaiActiveMemberContactByEmail = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return findCampaiContact(
    (contact) =>
      contact.email === normalizedEmail &&
      contact.types.some((type) => type.toLowerCase() === "member") &&
      isActiveCampaiContact(contact),
  );
};

export const getCampaiActiveContactByEmail = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return findCampaiContact(
    (contact) =>
      contact.email === normalizedEmail && isActiveCampaiContact(contact),
  );
};

export const getCampaiActiveMemberContactById = async (contactId: string) => {
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    return null;
  }

  return findCampaiContact(
    (contact) =>
      contact.id === normalizedId &&
      contact.types.some((type) => type.toLowerCase() === "member") &&
      isActiveCampaiContact(contact),
  );
};

export const getCampaiMemberContactById = async (contactId: string) => {
  const normalizedId = contactId.trim();
  if (!normalizedId) {
    return null;
  }
  return findCampaiContact((contact) => contact.id === normalizedId);
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

export const buildCampaiProfileData = (contact: CampaiMemberContact) => ({
  campai_contact_id: contact.id,
  campai_member_number: contact.memberNumber,
  campai_debtor_account: contact.debtorAccount,
  campai_segments: contact.segments,
  campai_name: contact.name,
  avatar_url: null,
  short_bio: null,
});
