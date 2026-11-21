import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

/**
 * Anträge sieht und bearbeitet, wer members.onboarding hat (Rolle Vorstand).
 * Liefert den Namen für den Verlauf — oder die Fehlerantwort.
 */
export const authorizeApplications = async (
  request: NextRequest,
): Promise<{ actor: string } | { response: NextResponse }> => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(await loadUserAccess(supabase, data.user), "members.onboarding")) {
    return { response: NextResponse.json({ error: "Kein Zugriff" }, { status: 403 }) };
  }
  // Das eigene Profil darf die Session lesen.
  const profile = await getMemberProfileByUserId(supabase, data.user.id).catch(() => null);
  return { actor: profile?.campaiName || data.user.email || "Vorstand" };
};

/** Supabase-Fehler sind keine `Error`-Instanzen, tragen aber eine `message`. */
export const messageOf = (error: unknown) =>
  error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : null;

export const errorResponse = (error: unknown, fallback: string, status = 500) =>
  NextResponse.json(
    { error: messageOf(error) ? `${fallback} (${messageOf(error)})` : fallback },
    { status },
  );
