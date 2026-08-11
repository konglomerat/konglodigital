import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  isMissingColumnError,
  isMissingRelationError,
} from "@/lib/supabase-errors";

export const USER_ROLES = ["admin", "vhc", "buchhaltung", "member"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const MODULE_ACCESS = {
  admin: ["admin"],
  volkshaus: ["admin", "vhc"],
  invoices: ["admin", "buchhaltung"],
} as const satisfies Record<string, readonly UserRole[]>;

export type AppModule = keyof typeof MODULE_ACCESS;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  vhc: "VHC",
  buchhaltung: "Buchhaltung",
  member: "Mitglied",
};

const ROLE_ALIASES: Record<string, UserRole> = {
  accounting: "buchhaltung",
};

const normalizeRoleValue = (value: unknown): UserRole | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized in ROLE_ALIASES) return ROLE_ALIASES[normalized];
  return USER_ROLES.includes(normalized as UserRole)
    ? (normalized as UserRole)
    : null;
};

export const normalizeUserRole = (value: unknown): UserRole =>
  normalizeRoleValue(value) ?? "member";

export const normalizeUserRoles = (value: unknown): UserRole[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const roles = Array.from(
    new Set(
      values
        .map(normalizeRoleValue)
        .filter((role): role is UserRole => Boolean(role)),
    ),
  );
  return roles.length > 0 ? roles : ["member"];
};

export const getLegacyUserRole = (roles: readonly UserRole[]) => {
  if (roles.includes("admin")) return "admin" as const;
  if (roles.includes("buchhaltung")) return "accounting" as const;
  return "member" as const;
};

const getMetadataRoles = (
  user:
    | (Pick<User, "id"> & { app_metadata?: User["app_metadata"] })
    | null
    | undefined,
) =>
  normalizeUserRoles(
    user?.app_metadata?.roles ?? user?.app_metadata?.role ?? "member",
  );

export const getUserRoles = async (
  client: SupabaseClient,
  user:
    | (Pick<User, "id"> & { app_metadata?: User["app_metadata"] })
    | null
    | undefined,
): Promise<UserRole[]> => {
  if (!user) return ["member"];

  const { data, error } = await client
    .from("user_access")
    .select("roles, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "user_access")) {
      return getMetadataRoles(user);
    }
    if (isMissingColumnError(error, "roles", "user_access")) {
      const legacyResult = await client
        .from("user_access")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (legacyResult.error) throw legacyResult.error;
      return normalizeUserRoles(
        legacyResult.data?.role ??
          user.app_metadata?.roles ??
          user.app_metadata?.role,
      );
    }
    throw error;
  }

  return data
    ? normalizeUserRoles(data.roles ?? data.role)
    : getMetadataRoles(user);
};

export const rolesCanAccessModule = (
  roles: readonly UserRole[],
  module: AppModule,
) => MODULE_ACCESS[module].some((role) => roles.includes(role));

export const userHasRole = (
  client: SupabaseClient,
  user: Pick<User, "id"> | null | undefined,
  role: UserRole,
) => getUserRoles(client, user).then((roles) => roles.includes(role));

export const userCanAccessModule = (
  client: SupabaseClient,
  user: Pick<User, "id"> | null | undefined,
  module: AppModule,
) =>
  getUserRoles(client, user).then((roles) =>
    rolesCanAccessModule(roles, module),
  );

export const getInitialUserRoles = (tags: string[]): UserRole[] =>
  tags.some((tag) => tag.trim().toLowerCase() === "vorstand")
    ? ["admin"]
    : ["member"];
