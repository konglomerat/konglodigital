import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Der Campai-Name steht verlässlich nur in `member_profiles.campai_name` —
// dorthin schreibt das Verknüpfen in /admin/users. `user_metadata.campai_name`
// gibt es nur noch bei alten Konten und ist bloß der Rückfall — fürs Anzeigen.
// Für Berechtigungen taugt er nicht: Nutzer-Metadaten kann jede Person selbst
// ändern.
export const getCampaiBookingDisplayName = (
  user: User,
  profileName?: string | null,
): string => {
  return (
    normalizeText(profileName) ??
    normalizeText(user.user_metadata?.campai_name) ??
    ""
  );
};

/** Wie oben, holt den Namen aber selbst aus dem Mitgliedsprofil. */
export const loadCampaiBookingDisplayName = async (
  user: User,
  client: SupabaseClient = createSupabaseAdminClient(),
): Promise<string> => {
  const profile = await getMemberProfileByUserId(client, user.id).catch(
    () => null,
  );
  return getCampaiBookingDisplayName(user, profile?.campaiName);
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