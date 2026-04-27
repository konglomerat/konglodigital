import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingColumnError,
  isMissingRelationError,
} from "@/lib/supabase-errors";

export type MemberProfileInput = {
  campai_contact_id: string | null;
  campai_member_number: string | null;
  campai_debtor_account: number | null;
  campai_segments: string[];
  campai_name: string | null;
  avatar_url: string | null;
  short_bio: string | null;
};

export type MemberProfile = {
  userId: string;
  campaiContactId: string | null;
  campaiMemberNumber: string | null;
  campaiDebtorAccount: number | null;
  campaiSegments: string[];
  campaiName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const BASE_SELECT_FIELDS = [
  "user_id",
  "campai_contact_id",
  "campai_member_number",
  "campai_debtor_account",
  "campai_segments",
  "campai_name",
  "created_at",
  "updated_at",
];

const EXTENDED_SELECT_FIELDS = [
  ...BASE_SELECT_FIELDS,
  "avatar_url",
  "short_bio",
];

const SELECT_FIELDS = EXTENDED_SELECT_FIELDS.join(", ");

const LEGACY_SELECT_FIELDS = BASE_SELECT_FIELDS.join(", ");

const hasMissingExtendedMemberProfileColumn = (error: unknown) => {
  return (
    isMissingColumnError(error, "avatar_url", "member_profiles") ||
    isMissingColumnError(error, "short_bio", "member_profiles")
  );
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeSegments = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
};

const mapMemberProfileRow = (
  row: Record<string, unknown>,
): MemberProfile | null => {
  const userId = normalizeText(row.user_id);
  if (!userId) {
    return null;
  }

  return {
    userId,
    campaiContactId: normalizeText(row.campai_contact_id),
    campaiMemberNumber: normalizeText(row.campai_member_number),
    campaiDebtorAccount: normalizeInteger(row.campai_debtor_account),
    campaiSegments: normalizeSegments(row.campai_segments),
    campaiName: normalizeText(row.campai_name),
    avatarUrl: normalizeText(row.avatar_url),
    shortBio: normalizeText(row.short_bio),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
};

const selectMemberProfileByUserId = async (
  client: SupabaseClient,
  userId: string,
  selectFields: string,
) => {
  return client
    .from("member_profiles")
    .select(selectFields)
    .eq("user_id", userId)
    .maybeSingle();
};

const selectMemberProfilesByUserIds = async (
  client: SupabaseClient,
  userIds: string[],
  selectFields: string,
) => {
  return client
    .from("member_profiles")
    .select(selectFields)
    .in("user_id", userIds);
};

const buildUpsertPayload = (
  userId: string,
  profile: MemberProfileInput,
  includeExtendedFields: boolean,
) => ({
  user_id: userId,
  campai_contact_id: normalizeText(profile.campai_contact_id),
  campai_member_number: normalizeText(profile.campai_member_number),
  campai_debtor_account: normalizeInteger(profile.campai_debtor_account),
  campai_segments: normalizeSegments(profile.campai_segments),
  campai_name: normalizeText(profile.campai_name),
  ...(includeExtendedFields
    ? {
        avatar_url: normalizeText(profile.avatar_url),
        short_bio: normalizeText(profile.short_bio),
      }
    : {}),
  updated_at: new Date().toISOString(),
});

const upsertMemberProfileRow = async (
  client: SupabaseClient,
  userId: string,
  profile: MemberProfileInput,
  includeExtendedFields: boolean,
  selectFields: string,
) => {
  return client
    .from("member_profiles")
    .upsert(buildUpsertPayload(userId, profile, includeExtendedFields), {
      onConflict: "user_id",
    })
    .select(selectFields)
    .single();
};

export const memberProfileToMetadata = (profile: MemberProfile | null) => {
  if (!profile) {
    return {};
  }

  return {
    campai_contact_id: profile.campaiContactId,
    campai_member_number: profile.campaiMemberNumber,
    campai_debtor_account: profile.campaiDebtorAccount,
    campai_segments: profile.campaiSegments,
    campai_name: profile.campaiName,
    avatar_url: profile.avatarUrl,
    short_bio: profile.shortBio,
  };
};

export const mergeUserMetadataWithMemberProfile = (
  userMetadata: Record<string, unknown> | null | undefined,
  profile: MemberProfile | null,
) => {
  const merged = {
    ...(userMetadata ?? {}),
  } as Record<string, unknown>;

  if (!profile) {
    return merged;
  }

  merged.campai_contact_id = profile.campaiContactId;
  merged.campai_member_number = profile.campaiMemberNumber;
  merged.campai_debtor_account = profile.campaiDebtorAccount;
  merged.campai_segments = profile.campaiSegments;
  merged.campai_name = profile.campaiName;

  if (!normalizeText(merged.avatar_url) && profile.avatarUrl) {
    merged.avatar_url = profile.avatarUrl;
  }

  if (!normalizeText(merged.short_bio) && profile.shortBio) {
    merged.short_bio = profile.shortBio;
  }

  return merged;
};

export const getMemberProfileByUserId = async (
  client: SupabaseClient,
  userId: string,
): Promise<MemberProfile | null> => {
  let { data, error } = await selectMemberProfileByUserId(
    client,
    userId,
    SELECT_FIELDS,
  );

  if (error && hasMissingExtendedMemberProfileColumn(error)) {
    ({ data, error } = await selectMemberProfileByUserId(
      client,
      userId,
      LEGACY_SELECT_FIELDS,
    ));
  }

  if (error) {
    if (isMissingRelationError(error, "member_profiles")) {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  return mapMemberProfileRow(data as unknown as Record<string, unknown>);
};

export const listMemberProfilesByUserIds = async (
  client: SupabaseClient,
  userIds: string[],
): Promise<Map<string, MemberProfile>> => {
  if (userIds.length === 0) {
    return new Map<string, MemberProfile>();
  }

  let { data, error } = await selectMemberProfilesByUserIds(
    client,
    userIds,
    SELECT_FIELDS,
  );

  if (error && hasMissingExtendedMemberProfileColumn(error)) {
    ({ data, error } = await selectMemberProfilesByUserIds(
      client,
      userIds,
      LEGACY_SELECT_FIELDS,
    ));
  }

  if (error) {
    if (isMissingRelationError(error, "member_profiles")) {
      return new Map<string, MemberProfile>();
    }

    throw error;
  }

  return new Map(
    (data ?? [])
      .map((row) =>
        mapMemberProfileRow(row as unknown as Record<string, unknown>),
      )
      .filter((row): row is MemberProfile => Boolean(row))
      .map((row) => [row.userId, row]),
  );
};

export const upsertMemberProfile = async (
  client: SupabaseClient,
  userId: string,
  profile: MemberProfileInput,
): Promise<MemberProfile> => {
  let { data, error } = await upsertMemberProfileRow(
    client,
    userId,
    profile,
    true,
    SELECT_FIELDS,
  );

  if (error && hasMissingExtendedMemberProfileColumn(error)) {
    ({ data, error } = await upsertMemberProfileRow(
      client,
      userId,
      profile,
      false,
      LEGACY_SELECT_FIELDS,
    ));
  }

  if (error) {
    throw error;
  }

  const mapped = mapMemberProfileRow(
    data as unknown as Record<string, unknown>,
  );
  if (!mapped) {
    throw new Error("Member profile could not be mapped after upsert.");
  }

  return mapped;
};
