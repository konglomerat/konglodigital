// Profilansicht einer Person: ihre Rollen mit Geltungsbereich, plus Vergabe.
// Nur mit access.manage.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canManageAccess } from "@/lib/access/access";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import AccessGuard from "../../AccessGuard";
import SubPageTitle from "../../SubPageTitle";
import UserRolesManager from "./UserRolesManager";

type UserProfilePageProps = {
  params: Promise<{ userId: string }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profil",
};

async function UserProfile({ userId }: { userId: string }) {
  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) {
    notFound();
  }

  const profile = await getMemberProfileByUserId(adminClient, userId).catch(
    () => null,
  );
  const metadataName = [
    data.user.user_metadata?.first_name,
    data.user.user_metadata?.last_name,
  ]
    .filter((part): part is string => typeof part === "string" && !!part)
    .join(" ");
  const name = profile?.campaiName || metadataName || data.user.email || userId;

  return (
    <div className="flex flex-col gap-6">
      <SubPageTitle
        ressort="admin"
        backHref="/admin/users"
        title={name}
        subTitle={`${data.user.email ?? ""} — Rollen und Geltungsbereiche`}
      />
      <UserRolesManager userId={userId} />
    </div>
  );
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { userId } = await params;

  return (
    <AccessGuard check={canManageAccess}>
      <UserProfile userId={decodeURIComponent(userId)} />
    </AccessGuard>
  );
}
