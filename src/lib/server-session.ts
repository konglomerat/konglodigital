import { cache } from "react";

import type { UserAccess } from "@/lib/access/access";
import { applyAccessPreview, loadAccessOf } from "@/lib/access/server";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Layout und Seite rendern im selben Request und brauchen beide Session und
// Zuweisungen. Ohne Dedupe sind das mehrere Round-Trips zu Supabase, bevor
// irgendein Kopf steht. React-`cache` hält Client, User und Zuweisungen für
// die Dauer eines Requests fest — jeder Aufruf danach ist gratis.
export const getServerSession = cache(async () => {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** Das eigene Mitgliedsprofil, einmal pro Request — `null` ohne Login. */
export const getServerMemberProfile = cache(async () => {
  const { supabase, user } = await getServerSession();
  if (!user) return null;
  return getMemberProfileByUserId(supabase, user.id).catch(() => null);
});

/** Die echten Zuweisungen, ohne Rechte-Vorschau — etwa um sie zu beenden. */
export const getServerRealAccess = cache(
  async (): Promise<UserAccess | null> => {
    const { supabase, user } = await getServerSession();
    return loadAccessOf(supabase, user);
  },
);

// Baut auf getServerRealAccess auf: die Zuweisungen werden pro Request nur
// einmal abgefragt, auch wenn das Layout beide braucht.
export const getServerAccess = cache(async (): Promise<UserAccess | null> => {
  const { user } = await getServerSession();
  return applyAccessPreview(user, await getServerRealAccess());
});
