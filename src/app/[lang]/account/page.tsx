// src/app/[lang]/account/page.tsx — Server-Hülle: Kopfdaten (Name, E-Mail,
// Rollen, Avatar) kommen komplett aus Supabase, damit der Client nichts mehr
// nachladen muss, bevor Header und Abmelden-Button stehen.
//
// Wichtig für die gefühlte Geschwindigkeit: Hier wird ausschliesslich Supabase
// befragt (Session, role_assignments, member_profiles) — kein Campai. Kontakt und
// Verträge lädt der Client nach dem ersten Paint über
// /api/account/campai-profile.
import { Suspense } from "react";

import { findActiveRequest, listOwnRequests } from "@/lib/ehrenamtsbonus";
import {
  getMemberProfileByUserId,
  mergeUserMetadataWithMemberProfile,
} from "@/lib/member-profiles";
import { listScopes } from "@/lib/access/assignments";
import { describeAssignment } from "@/lib/access/labels";
import { getServerAccess, getServerSession } from "@/lib/server-session";
import AccountClient from "./AccountClient";
import AccountSkeleton from "./AccountSkeleton";

async function AccountContent() {
  // Die Session teilt sich die Seite über React-`cache` mit dem Layout — hier
  // fällt dafür kein zusätzlicher Supabase-Aufruf mehr an.
  const { supabase, user } = await getServerSession();

  if (!user) {
    return (
      <AccountClient roleLabels={[]} initialUser={null} activeBonus={null} />
    );
  }

  // Zuweisungen, Profil und Ehrenamtsbonus hängen nicht voneinander ab —
  // parallel spart einen kompletten Roundtrip vor dem Header. Fehlt die
  // Bonus-Tabelle noch, kommt die Liste leer zurück statt zu brechen.
  const [access, scopes, memberProfile, bonusRequests] = await Promise.all([
    getServerAccess(),
    listScopes(supabase),
    getMemberProfileByUserId(supabase, user.id),
    listOwnRequests(supabase, user.id),
  ]);

  return (
    <AccountClient
      roleLabels={(access?.assignments ?? []).map((assignment) =>
        describeAssignment(assignment, scopes),
      )}
      activeBonus={findActiveRequest(bonusRequests)}
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
