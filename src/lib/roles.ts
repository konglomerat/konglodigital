import type { SupabaseClient, User } from "@supabase/supabase-js";

export const USER_ROLES = ["admin", "accounting", "member"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const MODULE_ACCESS: Record<string, readonly UserRole[]> = {
  admin: ["admin"],
  invoices: ["admin", "accounting"],
};

export type AppModule = keyof typeof MODULE_ACCESS;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  accounting: "Accounting",
  member: "Member",
};

export const normalizeUserRole = (value: unknown): UserRole => {
  if (typeof value !== "string") {
    return "member";
  }

  const normalized = value.trim().toLowerCase();
  return USER_ROLES.includes(normalized as UserRole)
    ? (normalized as UserRole)
    : "member";
};

export const getUserRole = async (
  client: SupabaseClient,
  user: Pick<User, "id"> | null | undefined,
): Promise<UserRole> => {
  if (!user) {
    return "member";
  }

  const { data, error } = await client
    .from("user_access")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeUserRole(data?.role);
};

export const roleCanAccessModule = (role: UserRole, module: AppModule) =>
  MODULE_ACCESS[module].includes(role);

export const userCanAccessModule = (
  client: SupabaseClient,
  user: Pick<User, "id"> | null | undefined,
  module: AppModule,
) =>
  getUserRole(client, user).then((role) => roleCanAccessModule(role, module));

export const getInitialUserRole = (tags: string[]): UserRole =>
  tags.some((tag) => tag.trim().toLowerCase() === "vorstand")
    ? "admin"
    : "member";