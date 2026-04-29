import type { User } from "@supabase/supabase-js";

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const getCampaiBookingDisplayName = (user: User): string => {
  return normalizeText(user.user_metadata?.campai_name) ?? "";
};

export const mergeCampaiTags = (...tagGroups: Array<Array<string | null | undefined>>): string[] => {
  const seen = new Set<string>();

  for (const group of tagGroups) {
    for (const value of group) {
      const normalized = normalizeText(value);
      if (!normalized) {
        continue;
      }
      seen.add(normalized);
    }
  }

  return [...seen];
};

export const buildCampaiBookingTags = (
  user: User,
  extraTags: Array<string | null | undefined> = [],
): string[] => {
  const displayName = getCampaiBookingDisplayName(user);
  return mergeCampaiTags(["API", displayName], extraTags);
};