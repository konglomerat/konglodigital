type UserLike = {
  id?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

const parseRights = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

export const hasRight = (user: UserLike | null | undefined, right: string) => {
  if (!user) {
    return false;
  }
  const appRights = parseRights(user.app_metadata?.rights);
  const userRights = parseRights(user.user_metadata?.rights);
  return new Set([...appRights, ...userRights]).has(right);
};
