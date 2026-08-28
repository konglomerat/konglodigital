import { cache } from "react";

import { getUserRoles, type UserRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Layout und Seite rendern im selben Request und brauchen beide Session und
// Rollen. Ohne Dedupe sind das vier Round-Trips zu Supabase, bevor irgendein
// Kopf steht. React-`cache` hält Client, User und Rollen für die Dauer eines
// Requests fest — jeder Aufruf danach ist gratis.
export const getServerSession = cache(async () => {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

export const getServerSessionRoles = cache(async (): Promise<UserRole[]> => {
  const { supabase, user } = await getServerSession();
  return getUserRoles(supabase, user);
});
