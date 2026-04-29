type UserLike = {
  id?: string;
  app_metadata?: Record<string, unknown>;
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
  return new Set(appRights).has(right);
};

export const getResourceEditPermissionError = ({
  hasEditRight,
  isOwner,
}: {
  hasEditRight: boolean;
  isOwner: boolean;
}) => {
  if (hasEditRight || isOwner) {
    return null;
  }

  return "You cannot edit this resource because you are not the owner and your account is missing the resources:edit permission.";
};
