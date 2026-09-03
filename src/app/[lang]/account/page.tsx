// src/app/[lang]/account/page.tsx — Server-Hülle: Kopfdaten (Name, E-Mail,
// Rollen, Avatar) kommen komplett aus Supabase, damit der Client nichts mehr
// nachladen muss, bevor Header und Abmelden-Button stehen.
//
// Wichtig für die gefühlte Geschwindigkeit: Hier wird ausschliesslich Supabase
// befragt (Session, user_access, member_profiles) — kein Campai. Der frühere
// Live-Namensabgleich lief über eine seitenweise Suche durch alle Campai-
// Kontakte und hing damit vor dem Header. Er sitzt jetzt hinter
// /api/account/campai-name und läuft erst nach dem ersten Paint.
import { Suspense } from "react";

import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { ROLE_LABELS } from "@/lib/roles";
import {
  getServerSession,
  getServerSessionRoles,
} from "@/lib/server-session";
import AccountClient from "./AccountClient";
import AccountSkeleton from "./AccountSkeleton";

async function AccountContent() {
  // Session und Rollen teilt sich die Seite über React-`cache` mit dem
  // Layout — hier fällt dafür kein zusätzlicher Supabase-Aufruf mehr an.
  const { supabase, user } = await getServerSession();

  if (!user) {
    return <AccountClient roleLabels={[]} initialUser={null} />;
  }

  // Rollen und Profil hängen nicht voneinander ab — parallel spart einen
  // kompletten Roundtrip vor dem Header.
  const [userRoles, memberProfile] = await Promise.all([
    getServerSessionRoles(),
    getMemberProfileByUserId(supabase, user.id),
  ]);

  return (
    <AccountClient
      roleLabels={userRoles.map((role) => ROLE_LABELS[role])}
      initialUser={{
        email: user.email ?? "",
        metadata: mergeUserMetadataWithMemberProfile(
          user.user_metadata ?? {},
          memberProfile,
        ),
      }}
    />
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountContent />
    </Suspense>
  );
}
