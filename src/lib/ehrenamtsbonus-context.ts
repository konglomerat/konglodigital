// Die beiden Werte, die im Antragskopf read-only stehen: der Zugang, über den
// die Entscheidungsmatrix läuft, und der offene Beitrag als Information für
// den Vorstand.
//
// Nur der Zugang wird beim Einreichen in den Antrag geschrieben — ein Antrag
// muss auch dann noch zeigen, was er ausgelöst hätte, wenn das Mitglied
// inzwischen den Tarif gewechselt hat. Der offene Betrag dagegen wird nie
// gespeichert: er kommt bei jeder Ansicht frisch aus Campai, weil ein
// gespeicherter Stand schon am nächsten Tag falsch wäre.
//
// Beides stammt aus dem CRM-Kontakt (siehe campai-member-tariff). Diese Datei
// übersetzt nur noch: Campai-Tarif → `AccessLevel` des Features.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import { fetchCampaiMemberSnapshot } from "@/lib/campai-member-tariff";
import type { AccessLevel } from "@/lib/ehrenamtsbonus";
import { getMemberProfileByUserId } from "@/lib/member-profiles";

export type EhrenamtsbonusContext = {
  access: AccessLevel;
  /** Offener Beitrag in Cent, positiv = schuldet dem Verein. `null` = unbekannt. */
  openBalanceCents: number | null;
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

  // Fällt Campai aus oder fehlt die Mitgliedsnummer, bleibt der Antrag
  // stellbar: dann steht im Kopf „nicht abrufbar" statt einer erfundenen Null,
  // und der Zugang fällt auf die unterste Stufe zurück.
  const snapshot = await fetchCampaiMemberSnapshot(
    profile?.campaiMemberNumber,
  ).catch(() => null);

  return {
    access: ACCESS_BY_TARIFF[snapshot?.tariff ?? "keiner"],
    openBalanceCents: snapshot?.openBalanceCents ?? null,
  };
};
