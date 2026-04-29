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

export const buildCampaiBookingTags = (user: User): string[] => {
  const displayName = getCampaiBookingDisplayName(user);
  return ["API", displayName];
};