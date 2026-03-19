import type { SupabaseClient, User } from "@supabase/supabase-js";

import { normalizeUserRole, type UserRole } from "@/lib/roles";

export type UserAccess = {
  userId: string;
  role: UserRole;
  rights: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

const SELECT_FIELDS = ["user_id", "role", "rights", "created_at", "updated_at"].join(", ");

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const parseRights = (value: unknown) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  return [] as string[];
};

const mapUserAccessRow = (row: Record<string, unknown>): UserAccess | null => {
  const userId = normalizeText(row.user_id);
  if (!userId) {
    return null;
  }

  return {
    userId,
    role: normalizeUserRole(row.role),
    rights: parseRights(row.rights),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
};

export const getUserRightsFromAppMetadata = (
  user: Pick<User, "app_metadata"> | null | undefined,
) => parseRights(user?.app_metadata?.rights);

export const getUserAccessByUserId = async (
  client: SupabaseClient,
  userId: string,
) : Promise<UserAccess | null> => {
  const { data, error } = await client
    .from("user_access")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapUserAccessRow(data as unknown as Record<string, unknown>);
};

export const listUserAccessByUserIds = async (
  client: SupabaseClient,
  userIds: string[],
) : Promise<Map<string, UserAccess>> => {
  if (userIds.length === 0) {
    return new Map<string, UserAccess>();
  }

  const { data, error } = await client
    .from("user_access")
    .select(SELECT_FIELDS)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .map((row) => mapUserAccessRow(row as unknown as Record<string, unknown>))
      .filter((row): row is UserAccess => Boolean(row))
      .map((row) => [row.userId, row]),
  );
};

export const upsertUserAccess = async (
  client: SupabaseClient,
  params: {
    userId: string;
    role: UserRole;
    rights: string[];
  },
) : Promise<UserAccess> => {
  const { data, error } = await client
    .from("user_access")
    .upsert(
      {
        user_id: params.userId,
        role: params.role,
        rights: parseRights(params.rights),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    throw error;
  }

  const mapped = mapUserAccessRow(data as unknown as Record<string, unknown>);
  if (!mapped) {
    throw new Error("User access could not be mapped after upsert.");
  }

  return mapped;
};

export const syncUserAccessToAuthMetadata = async (
  adminClient: SupabaseClient,
  user: Pick<User, "id" | "app_metadata">,
  access: Pick<UserAccess, "rights">,
) => {
  const { error } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      rights: parseRights(access.rights),
    },
  });

  if (error) {
    throw error;
  }
};