import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/supabase-errors";

export type MemberProfileInput = {
  campai_contact_id: string | null;
  campai_member_number: string | null;
  campai_debtor_account: number | null;
  campai_segments: string[];
  campai_name: string | null;
};

export type MemberProfile = {
  userId: string;
  campaiContactId: string | null;
  campaiMemberNumber: string | null;
  campaiDebtorAccount: number | null;
  campaiSegments: string[];
  campaiName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const SELECT_FIELDS = [
  "user_id",
  "campai_contact_id",
  "campai_member_number",
  "campai_debtor_account",
  "campai_segments",
  "campai_name",
  "created_at",
  "updated_at",
].join(", ");

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

const mapMemberProfileRow = (row: Record<string, unknown>): MemberProfile | null => {
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
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
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
  };
};

export const getMemberProfileByUserId = async (
  client: SupabaseClient,
  userId: string,
) : Promise<MemberProfile | null> => {
  const { data, error } = await client
    .from("member_profiles")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

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
) : Promise<Map<string, MemberProfile>> => {
  if (userIds.length === 0) {
    return new Map<string, MemberProfile>();
  }

  const { data, error } = await client
    .from("member_profiles")
    .select(SELECT_FIELDS)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .map((row) => mapMemberProfileRow(row as unknown as Record<string, unknown>))
      .filter((row): row is MemberProfile => Boolean(row))
      .map((row) => [row.userId, row]),
  );
};

export const upsertMemberProfile = async (
  client: SupabaseClient,
  userId: string,
  profile: MemberProfileInput,
) : Promise<MemberProfile> => {
  const { data, error } = await client
    .from("member_profiles")
    .upsert(
      {
        user_id: userId,
        campai_contact_id: normalizeText(profile.campai_contact_id),
        campai_member_number: normalizeText(profile.campai_member_number),
        campai_debtor_account: normalizeInteger(profile.campai_debtor_account),
        campai_segments: normalizeSegments(profile.campai_segments),
        campai_name: normalizeText(profile.campai_name),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    throw error;
  }

  const mapped = mapMemberProfileRow(data as unknown as Record<string, unknown>);
  if (!mapped) {
    throw new Error("Member profile could not be mapped after upsert.");
  }

  return mapped;
};