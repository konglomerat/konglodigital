// Zahlen an Navigationspunkten (offene/neue Einträge) — dieselben für die
// Leiste (VerwaltungShell) und die Kacheln (RessortPage).
import "server-only";

import { cache } from "react";

import { can } from "@/lib/access/access";
import { countOpenApplications } from "@/lib/membership-applications/store";
import { getServerAccess } from "@/lib/server-session";

/**
 * Zahl je Ziel (href ohne Sprache). Fehlt eine Zahl (kein Recht, keine
 * Tabelle, Fehler), bleibt der Punkt ohne. Einmal je Anfrage geladen.
 */
export const loadNavBadges = cache(async (): Promise<Record<string, number>> => {
  const access = await getServerAccess();
  const openApplications = can(access, "members.onboarding")
    ? await countOpenApplications().catch(() => null)
    : null;
  return {
    ...(openApplications ? { "/admin/vorstand/antraege": openApplications } : {}),
  };
});
