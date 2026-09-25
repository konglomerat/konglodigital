import type { SupabaseClient } from "@supabase/supabase-js";

import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import { fetchCampaiMembership } from "@/lib/campai-member-tariff";
import { fetchCampaiTariffPrices } from "@/lib/campai-plans";
import type { AccessLevel, TariffPrices } from "@/lib/ehrenamtsbonus";
import { FALLBACK_TARIFF_PRICES } from "@/lib/ehrenamtsbonus";
import { getMemberProfileByUserId } from "@/lib/member-profiles";

export type EhrenamtsbonusContext = {
  access: AccessLevel;
  /** Die heutigen Tarifpreise aus Campai, sonst die Rückfallwerte. */
  prices: TariffPrices;
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
  // der Zugang fällt dann auf die unterste Stufe zurück, die Preise auf die
  // Rückfallwerte. Gebraucht wird nur der Tarif — also nur die Verträge,
  // nicht der Kontakt samt Saldo.
  const contactId = profile?.campaiContactId?.trim();
  const [membership, prices] = await Promise.all([
    contactId
      ? fetchCampaiMembership(contactId).catch(() => null)
      : Promise.resolve(null),
    fetchCampaiTariffPrices().catch(() => null),
  ]);

  return {
    access: ACCESS_BY_TARIFF[membership?.tariff ?? "keiner"],
    prices: prices ?? FALLBACK_TARIFF_PRICES,
  };
};
