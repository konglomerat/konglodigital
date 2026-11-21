// Zahlen an Navigationspunkten (offene/neue Einträge) — dieselben für die
// Leiste (VerwaltungShell) und die Kacheln (RessortPage).
import "server-only";

import { cache } from "react";

import { can } from "@/lib/access/access";
import { EHRENAMTSBONUS_TABLE } from "@/lib/ehrenamtsbonus";
import { countOpenApplications } from "@/lib/membership-applications/store";
import { getServerAccess } from "@/lib/server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Ehrenamtsbonus-Anträge, über die der Vorstand noch entscheiden muss. */
const countOpenEhrenamtsbonus = async () => {
  const { count, error } = await createSupabaseAdminClient()
    .from(EHRENAMTSBONUS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "in_review");
  if (error) throw error;
  return count ?? 0;
};

/**
 * Zahl je Ziel (href ohne Sprache). Fehlt eine Zahl (kein Recht, keine
 * Tabelle, Fehler), bleibt der Punkt ohne. Einmal je Anfrage geladen.
 */
export const loadNavBadges = cache(async (): Promise<Record<string, number>> => {
  const access = await getServerAccess();
  const [openApplications, openEhrenamtsbonus] = await Promise.all([
    can(access, "members.onboarding") ? countOpenApplications().catch(() => null) : null,
    can(access, "ehrenamtsbonus.manage") ? countOpenEhrenamtsbonus().catch(() => null) : null,
  ]);
  return {
    ...(openApplications ? { "/admin/vorstand/antraege": openApplications } : {}),
    ...(openEhrenamtsbonus ? { "/admin/vorstand/ehrenamtsbonus": openEhrenamtsbonus } : {}),
  };
});
