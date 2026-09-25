// Das Debitorenkonto des angemeldeten Mitglieds — die einzige Grenze, die
// Belege voneinander trennt. Es wird immer serverseitig aus dem Campai-Kontakt
// bestimmt und nie aus einer Anfrage übernommen: sonst könnte jedes Mitglied
// mit einer fremden Kontonummer fremde Belege abrufen.
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchCampaiContactProfile } from "@/lib/campai-contact-profile";
import { getMemberProfileByUserId } from "@/lib/member-profiles";

/** `null`, wenn das Konto mit keinem Campai-Debitor verknüpft ist. */
export const fetchOwnDebtorAccount = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> => {
  const memberProfile = await getMemberProfileByUserId(supabase, userId);
  const contact = await fetchCampaiContactProfile(
    memberProfile?.campaiContactId,
  );
  return contact?.debtor?.account ?? null;
};
