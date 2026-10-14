// Aktive Konten mit Anzeigenamen — für Personenauswahl bei Vergabe und
// Rechte-Vorschau. Nur mit dem Service-Client aufrufen.
import type { SupabaseClient } from "@supabase/supabase-js";

import { listMemberProfilesByUserIds } from "@/lib/member-profiles";

export type AccessPerson = {
  id: string;
  email: string;
  name: string;
};

export const listPeople = async (
  adminClient: SupabaseClient,
): Promise<AccessPerson[]> => {
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;

  const users = (data.users ?? []).filter((user) =>
    Boolean(user.email_confirmed_at || user.last_sign_in_at),
  );
  const profiles = await listMemberProfilesByUserIds(
    adminClient,
    users.map((user) => user.id),
  );

  return users
    .map((user) => {
      const metadataName = [
        user.user_metadata?.first_name,
        user.user_metadata?.last_name,
      ]
        .filter((part): part is string => typeof part === "string" && !!part)
        .join(" ");
      return {
        id: user.id,
        email: user.email ?? "",
        name:
          profiles.get(user.id)?.campaiName || metadataName || user.email || "",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
};
