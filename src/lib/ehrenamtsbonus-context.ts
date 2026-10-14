import type { SupabaseClient } from "@supabase/supabase-js";

import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import { fetchCampaiMembership } from "@/lib/campai-member-tariff";
import type { AccessLevel } from "@/lib/ehrenamtsbonus";
import { getMemberProfileByUserId } from "@/lib/member-profiles";

export type EhrenamtsbonusContext = {
  access: AccessLevel;
};

export const ACCESS_BY_TARIFF: Record<CampaiAccessTariff, AccessLevel> = {
  abo_gross: "abo_gross",
  abo_klein: "abo_klein",
  punktekarte: "punktekarte",
  keiner: "keine_karte",
};

export const resolveEhrenamtsbonusContext = async (
  client: SupabaseClient,
  userId: string,
): Promise<EhrenamtsbonusContext> => {
  const profile = await getMemberProfileByUserId(client, userId).catch(
    () => null,
  );

  // Fällt Campai aus oder fehlt die Verknüpfung, bleibt der Antrag stellbar:
  // der Zugang fällt dann auf die unterste Stufe zurück. Gebraucht wird nur
  // der Tarif — also nur die Verträge, nicht der Kontakt samt Saldo.
  const contactId = profile?.campaiContactId?.trim();
  const membership = contactId
    ? await fetchCampaiMembership(contactId).catch(() => null)
    : null;

  return { access: ACCESS_BY_TARIFF[membership?.tariff ?? "keiner"] };
};
