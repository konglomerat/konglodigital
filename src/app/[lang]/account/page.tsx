// src/app/[lang]/account/page.tsx — Server-Hülle: Rollen kommen aus der
// Session, damit die Profil-Bereiche dieselben Gates nutzen wie die Nav.
// Auth- und API-Wege bleiben unverändert.
import { Suspense } from "react";

import { getUserRoles, rolesCanAccessModule, ROLE_LABELS } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AccountClient from "./AccountClient";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);
  const userRoles = await getUserRoles(supabase, userData.user);

  const canAccessAdmin =
    isAuthenticated && rolesCanAccessModule(userRoles, "admin");
  const canAccessVolkshaus =
    isAuthenticated && rolesCanAccessModule(userRoles, "volkshaus");
  const canAccessFinanzen =
    isAuthenticated && rolesCanAccessModule(userRoles, "invoices");

  return (
    <Suspense fallback={null}>
      <AccountClient
        canAccessBackOffice={canAccessAdmin || canAccessVolkshaus}
        canAccessFinanzen={canAccessFinanzen}
        backOfficeHref={canAccessAdmin ? "/admin/users" : "/admin/volkshaus"}
        roleLabels={userRoles.map((role) => ROLE_LABELS[role])}
      />
    </Suspense>
  );
}
