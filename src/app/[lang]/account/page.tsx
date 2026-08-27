// src/app/[lang]/account/page.tsx — Server-Hülle: Rollen kommen aus der
// Session, damit die Profil-Bereiche dieselben Gates nutzen wie die Nav.
// Auth- und API-Wege bleiben unverändert.
//
// Wichtig für die gefühlte Geschwindigkeit: Die Seite selbst wartet auf
// nichts. Der Rollen-Lookup steckt in einer eigenen async-Komponente hinter
// <Suspense>, damit Next die Hülle sofort streamt und die Navigation nicht
// mehr auf Supabase wartet.
import { Suspense } from "react";

import { getUserRoles, ROLE_LABELS } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AccountClient from "./AccountClient";
import AccountSkeleton from "./AccountSkeleton";

async function AccountContent() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const userRoles = await getUserRoles(supabase, userData.user);

  return (
    <AccountClient roleLabels={userRoles.map((role) => ROLE_LABELS[role])} />
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountContent />
    </Suspense>
  );
}
