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
  preferences?: MemberProfilePreferences | null;
};

export type MemberProfileFormDefaultValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export type MemberProfilePreferences = {
  balance?: {
    costCenter2?: string[];
    columns?: {
      order?: string[];
      hidden?: string[];
    };
  };
  formDefaults?: Record<string, Record<string, MemberProfileFormDefaultValue>>;
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
  preferences: MemberProfilePreferences;
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
  "preferences",
];

const SELECT_FIELDS = EXTENDED_SELECT_FIELDS.join(", ");

const LEGACY_SELECT_FIELDS = BASE_SELECT_FIELDS.join(", ");

const hasMissingExtendedMemberProfileColumn = (error: unknown) => {
  return (
    isMissingColumnError(error, "avatar_url", "member_profiles") ||
    isMissingColumnError(error, "short_bio", "member_profiles") ||
    isMissingColumnError(error, "preferences", "member_profiles")
  );
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

const normalizeFormDefaultValue = (
  value: unknown,
): MemberProfileFormDefaultValue | null => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeFormDefaultValue(entry))
      .filter(
        (
          entry,
        ): entry is string | number | boolean | null =>
          entry === null ||
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean",
      );
  }

  return null;
};

export const normalizeMemberProfilePreferences = (
  value: unknown,
): MemberProfilePreferences => {
  if (!isPlainObject(value)) {
    return {};
  }

  const normalized: MemberProfilePreferences = {};

  if (isPlainObject(value.balance)) {
    const balance: NonNullable<MemberProfilePreferences["balance"]> = {};

    const costCenter2 = normalizeSegments(value.balance.costCenter2);
    if (costCenter2.length > 0) {
      balance.costCenter2 = costCenter2;
    }

    if (isPlainObject(value.balance.columns)) {
      const order = normalizeSegments(value.balance.columns.order);
      const hidden = normalizeSegments(value.balance.columns.hidden);

      if (order.length > 0 || hidden.length > 0) {
        balance.columns = {
          ...(order.length > 0 ? { order } : {}),
          ...(hidden.length > 0 ? { hidden } : {}),
        };
      }
    }

    if (Object.keys(balance).length > 0) {
      normalized.balance = balance;
    }
  }

  if (isPlainObject(value.formDefaults)) {
    const formDefaults = Object.fromEntries(
      Object.entries(value.formDefaults)
        .map(([formKey, formValue]) => {
          if (!isPlainObject(formValue)) {
            return null;
          }

          const normalizedEntries = Object.fromEntries(
            Object.entries(formValue)
              .map(([fieldKey, fieldValue]) => {
                const normalizedValue = normalizeFormDefaultValue(fieldValue);
                return normalizedValue === null && fieldValue !== null
                  ? null
                  : [fieldKey, normalizedValue];
              })
              .filter(
                (
                  entry,
                ): entry is [string, MemberProfileFormDefaultValue] =>
                  Boolean(entry),
              ),
          );

          if (Object.keys(normalizedEntries).length === 0) {
            return null;
          }

          return [formKey, normalizedEntries];
        })
        .filter(
          (
            entry,
          ): entry is [
            string,
            Record<string, MemberProfileFormDefaultValue>,
          ] => Boolean(entry),
        ),
    );

    if (Object.keys(formDefaults).length > 0) {
      normalized.formDefaults = formDefaults;
    }
  }

  return normalized;
};

export const mergeMemberProfilePreferences = (
  current: MemberProfilePreferences | null | undefined,
  patch: MemberProfilePreferences | null | undefined,
): MemberProfilePreferences => {
  const base = normalizeMemberProfilePreferences(current);
  const incoming = normalizeMemberProfilePreferences(patch);

  const nextFormDefaults = {
    ...(base.formDefaults ?? {}),
    ...Object.fromEntries(
      Object.entries(incoming.formDefaults ?? {}).map(([formKey, defaults]) => [
        formKey,
        {
          ...(base.formDefaults?.[formKey] ?? {}),
          ...defaults,
        },
      ]),
    ),
  };

  return {
    ...base,
    ...incoming,
    ...(incoming.balance
      ? {
          balance: {
            ...(base.balance ?? {}),
            ...incoming.balance,
            ...(incoming.balance.columns
              ? {
                  columns: {
                    ...(base.balance?.columns ?? {}),
                    ...incoming.balance.columns,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(Object.keys(nextFormDefaults).length > 0
      ? { formDefaults: nextFormDefaults }
      : {}),
  };
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
    preferences: normalizeMemberProfilePreferences(row.preferences),
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
        preferences: normalizeMemberProfilePreferences(profile.preferences),
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
    preferences: profile.preferences,
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

  merged.preferences = profile.preferences;

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

export const upsertMemberProfilePreferences = async (
  client: SupabaseClient,
  userId: string,
  preferences: MemberProfilePreferences,
): Promise<MemberProfile> => {
  const existingProfile = await getMemberProfileByUserId(client, userId);

  return upsertMemberProfile(client, userId, {
    campai_contact_id: existingProfile?.campaiContactId ?? null,
    campai_member_number: existingProfile?.campaiMemberNumber ?? null,
    campai_debtor_account: existingProfile?.campaiDebtorAccount ?? null,
    campai_segments: existingProfile?.campaiSegments ?? [],
    campai_name: existingProfile?.campaiName ?? null,
    avatar_url: existingProfile?.avatarUrl ?? null,
    short_bio: existingProfile?.shortBio ?? null,
    preferences,
  });
};
